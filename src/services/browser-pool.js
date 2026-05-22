import logger from '../logger.js';

const MAX_CONCURRENT = 2;       // máximo de páginas simultâneas
const PAGE_TIMEOUT_MS = 45_000; // timeout total por operação de página (além do goto interno)

let _browser = null;
let _available = false;
let _initializing = false;

// Concurrency semaphore — at most MAX_CONCURRENT pages open at once
let _running = 0;
const _waiters = [];

function _release() {
  _running--;
  if (_waiters.length > 0 && _running < MAX_CONCURRENT) {
    const next = _waiters.shift();
    _running++;
    next();
  }
}

async function _acquire() {
  if (_running < MAX_CONCURRENT) { _running++; return; }
  await new Promise((resolve) => _waiters.push(resolve));
}

export async function initBrowser() {
  if (_browser) return true;
  if (_initializing) {
    await new Promise((r) => setTimeout(r, 500));
    return _browser !== null;
  }
  _initializing = true;
  try {
    // Dynamic import so that missing packages don't crash the whole API
    const { chromium } = await import('playwright-extra');
    const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
    chromium.use(StealthPlugin());

    _browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-extensions',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
      ],
    });

    _browser.on('disconnected', () => {
      logger.warn({ event: 'browser.disconnected' });
      _browser = null;
      _available = false;
    });

    _available = true;
    logger.info({ event: 'browser.started' });
    return true;
  } catch (err) {
    logger.warn({ event: 'browser.init.failed', error: err.message });
    _available = false;
    return false;
  } finally {
    _initializing = false;
  }
}

export const isBrowserAvailable = () => _available && _browser !== null;

// Opens a new isolated browser context, runs fn(page), then closes the context.
// Respects the MAX_CONCURRENT concurrency limit and enforces PAGE_TIMEOUT_MS.
// Closing the context in `finally` aborts any in-progress Playwright operation,
// preventing zombie pages from holding semaphore slots indefinitely.
export async function withPage(fn) {
  await _acquire();
  let ctx = null;
  let timeoutId = null;
  try {
    if (!_browser) {
      const ok = await initBrowser();
      if (!ok) throw new Error('Browser not available');
    }
    ctx = await _browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      extraHTTPHeaders: { 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' },
    });
    const page = await ctx.newPage();

    return await Promise.race([
      fn(page),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`withPage: operação excedeu ${PAGE_TIMEOUT_MS}ms`)),
          PAGE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    // ctx.close() cancela navegações em andamento — mata qualquer página zumbi
    if (ctx) await ctx.close().catch(() => {});
    _release();
  }
}

export async function closeBrowser() {
  if (_browser) {
    const b = _browser;
    _browser = null;
    _available = false;
    await b.close().catch(() => {});
    logger.info({ event: 'browser.closed' });
  }
}
