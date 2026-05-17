import { query } from '../db.js';
import logger from '../logger.js';
import config from '../config.js';
import { sendTelegramMessage, buildBrokenLinkMessage } from './telegram-service.js';

// In-memory dedup: don't re-notify the same broken product more than once per 4h
const NOTIFY_COOLDOWN_MS = 4 * 60 * 60 * 1000;
const _notifiedAt = new Map();
function _shouldNotify(productId) {
  const last = _notifiedAt.get(productId);
  return !last || Date.now() - last > NOTIFY_COOLDOWN_MS;
}
function _markNotified(productId) { _notifiedAt.set(productId, Date.now()); }

async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkHealthBot/1.0)' },
    });
    // Some servers (e.g. Shopee) reject HEAD — retry with GET
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkHealthBot/1.0)' },
      });
    }
    clearTimeout(tid);
    return { ok: res.status < 400, status: res.status };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

export async function checkAllLinks() {
  const result = await query(`
    SELECT
      p.id,
      p.title        AS product_title,
      p.affiliate_url,
      p.short_path,
      p.marketplace,
      p.position,
      p.domain_id,
      d.hostname     AS domain_hostname,
      v.title        AS campaign_title,
      v.platform,
      pr.id          AS profile_id,
      pr.name        AS profile_name,
      pr.telegram_bot_token,
      pr.telegram_chat_id
    FROM products p
    LEFT JOIN domains  d  ON d.id  = p.domain_id
    LEFT JOIN videos   v  ON v.id  = p.video_id
    LEFT JOIN profiles pr ON pr.id = v.profile_id
    WHERE p.affiliate_url IS NOT NULL AND p.affiliate_url <> ''
    ORDER BY p.id
  `);

  const products = result.rows;
  const brokenItems = [];
  const allResults = [];

  for (const p of products) {
    const check = await checkUrl(p.affiliate_url);
    allResults.push({
      id: p.id,
      title: p.product_title,
      campaign: p.campaign_title ?? '',
      marketplace: p.marketplace ?? '',
      position: p.position ?? '',
      url: p.affiliate_url,
      ok: check.ok,
      status: check.status,
    });

    if (!check.ok) {
      logger.info({ event: 'link.broken', productId: p.id, url: p.affiliate_url, httpStatus: check.status });
      brokenItems.push({ id: p.id, url: p.affiliate_url, status: check.status });

      const hasCredentials = !!(p.telegram_bot_token && p.telegram_chat_id);
      logger.info({ event: 'link.broken.notify_check', productId: p.id, hasCredentials, cooldownActive: hasCredentials && !_shouldNotify(p.id) });

      if (hasCredentials && _shouldNotify(p.id)) {
        const base = p.domain_hostname
          ? `https://${p.domain_hostname}`
          : config.app.publicBaseUrl;
        const shortUrl = `${base}/r/${p.short_path}`;

        const msg = buildBrokenLinkMessage({
          campaignTitle: p.campaign_title ?? p.product_title,
          platform: p.platform,
          marketplace: p.marketplace,
          profileName: p.profile_name,
          shortUrl,
        });

        const sent = await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg);
        if (sent) _markNotified(p.id);
      }
    }
  }

  return { checked: products.length, broken: brokenItems.length, brokenItems, allResults };
}

export async function checkLinksForVideo(videoId) {
  const result = await query(`
    SELECT
      p.id,
      p.title        AS product_title,
      p.affiliate_url,
      p.short_path,
      p.marketplace,
      p.position,
      p.domain_id,
      d.hostname     AS domain_hostname,
      v.title        AS campaign_title,
      v.platform,
      pr.telegram_bot_token,
      pr.telegram_chat_id,
      pr.name        AS profile_name
    FROM products p
    LEFT JOIN domains  d  ON d.id  = p.domain_id
    LEFT JOIN videos   v  ON v.id  = p.video_id
    LEFT JOIN profiles pr ON pr.id = v.profile_id
    WHERE p.video_id = $1
      AND p.affiliate_url IS NOT NULL AND p.affiliate_url <> ''
    ORDER BY p.id
  `, [videoId]);

  const products = result.rows;
  const results = [];

  for (const p of products) {
    const check = await checkUrl(p.affiliate_url);
    if (!check.ok && p.telegram_bot_token && p.telegram_chat_id) {
      const base = p.domain_hostname
        ? `https://${p.domain_hostname}`
        : config.app.publicBaseUrl;
      const msg = buildBrokenLinkMessage({
        campaignTitle: p.campaign_title ?? p.product_title,
        platform: p.platform,
        marketplace: p.marketplace,
        profileName: p.profile_name,
        shortUrl: `${base}/r/${p.short_path}`,
      });
      await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg);
    }
    results.push({
      id: p.id,
      title: p.product_title,
      position: p.position,
      marketplace: p.marketplace,
      url: p.affiliate_url,
      ok: check.ok,
      status: check.status,
    });
  }

  return { checked: products.length, broken: results.filter(r => !r.ok).length, results };
}
