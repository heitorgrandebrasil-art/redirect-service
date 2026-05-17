import { query } from '../db.js';
import config from '../config.js';
import { authenticateJWT, requireRole } from '../middleware/authenticate.js';
import { checkAllLinks } from '../services/link-health.js';

export default async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  // Manual link health check — admin only
  fastify.post('/admin/check-links', {
    preHandler: [authenticateJWT, requireRole('admin')]
  }, async (request, reply) => {
    const result = await checkAllLinks();
    return reply.send({ status: 'ok', data: result });
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
