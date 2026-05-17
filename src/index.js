import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import config from './config.js';
import logger from './logger.js';
import healthRoutes from './routes/health-route.js';
import videoRoutes from './routes/video-routes.js';
import productRoutes from './routes/product-routes.js';
import domainRoutes from './routes/domain-routes.js';
import redirectRoutes from './routes/redirect-routes.js';
import { registerPublicRedirectRoutes } from './routes/public-redirect-routes.js';
import { ensureRedirectClickSchema } from './services/redirect-service.js';
import { ensureVideoCampaignSchema } from './services/video-service.js';
import { errorHandler } from './middleware/error-handler.js';

const app = Fastify({ logger, trustProxy: config.app.trustProxy });

await app.register(helmet);
await app.register(cors, {
  origin: config.cors.origin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', config.auth.headerName, 'Authorization']
});

registerPublicRedirectRoutes(app);
await app.register(healthRoutes, { prefix: config.app.basePath });
await app.register(videoRoutes, { prefix: config.app.basePath });
await app.register(productRoutes, { prefix: config.app.basePath });
await app.register(domainRoutes, { prefix: config.app.basePath });
await app.register(redirectRoutes, { prefix: config.app.basePath });

app.setErrorHandler(errorHandler);

const start = async () => {
  try {
    await ensureRedirectClickSchema();
    await ensureVideoCampaignSchema();
    await app.listen({ port: config.app.port, host: config.app.host });
    logger.info({ event: 'server.started', port: config.app.port, host: config.app.host });
    logger.info({ event: 'server.routes', routes: app.printRoutes() });
  } catch (error) {
    logger.fatal({ event: 'server.start.failed', message: error.message, stack: error.stack });
    process.exit(1);
  }
};

start();
