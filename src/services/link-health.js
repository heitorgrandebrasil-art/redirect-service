import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { query } from '../db.js';
import logger from '../logger.js';
import config from '../config.js';
import {
  sendTelegramMessage,
  buildBrokenLinkMessage,
  buildInlineKeyboard,
} from './telegram-service.js';
import { orchestrateCheck } from './link-orchestrator.js';

const SCREENSHOT_DIR = '/tmp/screenshots';

async function cleanOldScreenshots() {
  try {
    const files = await readdir(SCREENSHOT_DIR).catch(() => []);
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    await Promise.allSettled(
      files.map(async (f) => {
        const fp = `${SCREENSHOT_DIR}/${f}`;
        const st = await stat(fp).catch(() => null);
        if (st && st.mtime.getTime() < cutoff) await unlink(fp).catch(() => {});
      })
    );
  } catch {}
}

export async function checkAllLinks() {
  cleanOldScreenshots().catch(() => {});
  const result = await query(`
    SELECT
      p.id,
      p.title        AS product_title,
      p.affiliate_url,
      p.short_path,
      p.marketplace,
      p.position,
      p.link_status,
      p.awaiting_confirmation,
      p.snoozed_until,
      p.domain_id,
      d.hostname     AS domain_hostname,
      d.prefix       AS domain_prefix,
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
      AND p.monitoring_enabled = true
    ORDER BY p.id
  `);

  const products = result.rows;
  const brokenItems = [];
  const allResults = [];

  for (const p of products) {
    let check;
    try {
      check = await orchestrateCheck(p.id, p.affiliate_url, p.marketplace);
    } catch (err) {
      // orchestrateCheck já captura internamente, mas como defesa extra:
      logger.error({ event: 'link.check.unexpected', productId: p.id, error: err.message });
      check = { ok: false, status: 0, humanReview: true };
    }

    await query(`UPDATE products SET link_last_checked_at = now(), link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);

    allResults.push({
      id: p.id,
      title: p.product_title,
      campaign: p.campaign_title ?? '',
      marketplace: p.marketplace ?? '',
      position: p.position ?? '',
      url: p.affiliate_url,
      ok: check.ok,
      status: check.status,
      humanReview: check.humanReview ?? false,
    });

    if (!check.ok) {
      if (check.humanReview) {
        if (p.link_status !== 'human_review') {
          await query(
            `UPDATE products SET link_status = 'human_review', link_last_status_code = $2 WHERE id = $1`,
            [p.id, check.status || null]
          );
          logger.info({ event: 'link.human_review', productId: p.id, url: p.affiliate_url });
        }
      } else {
        brokenItems.push({ id: p.id, url: p.affiliate_url, status: check.status });

        const wasAlreadyBroken = p.link_status === 'broken';
        if (!wasAlreadyBroken) {
          await query(
            `UPDATE products SET link_status = 'broken', link_broken_at = now(), link_last_status_code = $2 WHERE id = $1`,
            [p.id, check.status || null]
          );
          logger.info({ event: 'link.broken.first', productId: p.id, url: p.affiliate_url, httpStatus: check.status });
        } else {
          await query(`UPDATE products SET link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);
          logger.info({ event: 'link.broken', productId: p.id, url: p.affiliate_url, httpStatus: check.status });
        }

        const isSnoozed = p.snoozed_until && new Date(p.snoozed_until) > new Date();
        const hasCredentials = !!(p.telegram_bot_token && p.telegram_chat_id);

        if (hasCredentials && !p.awaiting_confirmation && !isSnoozed) {
          const base = p.domain_hostname ? `https://${p.domain_hostname}` : config.app.publicBaseUrl;
          const domainPrefix = p.domain_hostname ? (p.domain_prefix || 'r') : 'r';
          const shortUrl = `${base}/${domainPrefix}/${p.short_path}`;
          const msg = buildBrokenLinkMessage({
            campaignTitle: p.campaign_title ?? p.product_title,
            platform: p.platform,
            marketplace: p.marketplace,
            profileName: p.profile_name,
            shortUrl,
          });
          const keyboard = buildInlineKeyboard(p.id);
          const sent = await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg, keyboard);
          if (sent) {
            await query(`UPDATE products SET awaiting_confirmation = true WHERE id = $1`, [p.id]);
          }
        }
      }
    } else {
      if (p.link_status !== 'ok' && p.link_status !== 'unknown') {
        await query(
          `UPDATE products SET link_status = 'ok', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`,
          [p.id]
        );
        logger.info({ event: 'link.recovered', productId: p.id });
      } else if (p.link_status === 'unknown') {
        await query(`UPDATE products SET link_status = 'ok' WHERE id = $1`, [p.id]);
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
      p.link_status,
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
    let check;
    try {
      check = await orchestrateCheck(p.id, p.affiliate_url, p.marketplace);
    } catch (err) {
      logger.error({ event: 'link.check.unexpected', productId: p.id, error: err.message });
      check = { ok: false, status: 0, humanReview: true };
    }

    await query(`UPDATE products SET link_last_checked_at = now(), link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);

    if (check.humanReview) {
      if (p.link_status !== 'human_review') {
        await query(
          `UPDATE products SET link_status = 'human_review', link_last_status_code = $2 WHERE id = $1`,
          [p.id, check.status || null]
        );
      }
    } else if (!check.ok && p.link_status !== 'broken') {
      await query(
        `UPDATE products SET link_status = 'broken', link_broken_at = now(), link_last_status_code = $2 WHERE id = $1`,
        [p.id, check.status || null]
      );
    } else if (check.ok && (p.link_status === 'broken' || p.link_status === 'human_review')) {
      await query(
        `UPDATE products SET link_status = 'ok', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`,
        [p.id]
      );
    } else if (check.ok && p.link_status === 'unknown') {
      await query(`UPDATE products SET link_status = 'ok' WHERE id = $1`, [p.id]);
    }

    results.push({
      id: p.id,
      title: p.product_title,
      position: p.position,
      marketplace: p.marketplace,
      url: p.affiliate_url,
      ok: check.ok && !check.humanReview,
      status: check.status,
      humanReview: check.humanReview ?? false,
    });
  }

  return { checked: products.length, broken: results.filter((r) => !r.ok).length, results };
}

export async function checkSingleProduct(productId) {
  const result = await query(
    `SELECT id, affiliate_url, link_status, marketplace FROM products WHERE id = $1`,
    [productId]
  );
  if (result.rowCount === 0 || !result.rows[0].affiliate_url) return null;
  const p = result.rows[0];

  const check = await orchestrateCheck(p.id, p.affiliate_url, p.marketplace);
  await query(`UPDATE products SET link_last_checked_at = now(), link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);

  if (check.humanReview) {
    if (p.link_status !== 'human_review') {
      await query(
        `UPDATE products SET link_status = 'human_review', link_last_status_code = $2 WHERE id = $1`,
        [p.id, check.status || null]
      );
    }
  } else if (!check.ok) {
    if (p.link_status !== 'broken') {
      await query(
        `UPDATE products SET link_status = 'broken', link_broken_at = now(), link_last_status_code = $2 WHERE id = $1`,
        [p.id, check.status || null]
      );
    } else {
      await query(`UPDATE products SET link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);
    }
  } else {
    if (p.link_status === 'broken' || p.link_status === 'human_review') {
      await query(
        `UPDATE products SET link_status = 'ok', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`,
        [p.id]
      );
    } else if (p.link_status !== 'ok') {
      await query(`UPDATE products SET link_status = 'ok' WHERE id = $1`, [p.id]);
    }
  }

  logger.info({ event: 'link.check.single', productId: p.id, ok: check.ok, httpStatus: check.status });

  const linkStatus = check.humanReview ? 'human_review' : check.ok ? 'ok' : 'broken';
  return { ok: check.ok && !check.humanReview, humanReview: check.humanReview ?? false, httpStatus: check.status, linkStatus };
}
