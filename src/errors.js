export class ClientError extends Error {
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends ClientError {
  constructor(message = 'Recurso não encontrado', details = null) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class UnauthorizedError extends ClientError {
  constructor(message = 'Não autorizado', details = null) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ConflictError extends ClientError {
  constructor(message = 'Conflito detectado', details = null) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class ForbiddenError extends ClientError {
  constructor(message = 'Acesso negado', details = null) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export const isClientError = (error) => error instanceof ClientError;
