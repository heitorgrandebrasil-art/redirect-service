import { query } from '../db.js';
import config from '../config.js';
import { authenticateJWT, requireRole } from '../middleware/authenticate.js';
import { checkAllLinks } from '../services/link-health.js';
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

  // List all broken links — any authenticated user
  fastify.get('/broken-links', {
    preHandler: [authenticateJWT]
  }, async (request, reply) => {
    const result = await query(`
      SELECT
        p.id, p.title, p.affiliate_url, p.short_path, p.marketplace, p.position,
        p.link_status, p.link_broken_at, p.link_last_status_code,
        p.awaiting_confirmation, p.snoozed_until,
        v.id AS video_id, v.title AS video_title, v.platform,
        pr.id AS profile_id, pr.name AS profile_name,
        d.hostname AS domain_hostname
      FROM products p
      LEFT JOIN videos v ON v.id = p.video_id
      LEFT JOIN profiles pr ON pr.id = v.profile_id
      LEFT JOIN domains d ON d.id = p.domain_id
      WHERE p.link_status = 'broken'
      ORDER BY p.link_broken_at DESC NULLS LAST
    `);
    return reply.send({ status: 'ok', data: result.rows });
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
