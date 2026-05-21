import logger from '../logger.js';
import { isClientError } from '../errors.js';

export function errorHandler(error, request, reply) {
  const statusCode = isClientError(error) ? error.statusCode : 500;
  const payload = {
    status: 'error',
    message: isClientError(error) ? error.message : 'Ocorreu um erro inesperado',
    code: isClientError(error) ? error.code : 'INTERNAL_SERVER_ERROR'
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (statusCode >= 500) {
    logger.error({
      event: 'unhandled-error',
      message: error.message,
      stack: error.stack,
      route: request.routerPath || request.url
    });
  } else {
    logger.warn({
      event: 'client-error',
      message: error.message,
      code: payload.code,
      route: request.routerPath || request.url
    });
  }

  reply.status(statusCode).send(payload);
}
