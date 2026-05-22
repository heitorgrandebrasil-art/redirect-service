import { authenticateServiceKey } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/authenticate.js';
import { createDomainSchema, updateDomainSchema } from '../middleware/validators.js';
import * as domainService from '../services/domain-service.js';

export default async function domainRoutes(fastify) {
  fastify.addHook('preHandler', authenticateServiceKey);

  fastify.get('/domains', async (request, reply) => {
    const domains = await domainService.listDomains();
    return reply.send({ status: 'ok', data: domains });
  });

  fastify.get('/domains/:id', async (request, reply) => {
    const domain = await domainService.getDomain(request.params.id);
    return reply.send({ status: 'ok', data: domain });
  });

  fastify.post('/domains', { preHandler: [requireAdmin], schema: createDomainSchema }, async (request, reply) => {
    const domain = await domainService.createDomain(request.body);
    return reply.status(201).send({ status: 'ok', data: domain });
  });

  fastify.patch('/domains/:id', { preHandler: [requireAdmin], schema: updateDomainSchema }, async (request, reply) => {
    const domain = await domainService.updateDomain(request.params.id, request.body);
    return reply.send({ status: 'ok', data: domain });
  });

  fastify.delete('/domains/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const result = await domainService.deleteDomain(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });
}
