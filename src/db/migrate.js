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

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT`);
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
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS link_last_checked_at TIMESTAMPTZ`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS monitoring_enabled BOOLEAN NOT NULL DEFAULT true`);

  // Gemini analysis result columns
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_gemini_status TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_gemini_confidence FLOAT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_gemini_reason TEXT`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS last_screenshot_path TEXT`);

  // Human feedback log for learning
  await query(`
    CREATE TABLE IF NOT EXISTS link_feedbacks (
      id SERIAL PRIMARY KEY,
      product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      marketplace TEXT,
      playwright_said TEXT,
      gemini_said TEXT,
      human_said TEXT NOT NULL CHECK (human_said IN ('ok', 'broken')),
      screenshot_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_link_feedbacks_product_id ON link_feedbacks(product_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_link_feedbacks_created_at ON link_feedbacks(created_at DESC)`);

  // Priority-based scheduling columns
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS priority_tier TEXT NOT NULL DEFAULT 'cold'`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS next_check_at TIMESTAMPTZ`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS monthly_clicks INT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS priority_recalculated_at TIMESTAMPTZ`);
  await query(`CREATE INDEX IF NOT EXISTS idx_products_next_check ON products(next_check_at) WHERE monitoring_enabled = true`);

  // Link check history
  await query(`
    CREATE TABLE IF NOT EXISTS link_check_history (
      id             SERIAL PRIMARY KEY,
      product_id     INTEGER REFERENCES products(id) ON DELETE CASCADE,
      url            TEXT NOT NULL,
      marketplace    TEXT,
      playwright_status TEXT,
      gemini_status  TEXT,
      final_status   TEXT NOT NULL,
      reason         TEXT,
      confidence     FLOAT,
      human_feedback TEXT,
      cycle_month    TEXT,
      checked_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_lch_product_id ON link_check_history(product_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lch_checked_at ON link_check_history(checked_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_lch_cycle_month ON link_check_history(cycle_month)`);

  // Monthly cycle tracking
  // Remove orphaned products (video deleted) and Shopee products (marketplace removed)
  await query(`
    DELETE FROM products
    WHERE video_id IS NOT NULL
      AND video_id NOT IN (SELECT id FROM videos)
  `);
  await query(`DELETE FROM products WHERE LOWER(marketplace) = 'shopee'`);

  await query(`
    CREATE TABLE IF NOT EXISTS monthly_cycles (
      id               SERIAL PRIMARY KEY,
      cycle_month      TEXT NOT NULL UNIQUE,
      total_checked    INT NOT NULL DEFAULT 0,
      total_ok         INT NOT NULL DEFAULT 0,
      total_broken     INT NOT NULL DEFAULT 0,
      total_human_review INT NOT NULL DEFAULT 0,
      gemini_calls     INT NOT NULL DEFAULT 0,
      started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
      ended_at         TIMESTAMPTZ
    )
  `);
}
