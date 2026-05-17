import config from '../config.js';
import { UnauthorizedError } from '../errors.js';

export function authenticateServiceKey(request, reply, done) {
  const headerValue = request.headers[config.auth.headerName] || request.headers.authorization;
  const key = typeof headerValue === 'string' && headerValue.startsWith('Bearer ')
    ? headerValue.slice(7).trim()
    : headerValue;

  if (!key || key !== config.auth.internalServiceKey) {
    return done(new UnauthorizedError('Internal service key is required.'));
  }

  request.user = {
    type: 'service',
    authenticatedWith: 'service-key'
  };
  done();
}
