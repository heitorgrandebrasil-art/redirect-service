import { query } from '../db.js';
import logger from '../logger.js';
import config from '../config.js';
import { sendTelegramMessage, buildBrokenLinkMessage } from './telegram-service.js';

async function checkUrl(url) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkHealthBot/1.0)' }
    });
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

  for (const p of products) {
    const check = await checkUrl(p.affiliate_url);
    if (!check.ok) {
      logger.info({ event: 'link.broken', productId: p.id, url: p.affiliate_url, httpStatus: check.status });
      brokenItems.push({ id: p.id, url: p.affiliate_url, status: check.status });

      if (p.telegram_bot_token && p.telegram_chat_id) {
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

        await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg);
      }
    }
  }

  return { checked: products.length, broken: brokenItems.length, brokenItems };
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
