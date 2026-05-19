import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import db from '../db.js';

const TAG = '[seed]';
const stats = { created: 0, skipped: 0 };

async function ensureColumns() {
  await query('ALTER TABLE videos ADD COLUMN IF NOT EXISTS check_frequency_hours INTEGER NOT NULL DEFAULT 24');
}

async function upsertUser() {
  const email = 'admin@example.com';
  const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount) {
    console.log(`${TAG} skip  user: ${email}`);
    stats.skipped++;
    return existing.rows[0];
  }
  const hash = await bcrypt.hash('adminpassword123', 12);
  const result = await query(
    `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'admin') RETURNING id, email`,
    [email, hash]
  );
  console.log(`${TAG} + user: ${email}`);
  stats.created++;
  return result.rows[0];
}

async function upsertDomain() {
  const hostname = 'avaliatop.com.br';
  const existing = await query('SELECT id FROM domains WHERE hostname = $1', [hostname]);
  if (existing.rowCount) {
    console.log(`${TAG} skip  domain: ${hostname}`);
    stats.skipped++;
    return existing.rows[0];
  }
  const result = await query(
    `INSERT INTO domains (name, hostname, enabled) VALUES ($1, $2, true) RETURNING id`,
    ['Avaliatop', hostname]
  );
  console.log(`${TAG} + domain: ${hostname}`);
  stats.created++;
  return result.rows[0];
}

