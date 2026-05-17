-- Redirect service PostgreSQL schema

CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  platform TEXT,
  original_video_url TEXT,
  notes TEXT,
  publish_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS domains (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  hostname TEXT NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  video_id INTEGER REFERENCES videos(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  affiliate_url TEXT NOT NULL,
  short_path TEXT NOT NULL UNIQUE,
  marketplace TEXT NOT NULL,
  position TEXT,
  domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS redirects (
  id SERIAL PRIMARY KEY,
  short_path TEXT NOT NULL UNIQUE,
  target_url TEXT NOT NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  domain_id INTEGER REFERENCES domains(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redirects_short_path_active ON redirects(short_path, active);
CREATE INDEX IF NOT EXISTS idx_products_video_id ON products(video_id);
CREATE INDEX IF NOT EXISTS idx_products_domain_id ON products(domain_id);
CREATE INDEX IF NOT EXISTS idx_products_video_position ON products(video_id, position);

CREATE TABLE IF NOT EXISTS redirect_clicks (
  id BIGSERIAL PRIMARY KEY,
  redirect_id INTEGER REFERENCES redirects(id) ON DELETE SET NULL,
  short_path TEXT NOT NULL,
  target_url TEXT NOT NULL,
  status_code INTEGER,
  ip TEXT,
  user_agent TEXT,
  referer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_redirect_clicks_redirect_id ON redirect_clicks(redirect_id);
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_created_at ON redirect_clicks(created_at);
CREATE INDEX IF NOT EXISTS idx_redirect_clicks_short_path ON redirect_clicks(short_path);
