import logger from './logger.js';

export function auditEvent(eventType, details = {}) {
  return {
    event: eventType,
    timestamp: new Date().toISOString(),
    details
  };
}

export function logAudit(eventType, details = {}) {
  const payload = auditEvent(eventType, details);
  logger.info({ audit: payload }, 'audit-event');
  return payload;
}
