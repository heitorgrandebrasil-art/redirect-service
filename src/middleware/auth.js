import config from '../config.js';
import { UnauthorizedError } from '../errors.js';

export async function authenticateServiceKey(request) {
  const headerValue = request.headers[config.auth.headerName] || request.headers.authorization;
  const key = typeof headerValue === 'string' && headerValue.startsWith('Bearer ')
    ? headerValue.slice(7).trim()
    : headerValue;

  if (key && key === config.auth.internalServiceKey) {
    request.user = { type: 'service', authenticatedWith: 'service-key' };
    return;
  }

  // Also accept valid JWT access tokens so the admin panel can use existing routes
  try {
    const decoded = await request.jwtVerify();
    if (decoded.type === 'access') {
      request.user = {
        id: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        type: 'jwt',
        authenticatedWith: 'jwt'
      };
      return;
    }
  } catch {
    // Fall through to error
  }

  throw new UnauthorizedError('Authentication required');
}
