import { query } from '../db.js';
import { NotFoundError } from '../errors.js';
import { logAudit } from '../audit.js';

export async function listProfiles() {
  const result = await query(`
    SELECT p.*, d.hostname AS domain_hostname,
           COUNT(DISTINCT v.id)::int AS campaign_count
    FROM profiles p
    LEFT JOIN domains d ON d.id = p.domain_id
    LEFT JOIN videos v ON v.profile_id = p.id
    GROUP BY p.id, d.hostname
    ORDER BY p.created_at DESC
  `);
  return result.rows;
}

export async function getProfile(id) {
  const result = await query(`
    SELECT p.*, d.hostname AS domain_hostname,
           COUNT(DISTINCT v.id)::int AS campaign_count
    FROM profiles p
    LEFT JOIN domains d ON d.id = p.domain_id
    LEFT JOIN videos v ON v.profile_id = p.id
    WHERE p.id = $1
    GROUP BY p.id, d.hostname
  `, [id]);
  if (!result.rowCount) throw new NotFoundError('Profile not found');
  return result.rows[0];
}

export async function createProfile(payload) {
  const result = await query(
    `INSERT INTO profiles (name, platform, domain_id, telegram_bot_token, telegram_chat_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      payload.name,
      payload.platform,
      payload.domain_id || null,
      payload.telegram_bot_token || null,
      payload.telegram_chat_id || null
    ]
  );
  logAudit('profile.created', { profileId: result.rows[0].id, name: payload.name });
  return result.rows[0];
}

export async function updateProfile(id, payload) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of ['name', 'platform', 'domain_id', 'telegram_bot_token', 'telegram_chat_id']) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(payload[key]);
      idx++;
    }
  }

  if (!fields.length) return getProfile(id);

  values.push(id);
  const result = await query(
    `UPDATE profiles SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    values
  );
  if (!result.rowCount) throw new NotFoundError('Profile not found');
  logAudit('profile.updated', { profileId: id });
  return result.rows[0];
}

export async function deleteProfile(id) {
  const result = await query('DELETE FROM profiles WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) throw new NotFoundError('Profile not found');
  logAudit('profile.deleted', { profileId: id });
  return { id };
}
