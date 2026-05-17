import { query } from '../db.js';
import logger from '../logger.js';
import config from '../config.js';
import { answerCallbackQuery, editMessageText } from '../services/telegram-service.js';

export default async function telegramRoutes(fastify) {
  fastify.post('/telegram/webhook', async (request, reply) => {
    // Verify Telegram's secret token header if configured
    const secret = config.telegram.webhookSecret;
    if (secret) {
      const headerSecret = request.headers['x-telegram-bot-api-secret-token'];
      if (headerSecret !== secret) {
        return reply.code(403).send({ error: 'Forbidden' });
      }
    }

    const body = request.body;
    if (!body?.callback_query) return reply.send({ ok: true });

    const { id: callbackId, data, message } = body.callback_query;
    const [action, productIdStr] = (data || '').split(':');
    const productId = parseInt(productIdStr, 10);

    if (!productId || isNaN(productId)) return reply.send({ ok: true });

    // Fetch product + bot token via profile chain
    const result = await query(`
      SELECT p.id, p.title, pr.telegram_bot_token
      FROM products p
      LEFT JOIN videos v ON v.id = p.video_id
      LEFT JOIN profiles pr ON pr.id = v.profile_id
      WHERE p.id = $1
    `, [productId]);

    if (!result.rowCount) return reply.send({ ok: true });
    const { telegram_bot_token: botToken } = result.rows[0];

    if (action === 'fix') {
      await query(
        `UPDATE products SET link_status = 'unknown', awaiting_confirmation = false, snoozed_until = null WHERE id = $1`,
        [productId]
      );
      logger.info({ event: 'product.marked_fixed', productId, via: 'telegram' });

      if (botToken && message) {
        await answerCallbackQuery(botToken, callbackId, '✅ Link marcado como corrigido!');
        await editMessageText(
          botToken, message.chat.id, message.message_id,
          `${message.text}\n\n✅ <b>Marcado como corrigido</b>`,
          { inline_keyboard: [] }
        );
      }
    } else if (action === 'snooze') {
      await query(
        `UPDATE products SET snoozed_until = now() + interval '24 hours', awaiting_confirmation = false WHERE id = $1`,
        [productId]
      );
      logger.info({ event: 'product.snoozed', productId, via: 'telegram' });

      if (botToken && message) {
        await answerCallbackQuery(botToken, callbackId, '🔕 Notificações ignoradas por 24h');
        await editMessageText(
          botToken, message.chat.id, message.message_id,
          `${message.text}\n\n🔕 <b>Ignorado por 24h</b>`,
          { inline_keyboard: [] }
        );
      }
    }

    return reply.send({ ok: true });
  });
}
