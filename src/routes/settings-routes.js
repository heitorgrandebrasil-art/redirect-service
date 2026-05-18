import { authenticateJWT, requireRole } from '../middleware/authenticate.js';
import * as settingsService from '../services/settings-service.js';
import { linkScheduler } from '../services/link-scheduler.js';

export default async function settingsRoutes(fastify) {
  fastify.addHook('preHandler', authenticateJWT);
  fastify.addHook('preHandler', requireRole('admin'));

  fastify.get('/settings', async (request, reply) => {
    const data = await settingsService.getSettingsSnapshot();
    return reply.send({ status: 'ok', data });
  });

  fastify.patch('/settings/monitor', {
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled:         { type: 'boolean' },
          frequency_hours: { type: 'number', minimum: 0.001 },
        },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const current = (await settingsService.getSettingJson('link_monitor')) ?? {};
    const updated = { ...current, ...request.body };
    await settingsService.setSettingJson('link_monitor', updated);
    await linkScheduler.reload();
    return reply.send({ status: 'ok', data: updated });
  });

  fastify.put('/settings/openai-key', {
    schema: {
      body: {
        type: 'object',
        required: ['api_key'],
        properties: { api_key: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    await settingsService.setSetting('openai_api_key', request.body.api_key, true);
    return reply.send({ status: 'ok' });
  });
}
