import { query } from '../db.js';
import { NotFoundError, ConflictError } from '../errors.js';
import { logAudit } from '../audit.js';
import logger from '../logger.js';

// ── In-memory redirect cache (TTL = 5 min) ───────────────────────────────────
const CACHE_TTL = 5 * 60 * 1000;
const _cache = new Map(); // shortPath → { value, expiresAt }

function _cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return undefined; }
  return entry.value;
}
function _cacheSet(key, value) {
  _cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL });
}
export function invalidateRedirectCache(shortPath) {
  if (shortPath) _cache.delete(shortPath);
}
// ─────────────────────────────────────────────────────────────────────────────

export async function listRedirects() {
  const result = await query(
    `SELECT r.*, COALESCE(c.click_count, 0)::int AS click_count
     FROM redirects r
     LEFT JOIN (
       SELECT redirect_id, COUNT(*) AS click_count
       FROM redirect_clicks
       GROUP BY redirect_id
     ) c ON c.redirect_id = r.id
     ORDER BY r.created_at DESC`
  );
  return result.rows;
}

export async function getRedirectById(id) {
  const result = await query('SELECT * FROM redirects WHERE id = $1', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Redirect not found');
  }
  return result.rows[0];
}

export async function getRedirectByShortPath(shortPath) {
  const result = await query(
    'SELECT * FROM redirects WHERE short_path = $1 AND active = true LIMIT 1',
    [shortPath]
  );
  if (!result.rowCount) {
    throw new NotFoundError('Redirect not found');
  }
  return result.rows[0];
}

export async function createRedirect(payload) {
  const existing = await query('SELECT id FROM redirects WHERE short_path = $1', [payload.short_path]);
  if (existing.rowCount) {
    throw new ConflictError('Short path already in use');
  }

  const result = await query(
    `INSERT INTO redirects (short_path, target_url, product_id, domain_id, active)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [payload.short_path, payload.target_url, payload.product_id || null, payload.domain_id || null, payload.active ?? true]
  );

  logAudit('redirect.created', { redirectId: result.rows[0].id, shortPath: payload.short_path });
  return result.rows[0];
}

export async function updateRedirect(id, payload) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of ['short_path', 'target_url', 'product_id', 'domain_id', 'active']) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(payload[key]);
      idx += 1;
    }
  }

  if (!fields.length) {
    return getRedirectById(id);
  }

  if (payload.short_path) {
    const conflict = await query('SELECT id FROM redirects WHERE short_path = $1 AND id <> $2', [payload.short_path, id]);
    if (conflict.rowCount) {
      throw new ConflictError('Short path already in use');
    }
  }

  values.push(id);
  const result = await query(
    `UPDATE redirects SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    values
  );

  if (!result.rowCount) {
    throw new NotFoundError('Redirect not found');
  }

  logAudit('redirect.updated', { redirectId: id, updates: payload });
  if (result.rows[0]) invalidateRedirectCache(result.rows[0].short_path);
  return result.rows[0];
}

export async function deleteRedirect(id) {
  const existing = await query('SELECT short_path FROM redirects WHERE id = $1', [id]);
  const result = await query('DELETE FROM redirects WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Redirect not found');
  }
  if (existing.rowCount) invalidateRedirectCache(existing.rows[0].short_path);
  logAudit('redirect.deleted', { redirectId: id });
  return { id };
}

export async function resolveRedirect(shortPath) {
  const redirect = await getRedirectByShortPath(shortPath);
  return redirect;
}

