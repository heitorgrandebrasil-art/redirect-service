import { withPage, isBrowserAvailable } from './browser-pool.js';
import logger from '../logger.js';

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function checkWithFetch(url) {
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    });
    clearTimeout(tid);

    if (res.status === 404 || res.status === 410) {
      return { status: 'broken', reason: `HTTP ${res.status}`, confidence: 0.95 };
    }
    if (res.status >= 500) {
      return { status: 'broken', reason: `Erro servidor HTTP ${res.status}`, confidence: 0.5 };
    }

    const finalUrl = res.url ?? url;
    if (finalUrl.includes('melhores-escolha') || finalUrl.includes('melhores-escolhaa')) {
      return { status: 'broken', reason: 'Redirecionado para vitrine genérica', confidence: 0.9 };
    }

    const html = await res.text();

    if (html.includes('Ir para produto') || html.includes('"itemType":"product"')) {
      return { status: 'ok', reason: 'Página de produto detectada', confidence: 0.9 };
    }
    if (
      html.includes('Minhas recomenda') ||
      html.includes('Minhas listas') ||
      html.includes('melhores-escolha') ||
      html.includes('Lista de favoritos')
    ) {
      return { status: 'broken', reason: 'Página genérica/catálogo', confidence: 0.85 };
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

      if (
        finalUrl.includes('melhores-escolha') ||
        finalUrl.includes('melhores-escolhaa') ||
        finalUrl.includes('/lists')
      ) return { status: 'broken', reason: 'Redirecionado para vitrine genérica', confidence: 0.95 };

      await page.waitForSelector('.ui-pdp-buybox, .ui-recommendations-carousel', { timeout: 8_000 }).catch(() => {});

      const buybox = await page.locator('.ui-pdp-buybox').count().catch(() => 0);
      if (buybox > 0) return { status: 'ok', reason: 'Buybox encontrado', confidence: 0.95 };

      const buyNowBtn = await page.locator('button:has-text("Comprar agora")').count().catch(() => 0);
      if (buyNowBtn > 0) return { status: 'ok', reason: 'Botão Comprar agora encontrado', confidence: 0.95 };

      const paused = await page.locator(':text("Anúncio pausado")').count().catch(() => 0);
      if (paused > 0) return { status: 'broken', reason: 'Anúncio pausado', confidence: 0.95 };

      const carousel = await page.locator('.ui-recommendations-carousel').count().catch(() => 0);
      if (carousel > 0) return { status: 'broken', reason: 'Página de recomendações (produto removido)', confidence: 0.9 };

      const loudBtn = await page.locator('.andes-button--loud').count().catch(() => 0);
      if (loudBtn > 0) return { status: 'ok', reason: 'Botão de ação encontrado', confidence: 0.85 };

      const screenshotPath = await takeSs(page);
      return { status: 'broken', reason: 'Sem sinal determinístico', confidence: 0.35, screenshotPath };
    });
  } catch (err) {
    logger.warn({ event: 'checker.ml.browser.fallback', url, error: err.message });
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

export async function checkMercadoLivreLink(url) {
  if (isBrowserAvailable()) return checkWithBrowser(url);
  return checkWithFetch(url);
}
