import { query } from '../db.js';
import { authenticateJWT, requireRole } from '../middleware/authenticate.js';
import * as settingsService from '../services/settings-service.js';
import { linkScheduler } from '../services/link-scheduler.js';
import { testGeminiKey } from '../services/gemini-service.js';

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

  // Gemini API key — save + test
  fastify.post('/settings/gemini-key', {
    schema: {
      body: {
        type: 'object',
        required: ['api_key'],
        properties: { api_key: { type: 'string', minLength: 1 } },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    const { api_key } = request.body;
    const testResult = await testGeminiKey(api_key);
    if (!testResult.ok) {
      return reply.send({ status: 'ok', test: { ok: false, error: testResult.error, code: testResult.code } });
    }
    await settingsService.setSetting('gemini_api_key', api_key, true);
    return reply.send({ status: 'ok', test: { ok: true } });
  });

  // Gemini API key — delete
  fastify.delete('/settings/gemini-key', async (request, reply) => {
    await query(`DELETE FROM app_settings WHERE key = 'gemini_api_key'`);
    return reply.send({ status: 'ok' });
  });

  // Verification history — stats + last 50 feedbacks
  fastify.get('/settings/verification-history', async (request, reply) => {
    const totalRow = await query(`SELECT COUNT(*) AS total FROM link_feedbacks`);
    const geminiRow = await query(`
      SELECT
        COUNT(*) FILTER (WHERE gemini_said IS NOT NULL) AS gemini_total,
        COUNT(*) FILTER (WHERE gemini_said = human_said AND gemini_said IS NOT NULL) AS gemini_correct,
        COUNT(*) FILTER (WHERE gemini_said = 'uncertain') AS gemini_uncertain
      FROM link_feedbacks
    `);
    const verdictRow = await query(`
      SELECT human_said, COUNT(*) AS cnt FROM link_feedbacks GROUP BY human_said
    `);
    const feedbacks = await query(`
      SELECT lf.id, lf.url, lf.marketplace, lf.playwright_said, lf.gemini_said,
             lf.human_said, lf.created_at, p.title AS product_title
      FROM link_feedbacks lf
      LEFT JOIN products p ON p.id = lf.product_id
      ORDER BY lf.created_at DESC
      LIMIT 50
    `);
    const verdicts = Object.fromEntries(verdictRow.rows.map((r) => [r.human_said, Number(r.cnt)]));
    return reply.send({
      status: 'ok',
      data: {
        total: Number(totalRow.rows[0].total),
        gemini_total: Number(geminiRow.rows[0].gemini_total),
        gemini_correct: Number(geminiRow.rows[0].gemini_correct),
        gemini_uncertain: Number(geminiRow.rows[0].gemini_uncertain),
        human_ok: verdicts.ok ?? 0,
        human_broken: verdicts.broken ?? 0,
        feedbacks: feedbacks.rows,
      },
    });
  });
}
