import { query, transaction } from '../db.js';
import { NotFoundError, ConflictError } from '../errors.js';
import { logAudit } from '../audit.js';
import { createRedirect } from './redirect-service.js';

const positions = ['top1', 'top2', 'top3', 'top4', 'top5'];

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

async function uniqueShortPath(seed) {
  const base = slugify(seed) || `product-${Date.now()}`;
  let candidate = base.length >= 4 ? base : `${base}-link`;
  let suffix = 2;

  while (true) {
    const existing = await query(
      `SELECT short_path FROM products WHERE short_path = $1
       UNION
       SELECT short_path FROM redirects WHERE short_path = $1
       LIMIT 1`,
      [candidate]
    );

    if (!existing.rowCount) {
      return candidate;
    }

    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}

function normalizePosition(position) {
  return positions.includes(position) ? position : null;
}

export async function listProducts() {
  const result = await query(
    `SELECT p.*, COALESCE(c.click_count, 0)::int AS click_count
     FROM products p
     LEFT JOIN redirects r ON r.product_id = p.id
     LEFT JOIN (
       SELECT redirect_id, COUNT(*) AS click_count
       FROM redirect_clicks
       GROUP BY redirect_id
     ) c ON c.redirect_id = r.id
     ORDER BY p.created_at DESC`
  );
  return result.rows;
}

export async function getProduct(id) {
  const result = await query('SELECT * FROM products WHERE id = $1', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Product not found');
  }
  return result.rows[0];
}

export async function createProduct(payload) {
  const shortPath = payload.short_path || await uniqueShortPath(`${payload.video_id || 'campaign'}-${payload.position || ''}-${payload.title}`);
  const marketplace = payload.marketplace || 'affiliate';
  const position = normalizePosition(payload.position);
  const existing = await query(
    `SELECT short_path FROM products WHERE short_path = $1
     UNION
     SELECT short_path FROM redirects WHERE short_path = $1
     LIMIT 1`,
    [shortPath]
  );
  if (existing.rowCount) {
    throw new ConflictError('Short path already in use');
  }

  const result = await query(
    `INSERT INTO products (title, description, affiliate_url, short_path, marketplace, position, domain_id, video_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [payload.title, payload.description || null, payload.affiliate_url, shortPath, marketplace, position, payload.domain_id || null, payload.video_id || null]
  );

  const product = result.rows[0];
  await createRedirect({
    short_path: product.short_path,
    target_url: product.affiliate_url,
    product_id: product.id,
    domain_id: product.domain_id || null,
    active: true
  }).catch(() => null);

  logAudit('product.created', { productId: product.id, shortPath: product.short_path });
  return product;
}

export async function updateProduct(id, payload) {
  const product = await getProduct(id);
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of ['title', 'description', 'affiliate_url', 'short_path', 'marketplace', 'position', 'domain_id']) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(payload[key]);
      idx += 1;
    }
  }

  if (!fields.length) {
    return product;
  }

  if (payload.short_path && payload.short_path !== product.short_path) {
    const conflict = await query(
      `SELECT short_path FROM products WHERE short_path = $1 AND id <> $2
       UNION
       SELECT short_path FROM redirects WHERE short_path = $1 AND (product_id IS NULL OR product_id <> $2)
       LIMIT 1`,
      [payload.short_path, id]
    );
    if (conflict.rowCount) {
      throw new ConflictError('Short path already in use');
    }
  }

  values.push(id);
  const result = await query(
    `UPDATE products SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    values
  );

  logAudit('product.updated', { productId: id, updates: payload });
  return result.rows[0];
}

export async function replaceAffiliateUrl(productId, newUrl) {
  return await transaction(async (client) => {
    const existing = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [productId]);
    if (!existing.rowCount) {
      throw new NotFoundError('Product not found');
    }

    const product = existing.rows[0];
    if (product.affiliate_url === newUrl) {
      return product;
    }

    const updated = await client.query(
      `UPDATE products SET affiliate_url = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [newUrl, productId]
    );

    const result = updated.rows[0];
    logAudit('product.affiliate_url.replaced', { productId, oldValue: product.affiliate_url, newValue: newUrl });
    return result;
  });
}

export async function deleteProduct(id) {
  const result = await query('DELETE FROM products WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Product not found');
  }
  logAudit('product.deleted', { productId: id });
  return { id };
}
