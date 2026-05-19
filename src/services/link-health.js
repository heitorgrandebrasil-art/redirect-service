import { mkdir, readdir, stat, unlink } from 'fs/promises';
import { query } from '../db.js';
import logger from '../logger.js';
import config from '../config.js';
import {
  sendTelegramMessage,
  buildBrokenLinkMessage,
  buildInlineKeyboard,
} from './telegram-service.js';
import { withPage, isBrowserAvailable } from './browser-pool.js';
import { analyzeScreenshot } from './gemini-service.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const BOT_UA = 'Mozilla/5.0 (compatible; LinkHealthBot/1.0)';
const ML_HOSTS     = ['mercadolivre.com.br', 'mercadolivre.com', 'ml.com'];
const AMAZON_HOSTS = ['amazon.com.br', 'amazon.com', 'amzn.to'];
// shope.ee (no 'p') is where Shopee redirects broken/expired short links
const SHOPEE_HOSTS = ['shopee.com.br', 'shopee.com', 's.shopee.com.br', 'shp.ee', 'shope.ee'];

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

function isShopeeUrl(url) {
  try {
    const { hostname } = new URL(url);
    return SHOPEE_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h));
  } catch { return false; }
}

const SCREENSHOT_DIR = '/tmp/screenshots';

async function takeScreenshot(page) {
  try {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    const path = `${SCREENSHOT_DIR}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;
    await page.screenshot({ path, fullPage: false, timeout: 8_000 });
    return path;
  } catch {
    return null;
  }
}

// Runs Gemini Vision on a screenshot when Playwright returned human_review.
// Updates products table with Gemini result and returns an updated check object.
// If Gemini is confident (>= 0.8), resolves humanReview; otherwise leaves it as-is.
async function applyGemini(check, productId) {
  if (!check.humanReview || !check.screenshotPath) return check;
  const gemini = await analyzeScreenshot(check.screenshotPath);
  if (!gemini) return check;
  await query(
    `UPDATE products SET last_gemini_status = $2, last_gemini_confidence = $3, last_gemini_reason = $4, last_screenshot_path = $5 WHERE id = $1`,
    [productId, gemini.status, gemini.confidence, gemini.reason, check.screenshotPath]
  );
  if (gemini.confidence >= 0.8 && gemini.status !== 'uncertain') {
    return { ok: gemini.status === 'ok', status: check.status, screenshotPath: check.screenshotPath };
  }
  return check;
}

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

// Shopee renders products client-side (CSR shell, no SSR product data).
// Reliable signals available without executing JavaScript:
//   - Broken: redirect to shope.ee/error_page (expired/invalid short link)
//   - Broken: redirect to shopee.com.br home page
//   - Broken: HTTP 404/410
//   - OK:     final URL contains Shopee's canonical product pattern -i.{shopId}.{itemId}
//   - Unknown: anything else → human_review (stock cannot be verified without JS)
async function checkShopeeUrl(url) {
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

    // Retry once on 503 — Shopee occasionally throttles on first hit
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await doFetch();
    }

    if (res.status === 404 || res.status === 410) {
      return { ok: false, status: res.status };
    }

    if (res.status === 503 || res.status >= 500) {
      return { ok: false, status: res.status, humanReview: true };
    }

    const finalUrl = res.url ?? url;

    // Broken: short link expired/invalid — Shopee redirects to shope.ee/error_page
    if (finalUrl.includes('error_page') || finalUrl.includes('error-page')) {
      return { ok: false, status: res.status };
    }

    // Broken: redirected to Shopee home page (product removed)
    if (/^https?:\/\/(?:www\.)?shopee\.com\.br\/?(?:[?#].*)?$/.test(finalUrl)) {
      return { ok: false, status: res.status };
    }

    // OK: canonical Shopee product URL (-i.{shopId}.{itemId}) resolved successfully.
    // Stock level is not verifiable without executing JavaScript (CSR-only site),
    // but the product page exists and the listing is active.
    if (/[-/]i\.\d+\.\d+/.test(finalUrl)) {
      return { ok: true, status: res.status };
    }

    // Can't determine from URL/status alone — flag for manual review
    return { ok: false, status: res.status, humanReview: true };
  } catch (err) {
    return { ok: false, status: 0, error: err.message };
  }
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

// ─── Playwright-based checks ────────────────────────────────────────────────
// Each function tries the browser path first and falls back to the fetch
// implementation if Playwright is unavailable or throws.

async function checkAmazonWithBrowser(url) {
  try {
    return await withPage(async (page) => {
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
      const finalUrl = page.url();

      if (finalUrl.includes('dogs-of-amazon') || finalUrl.includes('dogsofamazon')) {
        return { ok: false, status: 404 };
      }

      const availText = await page.locator('#availability').textContent({ timeout: 5_000 }).catch(() => '');
      const lower = availText.toLowerCase();

      if (lower.includes('em estoque') || lower.includes('in stock')) return { ok: true, status: 200 };
      if (
        lower.includes('não temos previsão') ||
        lower.includes('currently unavailable') ||
        lower.includes('atualmente não disponível') ||
        lower.includes('não disponível')
      ) return { ok: false, status: 200 };

      const addCart = await page.locator('#add-to-cart-button').count().catch(() => 0);
      if (addCart > 0) return { ok: true, status: 200 };

      const buyNow = await page.locator('#buy-now-button').count().catch(() => 0);
      if (buyNow > 0) return { ok: true, status: 200 };

      const oos = await page.locator('#outOfStock').count().catch(() => 0);
      if (oos > 0) return { ok: false, status: 200 };

      const screenshotPath = await takeScreenshot(page);
      return { ok: false, status: 200, humanReview: true, screenshotPath };
    });
  } catch (err) {
    logger.warn({ event: 'browser.amazon.fallback', url, error: err.message });
    return checkAmazonUrl(url);
  }
}

async function checkMercadoLivreWithBrowser(url) {
  try {
    return await withPage(async (page) => {
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
      const finalUrl = page.url();

      if (
        finalUrl.includes('melhores-escolha') ||
        finalUrl.includes('melhores-escolhaa') ||
        finalUrl.includes('/lists')
      ) return { ok: false, status: 200 };

      // Wait for either the buybox or a recommendations page
      await page.waitForSelector('.ui-pdp-buybox, .ui-recommendations-carousel', { timeout: 8_000 }).catch(() => {});

      const buybox = await page.locator('.ui-pdp-buybox').count().catch(() => 0);
      if (buybox > 0) return { ok: true, status: 200 };

      const carousel = await page.locator('.ui-recommendations-carousel').count().catch(() => 0);
      if (carousel > 0) return { ok: false, status: 200 };

      // Generic loud button as final signal
      const loudBtn = await page.locator('.andes-button--loud').count().catch(() => 0);
      if (loudBtn > 0) return { ok: true, status: 200 };

      const screenshotPath = await takeScreenshot(page);
      return { ok: false, status: 200, humanReview: true, screenshotPath };
    });
  } catch (err) {
    logger.warn({ event: 'browser.ml.fallback', url, error: err.message });
    return checkMercadoLivreUrl(url);
  }
}

async function checkShopeeWithBrowser(url) {
  try {
    return await withPage(async (page) => {
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
      const finalUrl = page.url();

      if (finalUrl.includes('error_page') || finalUrl.includes('error-page')) {
        return { ok: false, status: 200 };
      }
      if (/^https?:\/\/(?:www\.)?shopee\.com\.br\/?(?:[?#].*)?$/.test(finalUrl)) {
        return { ok: false, status: 200 };
      }

      // Wait for JS to render the product content (buy buttons or error state)
      await page.waitForSelector(
        'button:has-text("Comprar Agora"), button:has-text("Adicionar ao Carrinho"), :text("O produto não existe"), :text("Esgotado")',
        { timeout: 20_000 }
      ).catch(() => {});

      const notFound = await page.locator(':text("O produto não existe")').count().catch(() => 0);
      if (notFound > 0) return { ok: false, status: 200 };

      // Active buy buttons confirm the product is purchasable
      const buyNow = await page.locator('button:has-text("Comprar Agora"):not([disabled]):not([aria-disabled="true"])').count().catch(() => 0);
      const addCart = await page.locator('button:has-text("Adicionar ao Carrinho"):not([disabled]):not([aria-disabled="true"])').count().catch(() => 0);
      if (buyNow > 0 || addCart > 0) return { ok: true, status: 200 };

      // "Esgotado" with no active buttons = truly out of stock
      const esgotado = await page.locator(':text("Esgotado")').count().catch(() => 0);
      if (esgotado > 0) return { ok: false, status: 200 };

      // Canonical product URL loaded but no deterministic signal found
      if (/[-/]i\.\d+\.\d+/.test(finalUrl)) return { ok: true, status: 200 };

      const screenshotPath = await takeScreenshot(page);
      return { ok: false, status: 200, humanReview: true, screenshotPath };
    });
  } catch (err) {
    logger.warn({ event: 'browser.shopee.fallback', url, error: err.message });
    return checkShopeeUrl(url);
  }
}
// ────────────────────────────────────────────────────────────────────────────

async function checkUrl(url) {
  const useBrowser = isBrowserAvailable();

  if (isMercadoLivreUrl(url)) {
    return useBrowser ? checkMercadoLivreWithBrowser(url) : checkMercadoLivreUrl(url);
  }
  if (isAmazonUrl(url)) {
    return useBrowser ? checkAmazonWithBrowser(url) : checkAmazonUrl(url);
  }
  if (isShopeeUrl(url)) {
    return useBrowser ? checkShopeeWithBrowser(url) : checkShopeeUrl(url);
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
    let check = await checkUrl(p.affiliate_url);
    if (check.humanReview) check = await applyGemini(check, p.id);

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
      humanReview: check.humanReview ?? false,
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
    let check = await checkUrl(p.affiliate_url);
    if (check.humanReview) check = await applyGemini(check, p.id);

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

  let check = await checkUrl(p.affiliate_url);
  if (check.humanReview) check = await applyGemini(check, p.id);
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
