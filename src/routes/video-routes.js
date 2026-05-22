import { authenticateServiceKey } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/authenticate.js';
import { createVideoSchema, updateVideoSchema, createProductSchema } from '../middleware/validators.js';
import * as videoService from '../services/video-service.js';
import { checkLinksForVideo } from '../services/link-health.js';

export default async function videoRoutes(fastify) {
  fastify.addHook('preHandler', authenticateServiceKey);

  fastify.get('/videos', async (request, reply) => {
    const videos = await videoService.listVideos();
    return reply.send({ status: 'ok', data: videos });
  });

  fastify.get('/videos/:id', async (request, reply) => {
    const video = await videoService.getVideo(request.params.id);
    return reply.send({ status: 'ok', data: video });
  });

  fastify.post('/videos', { preHandler: [requireAdmin], schema: createVideoSchema }, async (request, reply) => {
    const video = await videoService.createVideo(request.body);
    return reply.status(201).send({ status: 'ok', data: video });
  });

  fastify.patch('/videos/:id', { schema: updateVideoSchema }, async (request, reply) => {
    const video = await videoService.updateVideo(request.params.id, request.body);
    return reply.send({ status: 'ok', data: video });
  });

  fastify.delete('/videos/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const result = await videoService.deleteVideo(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });

  fastify.get('/videos/:id/products', async (request, reply) => {
    const products = await videoService.listProductsForVideo(request.params.id);
    return reply.send({ status: 'ok', data: products });
  });

  fastify.post('/videos/:id/products', { preHandler: [requireAdmin], schema: createProductSchema }, async (request, reply) => {
    const product = await videoService.createProductForVideo(request.params.id, request.body);
    return reply.status(201).send({ status: 'ok', data: product });
  });

  fastify.post('/videos/:id/check-links', async (request, reply) => {
    const result = await checkLinksForVideo(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });
}
