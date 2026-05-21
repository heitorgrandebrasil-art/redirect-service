import { query } from '../db.js';
import config from '../config.js';
import { authenticateJWT, requireRole } from '../middleware/authenticate.js';
import { checkAllLinks, checkSingleProduct } from '../services/link-health.js';
import { sendTelegramMessage } from '../services/telegram-service.js';
import logger from '../logger.js';

export default async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  // Manual link health check — admin only
  fastify.post('/admin/check-links', {
    preHandler: [authenticateJWT, requireRole('admin')]
  }, async (request, reply) => {
    const result = await checkAllLinks();
    return reply.send({ status: 'ok', data: result });
  });

  // Check a single product link — any authenticated user
  fastify.post('/admin/links/:id/check', {
    preHandler: [authenticateJWT]
  }, async (request, reply) => {
    const { id } = request.params;
    const result = await checkSingleProduct(Number(id));
    if (!result) return reply.code(404).send({ status: 'error', message: 'Product not found or no URL' });
    return reply.send({ status: 'ok', data: result });
  });

  // List all broken + human_review links — any authenticated user
  fastify.get('/broken-links', {
    preHandler: [authenticateJWT]
  }, async (request, reply) => {
    const result = await query(`
      SELECT
        p.id, p.title, p.affiliate_url, p.short_path, p.marketplace, p.position,
        p.link_status, p.link_broken_at, p.link_last_status_code,
        p.link_last_checked_at, p.awaiting_confirmation, p.snoozed_until,
        p.last_gemini_status, p.last_gemini_confidence,
        v.id AS video_id, v.title AS video_title, v.platform,
        pr.id AS profile_id, pr.name AS profile_name,
        d.hostname AS domain_hostname
      FROM products p
      LEFT JOIN videos v ON v.id = p.video_id
      LEFT JOIN profiles pr ON pr.id = v.profile_id
      LEFT JOIN domains d ON d.id = p.domain_id
      WHERE p.link_status IN ('broken', 'human_review')
        AND v.id IS NOT NULL
      ORDER BY
        CASE p.link_status WHEN 'broken' THEN 0 WHEN 'human_review' THEN 1 END,
        p.link_broken_at DESC NULLS LAST
    `);
    return reply.send({ status: 'ok', data: result.rows });
  });

  // Human feedback on human_review links — any authenticated user
  fastify.post('/products/:id/feedback', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['verdict'],
        properties: { verdict: { type: 'string', enum: ['ok', 'broken'] } },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { verdict } = request.body;

    const pResult = await query(`
      SELECT p.id, p.affiliate_url, p.marketplace, p.link_status,
             p.last_gemini_status, p.last_screenshot_path,
             p.title, v.title AS campaign_title,
             pr.telegram_bot_token, pr.telegram_chat_id
      FROM products p
      LEFT JOIN videos v ON v.id = p.video_id
      LEFT JOIN profiles pr ON pr.id = v.profile_id
      WHERE p.id = $1
    `, [id]);

    if (pResult.rowCount === 0) {
      return reply.code(404).send({ status: 'error', message: 'Product not found' });
    }
    const p = pResult.rows[0];

    await query(`
      INSERT INTO link_feedbacks (product_id, url, marketplace, playwright_said, gemini_said, human_said, screenshot_path)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, p.affiliate_url, p.marketplace, 'human_review', p.last_gemini_status, verdict, p.last_screenshot_path]);

    if (verdict === 'ok') {
      await query(
        `UPDATE products SET link_status = 'ok', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`,
        [id]
      );
    } else {
      await query(
        `UPDATE products SET link_status = 'broken', link_broken_at = COALESCE(link_broken_at, now()) WHERE id = $1`,
        [id]
      );
    }
    logger.info({ event: 'feedback.submitted', productId: id, verdict });

    try {
      if (p.telegram_bot_token && p.telegram_chat_id) {
        const emoji = verdict === 'ok' ? '✅' : '❌';
        const label = verdict === 'ok' ? 'Funcionando' : 'Quebrado';
        const msg = `${emoji} <b>Link verificado pelo usuário</b>\n\n🛒 <b>Produto:</b> ${p.title}\n📹 <b>Campanha:</b> ${p.campaign_title ?? '—'}\n📌 <b>Resultado:</b> ${label}`;
        await sendTelegramMessage(p.telegram_bot_token, p.telegram_chat_id, msg);
      }
    } catch (e) {
      logger.warn({ event: 'telegram.feedback_notify.failed', error: e.message });
    }

    return reply.send({ status: 'ok' });
  });

  // Mark product as fixed — any authenticated user
  fastify.post('/products/:id/mark-fixed', {
    preHandler: [authenticateJWT]
  }, async (request, reply) => {
    const { id } = request.params;
    await query(
      `UPDATE products SET link_status = 'unknown', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`,
      [id]
    );
    logger.info({ event: 'product.marked_fixed', productId: id, via: 'admin_panel' });

    // Notify via Telegram if profile has bot configured
    try {
      const pResult = await query(`
        SELECT p.title, v.title AS campaign_title,
               pr.telegram_bot_token, pr.telegram_chat_id
        FROM products p
        LEFT JOIN videos v ON v.id = p.video_id
        LEFT JOIN profiles pr ON pr.id = v.profile_id
        WHERE p.id = $1
      `, [id]);
      if (pResult.rowCount > 0) {
        const { telegram_bot_token, telegram_chat_id, title, campaign_title } = pResult.rows[0];
        if (telegram_bot_token && telegram_chat_id) {
          await sendTelegramMessage(
            telegram_bot_token, telegram_chat_id,
            `✅ <b>Link corrigido pelo painel!</b>\n\n🛒 <b>Produto:</b> ${title}\n📹 <b>Campanha:</b> ${campaign_title ?? '—'}`
          );
        }
      }
    } catch (e) {
      logger.warn({ event: 'telegram.notify_fixed.failed', productId: id, error: e.message });
    }

    return reply.send({ status: 'ok' });
  });

  // Toggle per-link monitoring — any authenticated user
  fastify.patch('/products/:id/monitoring', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['enabled'],
        properties: { enabled: { type: 'boolean' } },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { id } = request.params;
    const { enabled } = request.body;
    await query(
      `UPDATE products SET monitoring_enabled = $2, updated_at = now() WHERE id = $1`,
      [id, enabled]
    );
    logger.info({ event: 'product.monitoring_toggled', productId: id, enabled });
    return reply.send({ status: 'ok' });
  });

  // Snooze product for 24h — any authenticated user
  fastify.post('/products/:id/snooze', {
    preHandler: [authenticateJWT]
  }, async (request, reply) => {
    const { id } = request.params;
    await query(
      `UPDATE products SET snoozed_until = now() + interval '24 hours', awaiting_confirmation = false WHERE id = $1`,
      [id]
    );
    logger.info({ event: 'product.snoozed', productId: id, via: 'admin_panel' });
    return reply.send({ status: 'ok' });
  });

  // Cleanup orphaned/invalid broken-link records — admin only
  fastify.post('/admin/broken-links/cleanup', {
    preHandler: [authenticateJWT, requireRole('admin')]
  }, async (request, reply) => {
    const orphaned = await query(`
      DELETE FROM products
      WHERE video_id IS NOT NULL
        AND video_id NOT IN (SELECT id FROM videos)
      RETURNING id
    `);
    const shopee = await query(`
      DELETE FROM products
      WHERE LOWER(marketplace) = 'shopee'
      RETURNING id
    `);
    const removed = orphaned.rowCount + shopee.rowCount;
    logger.info({ event: 'broken-links.cleanup', removed, orphaned: orphaned.rowCount, shopee: shopee.rowCount });
    return reply.send({ status: 'ok', removed });
  });

  fastify.get('/config', async () => ({
    publicBaseUrl: config.app.publicBaseUrl
  }));

  fastify.get('/ready', async (request, reply) => {
    try {
      await query('SELECT 1');
      return { status: 'ready', database: 'ok', uptime: process.uptime() };
    } catch (error) {
      request.log.warn({ event: 'readiness-db-failed', message: error.message });
      return reply.code(503).send({ status: 'not_ready', database: 'unavailable', uptime: process.uptime() });
    }
  });
}