async function upsertProfile(name, platform, domainId, telegramChatId) {
  const existing = await query('SELECT id FROM profiles WHERE name = $1', [name]);
  if (existing.rowCount) {
    console.log(`${TAG} skip  profile: ${name}`);
    stats.skipped++;
    return existing.rows[0];
  }
  const result = await query(
    `INSERT INTO profiles (name, platform, domain_id, telegram_chat_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, platform, domainId || null, telegramChatId || null]
  );
  console.log(`${TAG} + profile: ${name} (${platform})`);
  stats.created++;
  return result.rows[0];
}

async function upsertCampaign(title, videoUrl, profileId, frequencyHours) {
  const existing = await query('SELECT id FROM videos WHERE title = $1', [title]);
  if (existing.rowCount) {
    console.log(`${TAG} skip  campaign: ${title}`);
    stats.skipped++;
    return existing.rows[0];
  }
  const result = await query(
    `INSERT INTO videos (title, platform, original_video_url, profile_id, check_frequency_hours)
     VALUES ($1, 'YouTube', $2, $3, $4)
     RETURNING id`,
    [title, videoUrl, profileId, frequencyHours]
  );
  console.log(`${TAG} + campaign: ${title} (${frequencyHours}h)`);
  stats.created++;
  return result.rows[0];
}

async function upsertProduct(videoId, domainId, { shortPath, title, url, marketplace, position, status }) {
  const existing = await query('SELECT id FROM products WHERE short_path = $1', [shortPath]);
  if (existing.rowCount) {
    console.log(`${TAG}   skip  link: ${shortPath}`);
    stats.skipped++;
    return;
  }

  const isBroken = status === 'broken';
  const product = await query(
    `INSERT INTO products
       (video_id, title, affiliate_url, short_path, marketplace, position, domain_id,
        link_status, link_last_checked_at,
        link_broken_at, awaiting_confirmation)
     VALUES ($1,$2,$3,$4,$5,$6,$7, $8, now(), $9, $10)
     RETURNING id`,
    [
      videoId, title, url, shortPath, marketplace, position, domainId,
      status,
      isBroken ? new Date() : null,
      isBroken,
    ]
  );

  await query(
    `INSERT INTO redirects (short_path, target_url, product_id, domain_id, active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (short_path) DO NOTHING`,
    [shortPath, url, product.rows[0].id, domainId]
  );

  console.log(`${TAG}   + link: ${shortPath} [${marketplace}] (${status})`);
  stats.created++;
}

async function main() {
  console.log('=== Seed started ===\n');

  await ensureColumns();

  await upsertUser();

  const domain = await upsertDomain();

  const profileAvaliatop = await upsertProfile('Avaliatop', 'YouTube', domain.id, '6551134109');
  await upsertProfile('Avaliatop Instagram', 'Instagram', null, null);

  // Campaign 1 — TOP 5 Carregadores Portáteis 2024
  const c1 = await upsertCampaign(
    'TOP 5 Carregadores Portáteis 2024',
    'https://www.youtube.com/watch?v=exemplo1',
    profileAvaliatop.id,
    24
  );
  await upsertProduct(c1.id, domain.id, { shortPath: 'seed-c1-amz-1', title: 'Carregador Portátil Amazon 1', url: 'https://amzn.to/3Uy2mYC',               marketplace: 'amazon',       position: 'amz-1', status: 'ok'     });
  await upsertProduct(c1.id, domain.id, { shortPath: 'seed-c1-amz-2', title: 'Carregador Portátil Amazon 2', url: 'https://amzn.to/4mIpXkV',               marketplace: 'amazon',       position: 'amz-2', status: 'broken' });
  await upsertProduct(c1.id, domain.id, { shortPath: 'seed-c1-ml-1',  title: 'Carregador Portátil ML 1',     url: 'https://mercadolivre.com/sec/26BCKok',  marketplace: 'mercadolivre', position: 'ml-1',  status: 'ok'     });
  await upsertProduct(c1.id, domain.id, { shortPath: 'seed-c1-ml-2',  title: 'Carregador Portátil ML 2',     url: 'https://mercadolivre.com/sec/18CJ4bg',  marketplace: 'mercadolivre', position: 'ml-2',  status: 'broken' });

  // Campaign 2 — Melhor Fone Bluetooth Custo Benefício
  const c2 = await upsertCampaign(
    'Melhor Fone Bluetooth Custo Benefício',
    'https://www.youtube.com/watch?v=exemplo2',
    profileAvaliatop.id,
    48
  );
  await upsertProduct(c2.id, domain.id, { shortPath: 'seed-c2-amz-1', title: 'Fone Bluetooth Amazon',  url: 'https://amzn.to/3Uy2mYC',               marketplace: 'amazon',  position: 'amz-1', status: 'ok'     });
  await upsertProduct(c2.id, domain.id, { shortPath: 'seed-c2-shp-1', title: 'Fone Bluetooth Shopee',  url: 'https://s.shopee.com.br/5Ajd1yXBvn',    marketplace: 'shopee',  position: 'shp-1', status: 'broken' });

  // Campaign 3 — Setup Gamer Completo por R$2000
  const c3 = await upsertCampaign(
    'Setup Gamer Completo por R$2000',
    'https://www.youtube.com/watch?v=exemplo3',
    profileAvaliatop.id,
    168
  );
  await upsertProduct(c3.id, domain.id, { shortPath: 'seed-c3-amz-1', title: 'Setup Gamer Amazon',  url: 'https://amzn.to/4pR2Kjv',              marketplace: 'amazon',       position: 'amz-1', status: 'broken' });
  await upsertProduct(c3.id, domain.id, { shortPath: 'seed-c3-ml-1',  title: 'Setup Gamer ML',      url: 'https://mercadolivre.com/sec/1Y92vEr',  marketplace: 'mercadolivre', position: 'ml-1',  status: 'ok'     });

  // Summary
  const [users, domains, profiles, campaigns, links] = await Promise.all([
    query('SELECT COUNT(*)::int AS n FROM users'),
    query('SELECT COUNT(*)::int AS n FROM domains'),
    query('SELECT COUNT(*)::int AS n FROM profiles'),
    query('SELECT COUNT(*)::int AS n FROM videos'),
    query('SELECT COUNT(*)::int AS n FROM products'),
  ]);

  console.log('\n=== Summary ===');
  console.log(`  Created : ${stats.created}`);
  console.log(`  Skipped : ${stats.skipped} (already existed)`);
  console.log('');
  console.log(`  Users     : ${users.rows[0].n}`);
  console.log(`  Domains   : ${domains.rows[0].n}`);
  console.log(`  Profiles  : ${profiles.rows[0].n}`);
  console.log(`  Campaigns : ${campaigns.rows[0].n}`);
  console.log(`  Links     : ${links.rows[0].n}`);
  console.log('\n=== Seed complete ===');
}

main()
  .catch((err) => { console.error('\nSeed failed:', err.message); process.exit(1); })
  .finally(() => db.pool.end());
