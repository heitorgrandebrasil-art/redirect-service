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

  // Gemini API key — save only (no test)
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
    await settingsService.setSetting('gemini_api_key', api_key, true);
    return reply.send({ status: 'ok' });
  });

  // Gemini API key — delete
  fastify.delete('/settings/gemini-key', async (request, reply) => {
    await query(`DELETE FROM app_settings WHERE key = 'gemini_api_key'`);
    return reply.send({ status: 'ok' });
  });

  // Gemini API key — test current saved key
  fastify.post('/settings/gemini-key/test', async (request, reply) => {
    const apiKey = await settingsService.getSetting('gemini_api_key');
    if (!apiKey) {
      return reply.code(404).send({ status: 'error', message: 'Nenhuma chave cadastrada' });
    }
    const testResult = await testGeminiKey(apiKey);
    if (testResult.ok) {
      await query(`UPDATE app_settings SET updated_at = now() WHERE key = 'gemini_api_key'`);
    }
    return reply.send({ status: 'ok', test: testResult });
  });

  // Check history — size info
  fastify.get('/settings/history/size', async (request, reply) => {
    const r = await query(`
      SELECT
        pg_total_relation_size('link_check_history')  AS history_bytes,
        (SELECT COUNT(*) FROM link_check_history)     AS history_rows,
        pg_total_relation_size('monthly_cycles')      AS cycles_bytes,
        (SELECT COUNT(*) FROM monthly_cycles)         AS cycles_rows
    `);
    const row = r.rows[0];
    const totalBytes = Number(row.history_bytes) + Number(row.cycles_bytes);
    return reply.send({
      status: 'ok',
      data: {
        total_bytes: totalBytes,
        total_mb: (totalBytes / 1_048_576).toFixed(2),
        history_rows: Number(row.history_rows),
        cycles_rows: Number(row.cycles_rows),
      },
    });
  });

  // Delete history for previous month only
  fastify.delete('/settings/history/previous-month', async (request, reply) => {
    const prevMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7);
    const r1 = await query(`DELETE FROM link_check_history WHERE cycle_month = $1`, [prevMonth]);
    const r2 = await query(`DELETE FROM monthly_cycles WHERE cycle_month = $1`, [prevMonth]);
    return reply.send({ status: 'ok', data: { deleted_checks: r1.rowCount, deleted_cycles: r2.rowCount, month: prevMonth } });
  });

  // Delete all history
  fastify.delete('/settings/history/all', async (request, reply) => {
    const r1 = await query(`DELETE FROM link_check_history`);
    const r2 = await query(`DELETE FROM monthly_cycles`);
    return reply.send({ status: 'ok', data: { deleted_checks: r1.rowCount, deleted_cycles: r2.rowCount } });
  });

  // Get/set retention setting
  fastify.get('/settings/history/retention', async (request, reply) => {
    const val = (await settingsService.getSettingJson('history_retention')) ?? { months: 6 };
    return reply.send({ status: 'ok', data: val });
  });

  fastify.patch('/settings/history/retention', {
    schema: {
      body: {
        type: 'object',
        required: ['months'],
        properties: { months: { type: 'integer', enum: [3, 6, 12, 0] } },
        additionalProperties: false,
      }
    }
  }, async (request, reply) => {
    await settingsService.setSettingJson('history_retention', { months: request.body.months });
    return reply.send({ status: 'ok', data: { months: request.body.months } });
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
