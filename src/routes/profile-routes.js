import { authenticateJWT, requireAdmin } from '../middleware/authenticate.js';
import * as profileService from '../services/profile-service.js';
import { sendTelegramMessage } from '../services/telegram-service.js';

const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'x', 'other'];

export default async function profileRoutes(fastify) {
  fastify.addHook('preHandler', authenticateJWT);

  fastify.get('/profiles', async (request, reply) => {
    const profiles = await profileService.listProfiles();
    return reply.send({ status: 'ok', data: profiles });
  });

  fastify.get('/profiles/:id', async (request, reply) => {
    const profile = await profileService.getProfile(request.params.id);
    return reply.send({ status: 'ok', data: profile });
  });

  fastify.post('/profiles', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'platform'],
        properties: {
          name: { type: 'string', minLength: 1 },
          platform: { type: 'string', enum: PLATFORMS },
          domain_id: { type: 'integer' },
          telegram_bot_token: { type: 'string' },
          telegram_chat_id: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const profile = await profileService.createProfile(request.body);
    return reply.status(201).send({ status: 'ok', data: profile });
  });

  fastify.patch('/profiles/:id', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1 },
          platform: { type: 'string', enum: PLATFORMS },
          domain_id: { type: ['integer', 'null'] },
          telegram_bot_token: { type: ['string', 'null'] },
          telegram_chat_id: { type: ['string', 'null'] }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const profile = await profileService.updateProfile(request.params.id, request.body);
    return reply.send({ status: 'ok', data: profile });
  });

  fastify.delete('/profiles/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const result = await profileService.deleteProfile(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });

  fastify.post('/profiles/:id/test-telegram', { preHandler: [requireAdmin] }, async (request, reply) => {
    const profile = await profileService.getProfile(request.params.id);

    if (!profile.telegram_bot_token || !profile.telegram_chat_id) {
      return reply.status(400).send({
        status: 'error',
        message: 'Bot não configurado neste perfil. Preencha o token e o chat ID.'
      });
    }

    const testMsg = [
      '✅ <b>Bot conectado com sucesso!</b>',
      '',
      'Monitor de links ativo para o perfil <b>' + profile.name + '</b>.',
      '',
      'Quando um link quebrar você receberá uma mensagem neste formato:',
      '',
      '🚨 <b>Link quebrado detectado!</b>',
      '📺 <b>Vídeo:</b> Título da campanha',
      '🏪 <b>Plataforma do vídeo:</b> YouTube',
      '🛒 <b>Marketplace:</b> Mercado Livre',
      '👤 <b>Perfil:</b> ' + profile.name,
      '🔗 <b>Link curto:</b> <code>https://seudominio.com/r/exemplo</code>',
      '',
      '⚠️ <b>Ação:</b> Acesse o painel e troque o link',
    ].join('\n');

    const ok = await sendTelegramMessage(profile.telegram_bot_token, profile.telegram_chat_id, testMsg);
    if (!ok) {
      return reply.status(400).send({ status: 'error', message: 'Não foi possível enviar a mensagem. Verifique o token e o chat ID.' });
    }

    return reply.send({ status: 'ok' });
  });
}
