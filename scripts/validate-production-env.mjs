import fs from 'node:fs';

const envPath = process.argv[2] || '.env.production';

function parseEnv(path) {
  const values = {};
  const body = fs.readFileSync(path, 'utf8');

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eq = trimmed.indexOf('=');
    if (eq === -1) {
      continue;
    }

    values[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }

  return values;
}

const env = parseEnv(envPath);
const required = [
  'NODE_ENV',
  'INTERNAL_SERVICE_KEY',
  'PUBLIC_BASE_URL',
  'CORS_ORIGIN',
  'PGHOST',
  'PGPORT',
  'PGUSER',
  'PGPASSWORD',
  'PGDATABASE',
  'RDI_API_URL',
  'RDI_PUBLIC_BASE_URL',
  'RDI_INTERNAL_SERVICE_KEY',
  'WP_DB_USER',
  'WP_DB_PASSWORD',
  'WP_DB_ROOT_PASSWORD',
  'WP_DB_NAME'
];

const unsafe = new Set([
  'change-me-secret',
  'dev-internal-key-please-change',
  'change-me-to-a-secure-random-value',
  'change-me-very-strong-password',
  'change-me-root-password',
  'strong_wp_password',
  'postgres',
  'rs_password',
  'http://localhost:4000',
  '*'
]);

const errors = [];

for (const key of required) {
  if (!env[key]) {
    errors.push(`${key} is required`);
  } else if (unsafe.has(env[key])) {
    errors.push(`${key} still uses an unsafe placeholder`);
  }
}

if (env.NODE_ENV !== 'production') {
  errors.push('NODE_ENV must be production');
}

for (const key of ['PUBLIC_BASE_URL', 'RDI_PUBLIC_BASE_URL']) {
  if (env[key] && !env[key].startsWith('https://')) {
    errors.push(`${key} must use https:// in production`);
  }
}

if (env.CORS_ORIGIN && env.CORS_ORIGIN.split(',').some((origin) => !origin.trim().startsWith('https://'))) {
  errors.push('CORS_ORIGIN must contain only explicit https:// origins in production');
}

if (env.INTERNAL_SERVICE_KEY && env.RDI_INTERNAL_SERVICE_KEY && env.INTERNAL_SERVICE_KEY !== env.RDI_INTERNAL_SERVICE_KEY) {
  errors.push('INTERNAL_SERVICE_KEY and RDI_INTERNAL_SERVICE_KEY must match');
}

if (errors.length) {
  console.error(`Production env validation failed for ${envPath}:`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(`Production env validation passed for ${envPath}`);
