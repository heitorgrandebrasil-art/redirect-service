import { authenticateJWT } from '../middleware/authenticate.js';
import * as analyticsService from '../services/analytics-service.js';

export default async function analyticsRoutes(fastify) {
  fastify.addHook('preHandler', authenticateJWT);

  fastify.get('/analytics/overview', async (request, reply) => {
    const data = await analyticsService.getOverview();
    return reply.send({ status: 'ok', data });
  });
}
