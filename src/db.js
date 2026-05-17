import pg from 'pg';
import config from './config.js';
import logger from './logger.js';

const pool = new pg.Pool({
  user: config.db.user,
  password: config.db.password,
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis
});

pool.on('error', (error) => {
  logger.error({ event: 'db-pool-error', message: error.message, stack: error.stack });
});

export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  const duration = Date.now() - start;
  logger.debug({ event: 'db-query', text, params, duration });
  return result;
}

export async function transaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export default {
  query,
  transaction,
  pool
};
