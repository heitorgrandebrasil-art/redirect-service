import { query } from '../db.js';
import { getSettingJson, setSettingJson } from './settings-service.js';
import { orchestrateCheck } from './link-orchestrator.js';
import {
  sendTelegramMessage,
  buildBrokenLinkMessage,
  buildInlineKeyboard,
} from './telegram-service.js';
import config from '../config.js';
import logger from '../logger.js';

// Tier thresholds (monthly clicks)
const TIER_HOT      = 50;
const TIER_WARM     = 10;
const TIER_COLD_MIN = 1;

// Days between checks per tier
const CHECK_INTERVAL = {
  hot:      [3, 5],   // random between 3-5 days
  warm:     [7, 10],  // random between 7-10 days
  cold:     [28, 31], // ~monthly
  inactive: null,     // never
};

const DAILY_LIMIT_DEFAULT = 100;

// Active hours: 8h–22h Brasília (UTC-3)
const ACTIVE_HOUR_START = 8;
const ACTIVE_HOUR_END   = 22;

// Minutes between individual checks (random 3–8 min)
const MIN_GAP_MS =  3 * 60 * 1000;
const MAX_GAP_MS =  8 * 60 * 1000;

function randBetween(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function daysToMs(days) { return days * 24 * 60 * 60 * 1000; }

function isActiveHour() {
  const nowBrasilia = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hour = nowBrasilia.getUTCHours();
  return hour >= ACTIVE_HOUR_START && hour < ACTIVE_HOUR_END;
}

function msUntilActiveHour() {
  const nowMs = Date.now();
  const nowBrasilia = new Date(nowMs - 3 * 60 * 60 * 1000);
  const hour = nowBrasilia.getUTCHours();
  if (hour >= ACTIVE_HOUR_START && hour < ACTIVE_HOUR_END) return 0;
  // minutes until 08:00 Brasília
  const minutesUntil8 = hour >= ACTIVE_HOUR_END
    ? (24 - hour + ACTIVE_HOUR_START) * 60 - nowBrasilia.getUTCMinutes()
    : (ACTIVE_HOUR_START - hour) * 60 - nowBrasilia.getUTCMinutes();
  return minutesUntil8 * 60 * 1000;
}

function tierForClicks(clicks) {
  if (clicks >= TIER_HOT)      return 'hot';
  if (clicks >= TIER_WARM)     return 'warm';
  if (clicks >= TIER_COLD_MIN) return 'cold';
  return 'inactive';
}

function nextCheckDelay(tier) {
  const range = CHECK_INTERVAL[tier];
  if (!range) return null;
  return daysToMs(randBetween(range[0], range[1]));
}

async function recalculatePriorities() {
  const cycleMonth = new Date().toISOString().slice(0, 7);
  const prevMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);

  const result = await query(`
    SELECT p.id,
           COALESCE(c.clicks, 0) AS monthly_clicks
    FROM products p
    LEFT JOIN (
      SELECT r.product_id, COUNT(rc.id) AS clicks
      FROM redirects r
      JOIN redirect_clicks rc ON rc.redirect_id = r.id
      WHERE rc.clicked_at >= date_trunc('month', now() - interval '1 month')
        AND rc.clicked_at <  date_trunc('month', now())
      GROUP BY r.product_id
    ) c ON c.product_id = p.id
    WHERE p.affiliate_url IS NOT NULL AND p.affiliate_url <> ''
      AND p.monitoring_enabled = true
  `);

  for (const row of result.rows) {
    const tier = tierForClicks(Number(row.monthly_clicks));
    const delay = nextCheckDelay(tier);
    const nextCheckAt = delay ? new Date(Date.now() + delay).toISOString() : null;
    await query(
      `UPDATE products SET priority_tier = $2, monthly_clicks = $3, next_check_at = $4, priority_recalculated_at = now() WHERE id = $1`,
      [row.id, tier, row.monthly_clicks, nextCheckAt]
    );
  }

  logger.info({ event: 'scheduler.priorities.recalculated', cycleMonth, prevMonth, total: result.rows.length });
}

