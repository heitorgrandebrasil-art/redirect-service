import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import config from './config.js';
import logger from './logger.js';
import { runMigrations } from './db/migrate.js';
import healthRoutes from './routes/health-route.js';
import videoRoutes from './routes/video-routes.js';
import productRoutes from './routes/product-routes.js';
import domainRoutes from './routes/domain-routes.js';
import redirectRoutes from './routes/redirect-routes.js';
import authRoutes from './routes/auth-routes.js';
import profileRoutes from './routes/profile-routes.js';
import analyticsRoutes from './routes/analytics-routes.js';
import settingsRoutes from './routes/settings-routes.js';
import telegramRoutes from './routes/telegram-routes.js';
import { registerPublicRedirectRoutes } from './routes/public-redirect-routes.js';
import { linkScheduler } from './services/link-scheduler.js';
import { ensureRedirectClickSchema } from './services/redirect-service.js';
import { ensureVideoCampaignSchema } from './services/video-service.js';
import { errorHandler } from './middleware/error-handler.js';
import * as authService from './services/auth-service.js';
import { initBrowser, closeBrowser } from './services/browser-pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ logger, trustProxy: config.app.trustProxy });

await app.register(helmet, { contentSecurityPolicy: false });
await app.register(cors, {
  origin: config.cors.origin,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', config.auth.headerName, 'Authorization']
});
await app.register(jwt, { secret: config.jwt.secret });
await app.register(cookie);

// Serve admin panel static build in production
const adminBuildPath = path.join(__dirname, '..', 'admin', 'dist');
if (config.app.nodeEnv === 'production') {
  await app.register(staticFiles, {
    root: adminBuildPath,
    prefix: '/admin',
    decorateReply: false
  });
}

registerPublicRedirectRoutes(app);
await app.register(healthRoutes, { prefix: config.app.basePath });
await app.register(authRoutes, { prefix: config.app.basePath });
await app.register(profileRoutes, { prefix: config.app.basePath });
await app.register(analyticsRoutes, { prefix: config.app.basePath });
await app.register(settingsRoutes,  { prefix: config.app.basePath });
await app.register(telegramRoutes,  { prefix: config.app.basePath });
await app.register(videoRoutes, { prefix: config.app.basePath });
await app.register(productRoutes, { prefix: config.app.basePath });
await app.register(domainRoutes, { prefix: config.app.basePath });
await app.register(redirectRoutes, { prefix: config.app.basePath });

app.setErrorHandler(errorHandler);

const start = async () => {
  try {
    await ensureRedirectClickSchema();
    await ensureVideoCampaignSchema();
    await runMigrations();
    await maybeCreateAdminUser();
    await app.listen({ port: config.app.port, host: config.app.host });
    logger.info({ event: 'server.started', port: config.app.port, host: config.app.host });
    linkScheduler.reload().catch((err) => logger.warn({ event: 'scheduler.init.error', error: err.message }));
    // Browser starts in background — API is ready before Chromium finishes launching
    initBrowser().catch((err) => logger.warn({ event: 'browser.startup.error', error: err.message }));
  } catch (error) {
    logger.fatal({ event: 'server.start.failed', message: error.message, stack: error.stack });
    process.exit(1);
  }
};

async function maybeCreateAdminUser() {
  const { email, password } = config.adminSetup;
  if (!email || !password) return;
  const count = await authService.countUsers();
  if (count > 0) return;
  await authService.createUser({ email, password, role: 'admin' });
  logger.info({ event: 'admin.auto-created', email });
}

start();

process.once('SIGTERM', () => closeBrowser().catch(() => {}));
process.once('SIGINT',  () => closeBrowser().catch(() => {}));
