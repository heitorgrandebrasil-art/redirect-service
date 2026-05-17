import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const env = process.env;

function parseOrigins(value) {
  if (!value || value === '*') {
    return true;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function requireProductionValue(name, value, invalidValues = []) {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  if (!value || invalidValues.includes(value)) {
    throw new Error(`Missing or unsafe production environment value: ${name}`);
  }
}

const config = {
  app: {
    port: Number(env.PORT || 4000),
    host: env.HOST || '0.0.0.0',
    basePath: env.API_BASE_PATH || '/api/v1',
    publicBaseUrl: (env.PUBLIC_BASE_URL || 'http://localhost:4000').replace(/\/+$/, ''),
    trustProxy: env.TRUST_PROXY === 'true' || env.NODE_ENV === 'production',
    nodeEnv: env.NODE_ENV || 'development'
  },
  cors: {
    origin: parseOrigins(env.CORS_ORIGIN || (env.NODE_ENV === 'production' ? '' : '*'))
  },
  auth: {
    internalServiceKey: env.INTERNAL_SERVICE_KEY || 'change-me-secret',
    headerName: 'x-service-key'
  },
  db: {
    user: env.PGUSER || env.DB_USER || 'postgres',
    password: env.PGPASSWORD || env.DB_PASSWORD || '',
    host: env.PGHOST || env.DB_HOST || 'localhost',
    port: Number(env.PGPORT || env.DB_PORT || 5432),
    database: env.PGDATABASE || env.DB_NAME || 'redirect_service',
    max: Number(env.PGPOOL_MAX || 10),
    idleTimeoutMillis: Number(env.PG_IDLE_TIMEOUT || 30000)
  },
  appName: env.APP_NAME || 'redirect-service'
};

requireProductionValue('INTERNAL_SERVICE_KEY', config.auth.internalServiceKey, [
  'change-me-secret',
  'dev-internal-key-please-change',
  'change-me-to-a-secure-random-value'
]);
requireProductionValue('PGPASSWORD', config.db.password, ['postgres', 'rs_password', 'change-me-very-strong-password']);
requireProductionValue('PUBLIC_BASE_URL', config.app.publicBaseUrl, ['http://localhost:4000']);
requireProductionValue('CORS_ORIGIN', env.CORS_ORIGIN || '', ['*']);

export default config;
