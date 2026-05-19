import { query } from '../db.js';
import logger from '../logger.js';
import { checkMercadoLivreLink } from './checker-mercadolivre.js';
import { checkAmazonLink } from './checker-amazon.js';
import { analyzeScreenshot } from './gemini-service.js';

const ML_HOSTS     = ['mercadolivre.com.br', 'mercadolivre.com', 'ml.com'];
const AMAZON_HOSTS = ['amazon.com.br', 'amazon.com', 'amzn.to'];

function detectMarketplace(url) {
  try {
    const { hostname } = new URL(url);
    if (ML_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h))) return 'mercadolivre';
    if (AMAZON_HOSTS.some((h) => hostname === h || hostname.endsWith('.' + h))) return 'amazon';
  } catch {}
  return null;
}

async function runGemini(check, productId) {
  if (!check.screenshotPath) return null;
  const gemini = await analyzeScreenshot(check.screenshotPath);
  if (!gemini) return null;
  await query(
    `UPDATE products SET last_gemini_status = $2, last_gemini_confidence = $3, last_gemini_reason = $4, last_screenshot_path = $5 WHERE id = $1`,
    [productId, gemini.status, gemini.confidence, gemini.reason, check.screenshotPath]
  );
  return gemini;
}

async function logHistory(productId, url, marketplace, checkerResult, geminiResult, finalStatus, cycleMonth) {
  try {
    await query(
      `INSERT INTO link_check_history
         (product_id, url, marketplace, playwright_status, gemini_status, final_status, reason, confidence, cycle_month, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())`,
      [
        productId,
        url,
        marketplace,
        checkerResult.status,
        geminiResult?.status ?? null,
        finalStatus,
        geminiResult?.reason ?? checkerResult.reason,
        geminiResult?.confidence ?? checkerResult.confidence,
        cycleMonth,
      ]
    );
  } catch (err) {
    logger.warn({ event: 'orchestrator.log_history.error', productId, error: err.message });
  }
}

export async function orchestrateCheck(productId, url, marketplace) {
  const effectiveMarketplace = marketplace || detectMarketplace(url);
  const cycleMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  let checkerResult;
  if (effectiveMarketplace === 'mercadolivre') {
    checkerResult = await checkMercadoLivreLink(url);
  } else if (effectiveMarketplace === 'amazon') {
    checkerResult = await checkAmazonLink(url);
  } else {
    // Generic fetch for outros/affiliate
    checkerResult = await checkGeneric(url);
  }

  logger.info({
    event: 'orchestrator.checker.done',
    productId,
    marketplace: effectiveMarketplace,
    status: checkerResult.status,
    confidence: checkerResult.confidence,
  });

  // High confidence → use checker result directly
  if (checkerResult.confidence >= 0.85) {
    const ok = checkerResult.status === 'ok';
    await logHistory(productId, url, effectiveMarketplace, checkerResult, null, checkerResult.status, cycleMonth);
    return { ok, status: checkerResult.httpStatus ?? 200, humanReview: false, screenshotPath: checkerResult.screenshotPath };
  }

  // Low confidence → try Gemini Vision
  const gemini = await runGemini(checkerResult, productId);
  if (gemini && gemini.confidence >= 0.8 && gemini.status !== 'uncertain') {
    const ok = gemini.status === 'ok';
    await logHistory(productId, url, effectiveMarketplace, checkerResult, gemini, gemini.status, cycleMonth);
    return { ok, status: checkerResult.httpStatus ?? 200, humanReview: false, screenshotPath: checkerResult.screenshotPath };
  }

  // Can't determine — human review
  await logHistory(productId, url, effectiveMarketplace, checkerResult, gemini ?? null, 'human_review', cycleMonth);
  return { ok: false, status: checkerResult.httpStatus ?? 200, humanReview: true, screenshotPath: checkerResult.screenshotPath };
}

async function checkGeneric(url) {
  const BOT_UA = 'Mozilla/5.0 (compatible; LinkHealthBot/1.0)';
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 10_000);
    let res = await fetch(url, {
      method: 'HEAD', redirect: 'follow', signal: controller.signal,
      headers: { 'User-Agent': BOT_UA },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET', redirect: 'follow', signal: controller.signal,
        headers: { 'User-Agent': BOT_UA },
      });
    }
    clearTimeout(tid);
    const ok = res.status < 400;
    return { status: ok ? 'ok' : 'broken', reason: `HTTP ${res.status}`, confidence: 0.9, httpStatus: res.status };
  } catch (err) {
    return { status: 'broken', reason: `Erro de rede: ${err.message}`, confidence: 0.7, httpStatus: 0 };
  }
}
