import { query } from '../db.js';

export async function runMigrations() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator')),
      totp_secret TEXT,
      totp_enabled BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS backup_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used BOOLEAN NOT NULL DEFAULT false,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
      telegram_bot_token TEXT,
      telegram_chat_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL');
  await query('ALTER TABLE redirect_clicks ADD COLUMN IF NOT EXISTS device_type TEXT');

  await query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
  await query('CREATE INDEX IF NOT EXISTS idx_backup_codes_user_id ON backup_codes(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_profiles_domain_id ON profiles(domain_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_videos_profile_id ON videos(profile_id)');

  await query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key         TEXT PRIMARY KEY,
      value       TEXT,
      is_encrypted BOOLEAN NOT NULL DEFAULT false,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Link health tracking columns
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS link_status TEXT NOT NULL DEFAULT 'unknown'`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS link_broken_at TIMESTAMPTZ`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS link_last_status_code INTEGER`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS awaiting_confirmation BOOLEAN NOT NULL DEFAULT false`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ`);
}
