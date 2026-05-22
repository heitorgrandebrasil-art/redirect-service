import { authenticateServiceKey } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/authenticate.js';
import { createProductSchema, updateProductSchema } from '../middleware/validators.js';
import * as productService from '../services/product-service.js';

export default async function productRoutes(fastify) {
  fastify.addHook('preHandler', authenticateServiceKey);

  fastify.get('/products', async (request, reply) => {
    const products = await productService.listProducts();
    return reply.send({ status: 'ok', data: products });
  });

  fastify.get('/products/:id', async (request, reply) => {
    const product = await productService.getProduct(request.params.id);
    return reply.send({ status: 'ok', data: product });
  });

  fastify.post('/products', { preHandler: [requireAdmin], schema: createProductSchema }, async (request, reply) => {
    const product = await productService.createProduct(request.body);
    return reply.status(201).send({ status: 'ok', data: product });
  });

  fastify.patch('/products/:id', { schema: updateProductSchema }, async (request, reply) => {
    const product = await productService.updateProduct(request.params.id, request.body);
    return reply.send({ status: 'ok', data: product });
  });

  fastify.post('/products/:id/replace-link', {
    schema: {
      body: {
        type: 'object',
        required: ['affiliate_url'],
        properties: {
          affiliate_url: { type: 'string', minLength: 10 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const product = await productService.replaceAffiliateUrl(request.params.id, request.body.affiliate_url);
    return reply.send({ status: 'ok', data: product });
  });

  fastify.delete('/products/:id', { preHandler: [requireAdmin] }, async (request, reply) => {
    const result = await productService.deleteProduct(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });
}