export async function ensureRedirectClickSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS redirect_clicks (
      id BIGSERIAL PRIMARY KEY,
      redirect_id INTEGER REFERENCES redirects(id) ON DELETE SET NULL,
      short_path TEXT NOT NULL,
      target_url TEXT NOT NULL,
      status_code INTEGER,
      ip TEXT,
      user_agent TEXT,
      referer TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_redirect_clicks_redirect_id ON redirect_clicks(redirect_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_redirect_clicks_created_at ON redirect_clicks(created_at)');
  await query('CREATE INDEX IF NOT EXISTS idx_redirect_clicks_short_path ON redirect_clicks(short_path)');
}

export async function findRedirectForPublicPath(shortPath) {
  const normalized = String(shortPath || '').replace(/^\/+/, '');
  const withLeadingSlash = `/${normalized}`;

  const cached = _cacheGet(normalized);
  if (cached !== undefined) return cached || null; // false = cached miss

  const result = await query(
    `SELECT *
     FROM redirects
     WHERE short_path = $1 OR short_path = $2
     ORDER BY CASE WHEN short_path = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [normalized, withLeadingSlash]
  );
  if (result.rowCount) {
    _cacheSet(normalized, result.rows[0]);
    return result.rows[0];
  }

  // Fallback: product record whose redirect was never created
  const product = await query(
    `SELECT id, short_path, affiliate_url AS target_url, true AS active, id AS product_id, domain_id
     FROM products
     WHERE short_path = $1 OR short_path = $2
     ORDER BY CASE WHEN short_path = $1 THEN 0 ELSE 1 END
     LIMIT 1`,
    [normalized, withLeadingSlash]
  );
  const row = product.rowCount ? product.rows[0] : null;
  _cacheSet(normalized, row || false); // cache miss as false
  return row;
}

export async function findRedirectForDomainPath(hostname, prefix, shortPath) {
  const normalized = String(shortPath || '').replace(/^\/+/, '');
  const cacheKey = `${hostname}:${prefix}:${normalized}`;

  const cached = _cacheGet(cacheKey);
  if (cached !== undefined) return cached || null;

  const domainResult = await query(
    `SELECT id, prefix FROM domains WHERE hostname = $1 AND enabled = true LIMIT 1`,
    [hostname]
  );
  if (!domainResult.rowCount) { _cacheSet(cacheKey, false); return null; }

  const domain = domainResult.rows[0];
  if ((domain.prefix || 'r') !== prefix) { _cacheSet(cacheKey, false); return null; }

  const result = await query(
    `SELECT * FROM redirects WHERE short_path = $1 AND domain_id = $2 AND active = true LIMIT 1`,
    [normalized, domain.id]
  );
  if (result.rowCount) { _cacheSet(cacheKey, result.rows[0]); return result.rows[0]; }

  const product = await query(
    `SELECT id, short_path, affiliate_url AS target_url, true AS active, id AS product_id, domain_id
     FROM products WHERE short_path = $1 AND domain_id = $2 LIMIT 1`,
    [normalized, domain.id]
  );
  const row = product.rowCount ? product.rows[0] : null;
  _cacheSet(cacheKey, row || false);
  return row;
}

export function logRedirectClick(redirect, metadata = {}) {
  query(
    `INSERT INTO redirect_clicks (redirect_id, short_path, target_url, status_code, ip, user_agent, referer, device_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      redirect.id,
      redirect.short_path,
      redirect.target_url,
      metadata.statusCode || null,
      metadata.ip || null,
      metadata.userAgent || null,
      metadata.referer || null,
      metadata.deviceType || null
    ]
  ).catch((error) => {
    logger.debug({
      event: 'redirect-click-log-skipped',
      redirectId: redirect.id,
      message: error.message
    });
  });
}

export async function getRedirectAnalytics() {
  const totalResult = await query('SELECT COUNT(*)::int AS total_clicks FROM redirect_clicks');
  const perPathResult = await query(
    `SELECT short_path, COUNT(*)::int AS click_count, MAX(created_at) AS last_clicked_at
     FROM redirect_clicks
     GROUP BY short_path
     ORDER BY click_count DESC, short_path ASC`
  );

  return {
    total_clicks: totalResult.rows[0]?.total_clicks || 0,
    per_short_path: perPathResult.rows
  };
}
