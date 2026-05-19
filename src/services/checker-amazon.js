import { withPage, isBrowserAvailable } from './browser-pool.js';
import logger from '../logger.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkWithFetch(url) {
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
    } catch (err) { clearTimeout(tid); throw err; }
  }

  try {
    let res = await doFetch();
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 2000));
      res = await doFetch();
    }

    if (res.status === 404 || res.status === 410) {
      return { status: 'broken', reason: `HTTP ${res.status}`, confidence: 0.95 };
    }
    if (res.status === 503 || res.status >= 500) {
      return { status: 'broken', reason: `Bloqueado após retry (HTTP ${res.status})`, confidence: 0.4 };
    }

    const html = await res.text();

    if (html.includes('dogs-of-amazon') || html.includes('não conseguimos encontrar')) {
      return { status: 'broken', reason: 'Página 404 da Amazon', confidence: 0.95 };
    }
    if (
      html.includes('Não temos previsão') ||
      html.includes('Currently unavailable') ||
      html.includes('Atualmente não disponível')
    ) {
      return { status: 'broken', reason: 'Produto indisponível', confidence: 0.9 };
    }
    if (
      html.includes('add-to-cart-button') ||
      html.includes('Adicionar ao carrinho') ||
      html.includes('buybox')
    ) {
      return { status: 'ok', reason: 'Botão de compra encontrado', confidence: 0.9 };
    }

    return { status: 'broken', reason: 'Não foi possível confirmar disponibilidade', confidence: 0.4 };
  } catch (err) {
    return { status: 'broken', reason: `Erro de rede: ${err.message}`, confidence: 0.6 };
  }
}

async function checkWithBrowser(url) {
  try {
    return await withPage(async (page) => {
      await page.goto(url, { timeout: 30_000, waitUntil: 'domcontentloaded' });
      const finalUrl = page.url();

      if (finalUrl.includes('dogs-of-amazon') || finalUrl.includes('dogsofamazon')) {
        return { status: 'broken', reason: 'Página 404 da Amazon', confidence: 0.95 };
      }

      if (finalUrl.includes('404') || finalUrl.includes('error')) {
        return { status: 'broken', reason: `URL de erro: ${finalUrl}`, confidence: 0.8 };
      }

      const availText = await page.locator('#availability').textContent({ timeout: 5_000 }).catch(() => '');
      const lower = availText.toLowerCase();

      if (lower.includes('em estoque') || lower.includes('in stock')) {
        return { status: 'ok', reason: 'Em estoque confirmado', confidence: 0.97 };
      }
      if (
        lower.includes('não temos previsão') ||
        lower.includes('currently unavailable') ||
        lower.includes('atualmente não disponível') ||
        lower.includes('indisponível') ||
        lower.includes('unavailable')
      ) {
        return { status: 'broken', reason: 'Produto indisponível', confidence: 0.95 };
      }

      const addCart = await page.locator('#add-to-cart-button').count().catch(() => 0);
      if (addCart > 0) return { status: 'ok', reason: 'Botão Adicionar ao Carrinho encontrado', confidence: 0.95 };

      const buyNow = await page.locator('#buy-now-button').count().catch(() => 0);
      if (buyNow > 0) return { status: 'ok', reason: 'Botão Comprar Agora encontrado', confidence: 0.95 };

      const oos = await page.locator('#outOfStock').count().catch(() => 0);
      if (oos > 0) return { status: 'broken', reason: 'Fora de estoque (#outOfStock)', confidence: 0.95 };

      const screenshotPath = await takeSs(page);
      return { status: 'broken', reason: 'Sem sinal determinístico', confidence: 0.35, screenshotPath };
    });
  } catch (err) {
    logger.warn({ event: 'checker.amazon.browser.fallback', url, error: err.message });
    return checkWithFetch(url);
  }
}

async function takeSs(page) {
  try {
    const { mkdir } = await import('fs/promises');
    await mkdir('/tmp/screenshots', { recursive: true });
    const path = `/tmp/screenshots/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.png`;
    await page.screenshot({ path, fullPage: false, timeout: 8_000 });
    return path;
  } catch { return null; }
}

export async function checkAmazonLink(url) {
  if (isBrowserAvailable()) return checkWithBrowser(url);
  return checkWithFetch(url);
}
