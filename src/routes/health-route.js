import { query } from '../db.js';

export default async function healthRoutes(fastify) {
  fastify.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

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
