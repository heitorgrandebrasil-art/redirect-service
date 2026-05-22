import config from '../config.js';
import * as authService from '../services/auth-service.js';
import { authenticateJWT, requireRole } from '../middleware/authenticate.js';

export default async function authRoutes(fastify) {
  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string', minLength: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body;
    const user = await authService.findUserByEmail(email);

    if (!user || !(await authService.verifyPassword(user, password))) {
      return reply.status(401).send({ status: 'error', message: 'E-mail ou senha inválidos' });
    }

    if (user.totp_enabled) {
      const tempToken = fastify.jwt.sign(
        { sub: user.id, type: 'temp_2fa', email: user.email, role: user.role },
        { expiresIn: config.jwt.tempTokenExpiry }
      );
      return reply.send({ status: 'ok', requires2fa: true, tempToken });
    }

    const accessToken = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, type: 'access' },
      { expiresIn: config.jwt.accessTokenExpiry }
    );
    const { password_hash, totp_secret, ...safeUser } = user;
    return reply.send({ status: 'ok', requires2fa: false, accessToken, user: safeUser });
  });

  fastify.post('/auth/verify-totp', {
    schema: {
      body: {
        type: 'object',
        required: ['tempToken', 'code'],
        properties: {
          tempToken: { type: 'string' },
          code: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const { tempToken, code } = request.body;

    let payload;
    try {
      payload = fastify.jwt.verify(tempToken);
    } catch {
      return reply.status(401).send({ status: 'error', message: 'Token inválido ou expirado' });
    }

    if (payload.type !== 'temp_2fa') {
      return reply.status(401).send({ status: 'error', message: 'Tipo de token inválido' });
    }

    const user = await authService.findUserByEmail(payload.email);
    if (!user) {
      return reply.status(401).send({ status: 'error', message: 'Usuário não encontrado' });
    }

    const clean = code.replace(/\s/g, '');
    let usedBackupCode = false;
    const totpOk = await authService.verifyTOTPCode(user, clean);
    if (!totpOk) {
      const backupOk = await authService.verifyBackupCode(user.id, clean);
      if (!backupOk) {
        return reply.status(401).send({ status: 'error', message: 'Código inválido' });
      }
      usedBackupCode = true;
    }

    const accessToken = fastify.jwt.sign(
      { sub: user.id, email: user.email, role: user.role, type: 'access' },
      { expiresIn: config.jwt.accessTokenExpiry }
    );
    const { password_hash, totp_secret, ...safeUser } = user;
    return reply.send({ status: 'ok', accessToken, user: safeUser, usedBackupCode });
  });

  fastify.get('/auth/me', { preHandler: [authenticateJWT] }, async (request, reply) => {
    const user = await authService.findUserById(request.user.id);
    return reply.send({ status: 'ok', data: user });
  });

  fastify.post('/auth/setup-totp', { preHandler: [authenticateJWT] }, async (request, reply) => {
    const result = await authService.setupTOTP(request.user.id);
    return reply.send({ status: 'ok', data: result });
  });

  fastify.post('/auth/enable-totp', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string' } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const codes = await authService.enableTOTP(request.user.id, request.body.code);
    return reply.send({ status: 'ok', data: { backupCodes: codes } });
  });

  fastify.post('/auth/disable-totp', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword'],
        properties: { currentPassword: { type: 'string' } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const user = await authService.findUserByEmail(request.user.email);
    if (!user || !(await authService.verifyPassword(user, request.body.currentPassword))) {
      return reply.status(401).send({ status: 'error', message: 'Senha incorreta' });
    }
    await authService.disableTOTP(request.user.id);
    return reply.send({ status: 'ok' });
  });

  fastify.post('/auth/regenerate-backup-codes', { preHandler: [authenticateJWT] }, async (request, reply) => {
    const codes = await authService.regenerateBackupCodes(request.user.id);
    return reply.send({ status: 'ok', data: { backupCodes: codes } });
  });

  fastify.post('/auth/change-password', {
    preHandler: [authenticateJWT],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string' },
          newPassword: { type: 'string', minLength: 8 }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    await authService.changePassword(request.user.id, request.body.currentPassword, request.body.newPassword);
    return reply.send({ status: 'ok' });
  });

  // User management (admin only)
  fastify.get('/users', { preHandler: [authenticateJWT, requireRole('admin')] }, async (request, reply) => {
    const users = await authService.listUsers();
    return reply.send({ status: 'ok', data: users });
  });

  fastify.post('/users', {
    preHandler: [authenticateJWT, requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string', minLength: 8 },
          role: { type: 'string', enum: ['admin', 'operator'] }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const user = await authService.createUser(request.body);
    return reply.status(201).send({ status: 'ok', data: user });
  });

  fastify.delete('/users/:id', {
    preHandler: [authenticateJWT, requireRole('admin')]
  }, async (request, reply) => {
    if (Number(request.params.id) === request.user.id) {
      return reply.status(400).send({ status: 'error', message: 'Não é possível excluir sua própria conta' });
    }
    const result = await authService.deleteUser(request.params.id);
    return reply.send({ status: 'ok', data: result });
  });

  fastify.patch('/users/:id/role', {
    preHandler: [authenticateJWT, requireRole('admin')],
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: { role: { type: 'string', enum: ['admin', 'operator'] } },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    const user = await authService.updateUserRole(request.params.id, request.body.role);
    return reply.send({ status: 'ok', data: user });
  });
}
