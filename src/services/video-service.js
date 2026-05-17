import { query } from '../db.js';
import { NotFoundError } from '../errors.js';
import { logAudit } from '../audit.js';
import { createProduct } from './product-service.js';

const baseColumns = ['id', 'title', 'description', 'platform', 'original_video_url', 'notes', 'publish_date', 'created_at', 'updated_at'];

export async function ensureVideoCampaignSchema() {
  await query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_video_url TEXT');
  await query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS notes TEXT');
  await query('ALTER TABLE products ADD COLUMN IF NOT EXISTS position TEXT');
  await query('CREATE INDEX IF NOT EXISTS idx_products_video_position ON products(video_id, position)');
}

export async function listVideos() {
  const sql = `
    SELECT v.*, COALESCE(c.total_clicks, 0)::int AS total_clicks
    FROM videos v
    LEFT JOIN (
      SELECT p.video_id, COUNT(rc.id) AS total_clicks
      FROM products p
      LEFT JOIN redirects r ON r.product_id = p.id
      LEFT JOIN redirect_clicks rc ON rc.redirect_id = r.id
      WHERE p.video_id IS NOT NULL
      GROUP BY p.video_id
    ) c ON c.video_id = v.id
    ORDER BY v.created_at DESC`;
  const result = await query(sql);
  return result.rows;
}

export async function getVideo(id) {
  const result = await query(
    `SELECT v.*, COALESCE(c.total_clicks, 0)::int AS total_clicks
     FROM videos v
     LEFT JOIN (
       SELECT p.video_id, COUNT(rc.id) AS total_clicks
       FROM products p
       LEFT JOIN redirects r ON r.product_id = p.id
       LEFT JOIN redirect_clicks rc ON rc.redirect_id = r.id
       WHERE p.video_id = $1
       GROUP BY p.video_id
     ) c ON c.video_id = v.id
     WHERE v.id = $1`,
    [id]
  );
  if (!result.rowCount) {
    throw new NotFoundError('Video not found');
  }
  return result.rows[0];
}

export async function createVideo(payload) {
  const result = await query(
    `INSERT INTO videos (title, description, platform, original_video_url, notes, publish_date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${baseColumns.join(', ')}`,
    [payload.title, payload.description || null, payload.platform || null, payload.original_video_url || null, payload.notes || null, payload.publish_date || null]
  );
  logAudit('video.created', { videoId: result.rows[0].id, title: payload.title });
  return result.rows[0];
}

export async function updateVideo(id, payload) {
  const fields = [];
  const values = [];
  let index = 1;

  for (const key of ['title', 'description', 'platform', 'original_video_url', 'notes', 'publish_date']) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${index}`);
      values.push(payload[key]);
      index += 1;
    }
  }

  if (!fields.length) {
    return getVideo(id);
  }

  values.push(id);
  const result = await query(
    `UPDATE videos SET ${fields.join(', ')}, updated_at = now() WHERE id = $${index} RETURNING ${baseColumns.join(', ')}`,
    values
  );

  if (!result.rowCount) {
    throw new NotFoundError('Video not found');
  }

  logAudit('video.updated', { videoId: id, updates: payload });
  return result.rows[0];
}

export async function deleteVideo(id) {
  const result = await query('DELETE FROM videos WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Video not found');
  }
  logAudit('video.deleted', { videoId: id });
  return { id };
}

export async function listProductsForVideo(videoId) {
  await getVideo(videoId);
  const result = await query(
    `SELECT p.*, COALESCE(c.click_count, 0)::int AS click_count
     FROM products p
     LEFT JOIN redirects r ON r.product_id = p.id
     LEFT JOIN (
       SELECT redirect_id, COUNT(*) AS click_count
       FROM redirect_clicks
       GROUP BY redirect_id
     ) c ON c.redirect_id = r.id
     WHERE p.video_id = $1
     ORDER BY
       CASE p.position
         WHEN 'top1' THEN 1
         WHEN 'top2' THEN 2
         WHEN 'top3' THEN 3
         WHEN 'top4' THEN 4
         WHEN 'top5' THEN 5
         ELSE 99
       END,
       p.created_at DESC`,
    [videoId]
  );
  return result.rows;
}

export async function createProductForVideo(videoId, productPayload) {
  await getVideo(videoId);
  const product = await createProduct({
    ...productPayload,
    video_id: videoId,
    marketplace: productPayload.marketplace || 'affiliate'
  });
  logAudit('video.product.created', { videoId, productId: product.id, shortPath: product.short_path });
  return product;
}
