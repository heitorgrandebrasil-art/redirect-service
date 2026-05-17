import { UnauthorizedError, ForbiddenError } from '../errors.js';

export async function authenticateJWT(request) {
  try {
    const decoded = await request.jwtVerify();
    if (decoded.type !== 'access') throw new Error('Invalid token type');
    request.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role,
      type: 'jwt'
    };
  } catch (err) {
    throw new UnauthorizedError(err.message || 'Authentication required');
  }
}

export function requireRole(...roles) {
  return async function checkRole(request) {
    if (!request.user || !roles.includes(request.user.role)) {
      throw new ForbiddenError(`Requires role: ${roles.join(' or ')}`);
    }
  };
}
