import { query } from '../db.js';
import { NotFoundError } from '../errors.js';
import { logAudit } from '../audit.js';

export async function listDomains() {
  const result = await query('SELECT * FROM domains ORDER BY name ASC');
  return result.rows;
}

export async function getDomain(id) {
  const result = await query('SELECT * FROM domains WHERE id = $1', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Domínio não encontrado');
  }
  return result.rows[0];
}

export async function createDomain(payload) {
  const result = await query(
    `INSERT INTO domains (name, hostname, enabled)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [payload.name, payload.hostname, payload.enabled ?? true]
  );

  logAudit('domain.created', { domainId: result.rows[0].id, hostname: payload.hostname });
  return result.rows[0];
}

export async function updateDomain(id, payload) {
  const fields = [];
  const values = [];
  let idx = 1;

  for (const key of ['name', 'hostname', 'enabled']) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(payload[key]);
      idx += 1;
    }
  }

  if (!fields.length) {
    return getDomain(id);
  }

  values.push(id);
  const result = await query(
    `UPDATE domains SET ${fields.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`,
    values
  );

  if (!result.rowCount) {
    throw new NotFoundError('Domínio não encontrado');
  }

  logAudit('domain.updated', { domainId: id, updates: payload });
  return result.rows[0];
}

export async function deleteDomain(id) {
  const result = await query('DELETE FROM domains WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {
    throw new NotFoundError('Domínio não encontrado');
  }
  logAudit('domain.deleted', { domainId: id });
  return { id };
}