async function checkNewProducts() {
  // Products without a next_check_at (newly added) get an initial check now
  const result = await query(`
    SELECT id, affiliate_url, marketplace, link_status
    FROM products
    WHERE next_check_at IS NULL
      AND affiliate_url IS NOT NULL AND affiliate_url <> ''
      AND monitoring_enabled = true
      AND priority_recalculated_at IS NULL
    LIMIT 20
  `);
  for (const p of result.rows) {
    await runSingleCheck(p);
    // After initial check, assign tier based on 0 clicks (cold)
    const delay = nextCheckDelay('cold');
    const nextCheckAt = delay ? new Date(Date.now() + delay).toISOString() : null;
    await query(
      `UPDATE products SET priority_tier = 'cold', next_check_at = $2, priority_recalculated_at = now() WHERE id = $1`,
      [p.id, nextCheckAt]
    );
    await new Promise((r) => setTimeout(r, randBetween(MIN_GAP_MS, MAX_GAP_MS)));
  }
}

async function runSingleCheck(p) {
  try {
    const check = await orchestrateCheck(p.id, p.affiliate_url, p.marketplace);
    await query(`UPDATE products SET link_last_checked_at = now(), link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);

    if (!check.ok) {
      if (check.humanReview) {
        if (p.link_status !== 'human_review') {
          await query(`UPDATE products SET link_status = 'human_review' WHERE id = $1`, [p.id]);
        }
      } else {
        if (p.link_status !== 'broken') {
          await query(`UPDATE products SET link_status = 'broken', link_broken_at = now() WHERE id = $1`, [p.id]);
          await sendBrokenAlert(p);
        }
      }
    } else {
      if (p.link_status !== 'ok' && p.link_status !== 'unknown') {
        await query(`UPDATE products SET link_status = 'ok', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`, [p.id]);
      } else if (p.link_status === 'unknown') {
        await query(`UPDATE products SET link_status = 'ok' WHERE id = $1`, [p.id]);
      }
    }
  } catch (err) {
    logger.error({ event: 'scheduler.check.error', productId: p.id, error: err.message });
  }
}

async function sendBrokenAlert(p) {
  if (!p.telegram_bot_token || !p.telegram_chat_id) return;
  if (p.awaiting_confirmation) return;
  const isSnoozed = p.snoozed_until && new Date(p.snoozed_until) > new Date();
  if (isSnoozed) return;

  const base = p.domain_hostname ? `https://${p.domain_hostname}` : config.app.publicBaseUrl;
  const shortUrl = `${base}/r/${p.short_path}`;
  const msg = buildBrokenLinkMessage({
    campaignTitle: p.campaign_title ?? p.product_title,
    platform: p.platform,
    marketplace: p.marketplace,
    profileName: p.profile_name,
    shortUrl,
  });
  const sent = await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg, buildInlineKeyboard(p.id));
  if (sent) await query(`UPDATE products SET awaiting_confirmation = true WHERE id = $1`, [p.id]);
}

async function runPriorityBatch(cfg) {
  const dailyLimit = cfg.daily_limit ?? DAILY_LIMIT_DEFAULT;
  const cycleMonth = new Date().toISOString().slice(0, 7);

  // Count how many have been checked today already
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const checkedToday = await query(
    `SELECT COUNT(*) AS cnt FROM products WHERE link_last_checked_at >= $1`,
    [todayStart.toISOString()]
  );
  const alreadyChecked = Number(checkedToday.rows[0].cnt);
  const remaining = Math.max(0, dailyLimit - alreadyChecked);
  if (remaining === 0) {
    logger.info({ event: 'scheduler.daily_limit_reached', dailyLimit });
    return;
  }

  // Fetch due products (not inactive), ordered by tier priority then next_check_at
  const result = await query(`
    SELECT
      p.id, p.affiliate_url, p.marketplace, p.link_status, p.priority_tier,
      p.short_path, p.awaiting_confirmation, p.snoozed_until,
      p.domain_id, d.hostname AS domain_hostname,
      p.title AS product_title,
      v.title AS campaign_title, v.platform,
      pr.telegram_bot_token, pr.telegram_chat_id, pr.name AS profile_name
    FROM products p
    LEFT JOIN domains d ON d.id = p.domain_id
    LEFT JOIN videos v ON v.id = p.video_id
    LEFT JOIN profiles pr ON pr.id = v.profile_id
    WHERE p.affiliate_url IS NOT NULL AND p.affiliate_url <> ''
      AND p.monitoring_enabled = true
      AND p.priority_tier != 'inactive'
      AND (p.next_check_at IS NULL OR p.next_check_at <= now())
    ORDER BY
      CASE p.priority_tier WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 ELSE 3 END,
      p.next_check_at NULLS FIRST
    LIMIT $1
  `, [remaining]);

  if (result.rows.length === 0) {
    logger.info({ event: 'scheduler.no_due_links' });
    return;
  }

  // Alternate ML → Amazon → ML → Amazon within each priority group
  const hotLinks  = result.rows.filter((r) => r.priority_tier === 'hot');
  const warmLinks = result.rows.filter((r) => r.priority_tier === 'warm');
  const coldLinks = result.rows.filter((r) => r.priority_tier === 'cold');

  const interleaved = [
    ...interleaveMarketplaces(shuffle(hotLinks)),
    ...interleaveMarketplaces(shuffle(warmLinks)),
    ...interleaveMarketplaces(shuffle(coldLinks)),
  ];

  logger.info({ event: 'scheduler.batch.start', count: interleaved.length, cycleMonth });

  for (const p of interleaved) {
    if (!isActiveHour()) {
      const wait = msUntilActiveHour();
      logger.info({ event: 'scheduler.waiting_active_hours', resumeInMs: wait });
      await new Promise((r) => setTimeout(r, wait));
    }

    await runSingleCheck(p);

    // Reschedule this product
    const delay = nextCheckDelay(p.priority_tier);
    if (delay) {
      const nextAt = new Date(Date.now() + delay).toISOString();
      await query(`UPDATE products SET next_check_at = $2 WHERE id = $1`, [p.id, nextAt]);
    }

    // Random gap between checks
    const gap = randBetween(MIN_GAP_MS, MAX_GAP_MS);
    await new Promise((r) => setTimeout(r, gap));
  }

  logger.info({ event: 'scheduler.batch.done', checked: interleaved.length });
}

function interleaveMarketplaces(products) {
  const ml     = products.filter((p) => p.marketplace === 'mercadolivre');
  const amazon = products.filter((p) => p.marketplace === 'amazon');
  const other  = products.filter((p) => p.marketplace !== 'mercadolivre' && p.marketplace !== 'amazon');

  const result = [];
  const maxLen = Math.max(ml.length, amazon.length);
  for (let i = 0; i < maxLen; i++) {
    if (ml[i])     result.push(ml[i]);
    if (amazon[i]) result.push(amazon[i]);
  }
  return [...result, ...other];
}

const DEFAULTS = { enabled: false, frequency_hours: 24, daily_limit: DAILY_LIMIT_DEFAULT, last_run: null };

class LinkScheduler {
  constructor() { this._timer = null; }

  async reload() {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }

    let cfg;
    try { cfg = (await getSettingJson('link_monitor')) ?? DEFAULTS; }
    catch (err) { logger.warn({ event: 'scheduler.settings.error', error: err.message }); return; }

    if (!cfg.enabled) { logger.info({ event: 'scheduler.disabled' }); return; }

    const delay = this._nextDelay(cfg);
    logger.info({ event: 'scheduler.scheduled', nextRunAt: new Date(Date.now() + delay).toISOString() });

    this._timer = setTimeout(async () => {
      this._timer = null;
      logger.info({ event: 'scheduler.running' });
      try {
        const now = new Date();
        const isFirstOfMonth = now.getDate() === 1;

        if (isFirstOfMonth) {
          const recalcKey = `priority_recalc_${now.toISOString().slice(0, 7)}`;
          const alreadyDone = await getSettingJson(recalcKey);
          if (!alreadyDone) {
            await recalculatePriorities();
            await setSettingJson(recalcKey, { done: true });
          }
        }

        await checkNewProducts();
        await runPriorityBatch(cfg);

        const current = (await getSettingJson('link_monitor')) ?? DEFAULTS;
        await setSettingJson('link_monitor', { ...current, last_run: new Date().toISOString() });
      } catch (err) {
        logger.error({ event: 'scheduler.run.error', error: err.message });
      }
      await this.reload();
    }, delay);
  }

  _nextDelay({ frequency_hours, last_run }) {
    const freqMs = frequency_hours * 60 * 60 * 1000;
    const now = Date.now();
    if (last_run) {
      const next = new Date(last_run).getTime() + freqMs;
      if (next > now) return next - now;
    }
    return 5_000;
  }

  stop() { if (this._timer) { clearTimeout(this._timer); this._timer = null; } }
}

export const linkScheduler = new LinkScheduler();
