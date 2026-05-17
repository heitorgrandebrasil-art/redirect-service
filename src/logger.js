import pino from 'pino';
import config from './config.js';

const logger = pino({
  name: config.appName,
  level: process.env.LOG_LEVEL || 'info',
  timestamp: pino.stdTimeFunctions.isoTime
});

export default logger;
