import { authenticateServiceKey } from '../middleware/auth.js';
import { createRedirectSchema, updateRedirectSchema } from '../middleware/validators.js';
import * as redirectService from '../services/redirect-service.js';

export default async function redirectRoutes(fastify) {
  fastify.addHook('preHandler', authenticateServiceKey);

  fastify.get('/redirects', async (request, reply) => {
    const redirects = await redirectService.listRedirects();
    return reply.send({ status: 'ok', data: redirects });
  });

  fastify.get('/redirects/analytics', async (request, reply) => {
    const analytics = await redirectService.getRedirectAnalytics();
    return reply.send({ status: 'ok', data: analytics });
  });

  fastify.get('/redirects/resolve/:short_path', async (request, reply) => {
    const redirect = await redirectService.resolveRedirect(request.params.short_path);
    return reply.send({ status: 'ok', data: redirect });
  });

  fastify.get('/redirects/:id', async (request, reply) => {
    const redirect = await redirectService.getRedirectById(request.params.id);
    return reply.send({ status: 'ok', data: redirect });
  });

  fastify.post('/redirects', { schema: createRedirectSchema }, async (request, reply) => {
    const redirect = await redirectService.createRedirect(request.body);
    return reply.status(201).send({ status: 'ok', data: redirect });
  });

  fastify.patch('/redirects/:id', { schema: updateRedirectSchema }, async (request, reply) => {
    const redirect = await redirectService.updateRedirect(request.params.id, request.body);
    return reply.send({ status: 'ok', data: redirect });
  });

  fastify.delete('/redirects/:id', async (request, reply) => {
    const result = await redirectService.deleteRedirect(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });
}
