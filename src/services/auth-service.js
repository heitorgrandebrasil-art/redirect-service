import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { query } from '../db.js';
import { NotFoundError, UnauthorizedError, ConflictError } from '../errors.js';
import { logAudit } from '../audit.js';
import config from '../config.js';

const PUBLIC_USER_COLS = 'id, name, email, role, totp_enabled, created_at, updated_at';

export async function findUserById(id) {
  const result = await query(`SELECT ${PUBLIC_USER_COLS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function findUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  return result.rows[0] || null;
}

export async function countUsers() {
  const result = await query('SELECT COUNT(*)::int AS total FROM users');
  return result.rows[0].total;
}

export async function createUser({ name, email, password, role = 'operator' }) {
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
  if (existing.rowCount) throw new ConflictError('E-mail já cadastrado');

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_USER_COLS}`,
    [name?.trim() || null, email.toLowerCase().trim(), passwordHash, role]
  );
  logAudit('user.created', { userId: result.rows[0].id, email, role });
  return result.rows[0];
}

export async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

export async function setupTOTP(userId) {
  const result = await query('SELECT id, email FROM users WHERE id = $1', [userId]);
  if (!result.rowCount) throw new NotFoundError('Usuário não encontrado');
  const user = result.rows[0];

  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: config.appName,
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret
  });

  const secretBase32 = secret.base32;
  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  await query(
    'UPDATE users SET totp_secret = $1, totp_enabled = false, updated_at = now() WHERE id = $2',
    [secretBase32, userId]
  );

  return { secret: secretBase32, uri, qrCodeDataUrl };
}

export async function enableTOTP(userId, code) {
  const result = await query('SELECT totp_secret FROM users WHERE id = $1', [userId]);
  if (!result.rowCount) throw new NotFoundError('Usuário não encontrado');
  const { totp_secret } = result.rows[0];
  if (!totp_secret) throw new ConflictError('2FA não configurado. Configure antes de ativar.');

  if (!verifyTOTPToken(totp_secret, code)) {
    throw new UnauthorizedError('Código 2FA inválido');
  }

  await query('UPDATE users SET totp_enabled = true, updated_at = now() WHERE id = $1', [userId]);
  const codes = await _generateBackupCodes(userId);
  logAudit('user.totp.enabled', { userId });
  return codes;
}

export async function disableTOTP(userId) {
  await query(
    'UPDATE users SET totp_enabled = false, totp_secret = NULL, updated_at = now() WHERE id = $1',
    [userId]
  );
  await query('DELETE FROM backup_codes WHERE user_id = $1', [userId]);
  logAudit('user.totp.disabled', { userId });
}

function verifyTOTPToken(secret, code) {
  const totp = new OTPAuth.TOTP({
    secret: OTPAuth.Secret.fromBase32(secret),
    digits: 6,
    period: 30,
    algorithm: 'SHA1'
  });
  return totp.validate({ token: code.replace(/\s/g, ''), window: 1 }) !== null;
}

export async function verifyTOTPCode(user, code) {
  if (!user.totp_secret) return false;
  return verifyTOTPToken(user.totp_secret, code);
}

async function _generateBackupCodes(userId) {
  await query('DELETE FROM backup_codes WHERE user_id = $1', [userId]);
  const codes = [];
  for (let i = 0; i < 10; i++) {
    codes.push(crypto.randomBytes(5).toString('hex'));
  }
  for (const code of codes) {
    const hash = await bcrypt.hash(code, 10);
    await query('INSERT INTO backup_codes (user_id, code_hash) VALUES ($1, $2)', [userId, hash]);
  }
  return codes;
}

export async function verifyBackupCode(userId, code) {
  const normalized = code.replace(/\s/g, '').toLowerCase();
  const result = await query(
    'SELECT * FROM backup_codes WHERE user_id = $1 AND used = false',
    [userId]
  );
  for (const row of result.rows) {
    if (await bcrypt.compare(normalized, row.code_hash)) {
      await query('UPDATE backup_codes SET used = true, used_at = now() WHERE id = $1', [row.id]);
      logAudit('user.backup_code.used', { userId });
      return true;
    }
  }
  return false;
}

export async function regenerateBackupCodes(userId) {
  const codes = await _generateBackupCodes(userId);
  logAudit('user.backup_codes.regenerated', { userId });
  return codes;
}

export async function listUsers() {
  const result = await query(
    `SELECT ${PUBLIC_USER_COLS} FROM users ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function deleteUser(id) {
  const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw new NotFoundError('Usuário não encontrado');
  logAudit('user.deleted', { userId: id });
  return { id };
}

export async function updateUserRole(id, role) {
  const result = await query(
    `UPDATE users SET role = $1, updated_at = now() WHERE id = $2
     RETURNING ${PUBLIC_USER_COLS}`,
    [role, id]
  );
  if (!result.rowCount) throw new NotFoundError('Usuário não encontrado');
  logAudit('user.role.updated', { userId: id, role });
  return result.rows[0];
}

export async function updateUser(id, { name, email, password, role }) {
  const sets = [];
  const values = [];
  let idx = 1;

  if (name !== undefined)  { sets.push(`name = $${idx++}`);          values.push(name?.trim() || null); }
  if (email !== undefined) { sets.push(`email = $${idx++}`);         values.push(email.toLowerCase().trim()); }
  if (password)            { const hash = await bcrypt.hash(password, 12);
                             sets.push(`password_hash = $${idx++}`); values.push(hash); }
  if (role !== undefined)  { sets.push(`role = $${idx++}`);          values.push(role); }

  if (sets.length === 0) throw new Error('Nenhum campo para atualizar');
  sets.push('updated_at = now()');
  values.push(id);

  const result = await query(
    `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx} RETURNING ${PUBLIC_USER_COLS}`,
    values
  );
  if (!result.rowCount) throw new NotFoundError('Usuário não encontrado');
  logAudit('user.updated', { userId: id });
  return result.rows[0];
}

export async function changePassword(userId, currentPassword, newPassword) {
  const result = await query('SELECT * FROM users WHERE id = $1', [userId]);
  if (!result.rowCount) throw new NotFoundError('Usuário não encontrado');
  const user = result.rows[0];

  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new UnauthorizedError('Senha atual incorreta');
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, userId]);
  logAudit('user.password.changed', { userId });
}
