import { query } from '../db.js';
import logger from '../logger.js';
import config from '../config.js';
import {
  sendTelegramMessage,
  buildBrokenLinkMessage,
  buildInlineKeyboard,
} from './telegram-service.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; LinkHealthBot/1.0)';
const ML_HOSTS     = ['mercadolivre.com.br', 'mercadolivre.com', 'ml.com'];
const AMAZON_HOSTS = ['amazon.com.br', 'amazon.com', 'amzn.to'];

function isMercadoLivreUrl(url) {
  try {
    const { hostname } = new URL(url);
    return ML_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch { return false; }
}

function isAmazonUrl(url) {
  try {
    const { hostname } = new URL(url);
    return AMAZON_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch { return false; }
}

async function checkAmazonUrl(url) {
  const headers = {
    'User-Agent': BROWSER_UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  async function doFetch() {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers });
      clearTimeout(tid);
      return res;
    } catch (err) {
      clearTimeout(tid);
      throw err;
    }
  }

  try {
    let res = await doFetch();

    // Retry once on 503 — Amazon sometimes blocks on first hit
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await doFetch();
    }

    if (res.status === 404 || res.status === 410) {
      return { ok: false, status: res.status };
    }

    // Still blocked after retry — can't confirm, send to human review
    if (res.status === 503 || res.status >= 500) {
      return { ok: false, status: res.status, humanReview: true };
    }

    const html = await res.text();

    // Page not found (404 page or Muffin dog page)
    if (html.includes('dogs-of-amazon') || html.includes('não conseguimos encontrar')) {
      return { ok: false, status: res.status };
    }

    // Product unavailable (out of stock / discontinued)
    if (
      html.includes('Não temos previsão') ||
      html.includes('Currently unavailable') ||
      html.includes('Atualmente não disponível')
    ) {
      return { ok: false, status: res.status };
    }

    // Product is available
    if (
      html.includes('add-to-cart-button') ||
      html.includes('Adicionar ao carrinho') ||
      html.includes('buybox')
    ) {
      return { ok: true, status: res.status };
    }

    // Could not confirm either way
    return { ok: false, status: res.status, humanReview: true };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function checkMercadoLivreUrl(url) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    clearTimeout(tid);

    if (res.status === 404 || res.status === 410 || res.status >= 500) {
      return { ok: false, status: res.status };
    }

    // Redirect to generic catalog = product removed
    const finalUrl = res.url ?? url;
    if (finalUrl.includes('melhores-escolha') || finalUrl.includes('melhores-escolhaa')) {
      return { ok: false, status: res.status };
    }

    const html = await res.text();

    // Clear product page indicator
    if (html.includes('Ir para produto') || html.includes('"itemType":"product"')) {
      return { ok: true, status: res.status };
    }

    // Generic/catalog page indicators
    if (
      html.includes('Minhas recomenda') ||  // "Minhas recomendações"
      html.includes('Minhas listas') ||
      html.includes('melhores-escolha') ||
      html.includes('Lista de favoritos')
    ) {
      return { ok: false, status: res.status };
    }

    // Could not confirm — mark for human review
    return { ok: false, status: res.status, humanReview: true };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
}

async function checkUrl(url) {
  if (isMercadoLivreUrl(url)) {
    return checkMercadoLivreUrl(url);
  }
  if (isAmazonUrl(url)) {
    return checkAmazonUrl(url);
  }
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': BOT_UA },
    });
    // Some servers (e.g. Shopee) reject HEAD — retry with GET
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': BOT_UA },
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
      p.link_status,
      p.awaiting_confirmation,
      p.snoozed_until,
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
      AND p.monitoring_enabled = true
    ORDER BY p.id
  `);

  const products = result.rows;
  const brokenItems = [];
  const allResults = [];

  for (const p of products) {
    const check = await checkUrl(p.affiliate_url);

    // Always record when the product was last checked
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
    });

    if (!check.ok) {
      if (check.humanReview) {
        // ML page returned 200 but couldn't confirm product exists
        if (p.link_status !== 'human_review') {
          await query(
            `UPDATE products SET link_status = 'human_review', link_last_status_code = $2 WHERE id = $1`,
            [p.id, check.status || null]
          );
          logger.info({ event: 'link.human_review', productId: p.id, url: p.affiliate_url });
        }
        // Not treated as "broken" for Telegram purposes
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
        logger.info({ event: 'link.broken.notify_check', productId: p.id, hasCredentials, awaitingConfirmation: p.awaiting_confirmation, isSnoozed: !!isSnoozed });

        if (hasCredentials && !p.awaiting_confirmation && !isSnoozed) {
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
          const keyboard = buildInlineKeyboard(p.id);
          const sent = await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg, keyboard);
          if (sent) {
            await query(`UPDATE products SET awaiting_confirmation = true WHERE id = $1`, [p.id]);
          }
        }
      }
    } else {
      // Link is OK — clear any broken/review state
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
    const check = await checkUrl(p.affiliate_url);

    await query(`UPDATE products SET link_last_checked_at = now(), link_last_status_code = $2 WHERE id = $1`, [p.id, check.status || null]);

    // Update DB status (no Telegram for manual per-video checks)
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
    `SELECT id, affiliate_url, link_status FROM products WHERE id = $1`,
    [productId]
  );
  if (result.rowCount === 0 || !result.rows[0].affiliate_url) return null;
  const p = result.rows[0];

  const check = await checkUrl(p.affiliate_url);
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
