import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { query } from '../db.js';
import logger from '../logger.js';

const ALGORITHM = 'aes-256-gcm';

function derivedKey() {
  const raw = process.env.ENCRYPTION_KEY || 'change-me-32-byte-encryption-key!';
  return createHash('sha256').update(raw).digest();
}

export function encryptValue(text) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, derivedKey(), iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}

export function decryptValue(stored) {
  try {
    const [ivHex, tagHex, encHex] = stored.split(':');
    const decipher = createDecipheriv(ALGORITHM, derivedKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch {
    return null;
  }
}

export async function getSetting(key) {
  const r = await query('SELECT value, is_encrypted FROM app_settings WHERE key = $1', [key]);
  if (!r.rowCount) return null;
  const { value, is_encrypted } = r.rows[0];
  return is_encrypted ? decryptValue(value) : value;
}

export async function getSettingJson(key) {
  const raw = await getSetting(key);
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function setSetting(key, value, encrypt = false) {
  const stored = encrypt ? encryptValue(value) : value;
  await query(
    `INSERT INTO app_settings (key, value, is_encrypted, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (key) DO UPDATE SET value = $2, is_encrypted = $3, updated_at = now()`,
    [key, stored, encrypt]
  );
}

export async function setSettingJson(key, obj, encrypt = false) {
  await setSetting(key, JSON.stringify(obj), encrypt);
}

export async function getSettingsSnapshot() {
  const monitor = (await getSettingJson('link_monitor')) ?? {
    enabled: false, frequency_hours: 24, preferred_hour: 8, last_run: null,
  };
  const openaiKeyRow = await query(
    `SELECT value IS NOT NULL AS is_set FROM app_settings WHERE key = 'openai_api_key'`
  );
  return {
    monitor,
    openai_key_set: openaiKeyRow.rows[0]?.is_set ?? false,
  };
}
