import { query, queryOne } from '../../db'

export async function getIncidents(filters: any = {}, viewer?: any) {
  const where: string[] = []
  const params: any[] = []
  if (filters.severity) {
    params.push(filters.severity)
    where.push(`severity = $${params.length}`)
  }
  if (filters.status) {
    params.push(filters.status)
    where.push(`status = $${params.length}`)
  }
  if (filters.impactedService) {
    params.push(`%${filters.impactedService}%`)
    where.push(`impacted_services::text ILIKE $${params.length}`)
  }
  const page = Number(filters.page || 1)
  const limit = Number(filters.limit || 20)
  const offset = (page - 1) * limit
  let sql = 'SELECT * FROM incidents'
  if (where.length) sql += ' WHERE ' + where.join(' AND ')
  sql += ' ORDER BY created_at DESC'
  sql += ` LIMIT ${limit} OFFSET ${offset}`
  return query(sql, params)
}

export async function getIncidentById(id: string) {
  return queryOne('SELECT * FROM incidents WHERE id = $1', [id])
}

export async function createIncident(payload: any, creator: string) {
  const sql = `INSERT INTO incidents (title, description, severity, assignee_id, impacted_services, tags, metadata, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`
  const params = [payload.title, payload.description || null, payload.severity || 'P3', payload.assigneeId || null, JSON.stringify(payload.impactedServices || []), JSON.stringify(payload.tags || []), payload.metadata || {}, creator]
  const rows = await query(sql, params)
  return rows[0]
}

export async function updateIncident(id: string, payload: any, user: string) {
  const sets: string[] = []
  const params: any[] = []
  let idx = 1
  for (const k of Object.keys(payload)) {
    if (k === 'impactedServices' || k === 'tags' || k === 'metadata') {
      params.push(JSON.stringify((payload as any)[k] ?? null))
    } else {
      params.push((payload as any)[k])
    }
    sets.push(`${k} = $${idx}`)
    idx++
  }
  if (sets.length === 0) return getIncidentById(id)
  params.push(id)
  const sql = `UPDATE incidents SET ${sets.join(', ')}, updated_at = now() WHERE id = $${idx} RETURNING *`
  const rows = await query(sql, params)
  return rows[0]
}

export async function acknowledgeIncident(id: string, assigneeId: string) {
  const sql = `UPDATE incidents SET assignee_id = $1, status = 'investigating', updated_at = now() WHERE id = $2 RETURNING *`
  const rows = await query(sql, [assigneeId, id])
  return rows[0]
}

export async function mitigateIncident(id: string, mitigation: string, mitigatedAt?: string) {
  const sql = `UPDATE incidents SET mitigation = $1, status = 'mitigated', updated_at = now() WHERE id = $2 RETURNING *`
  const rows = await query(sql, [mitigation, id])
  return rows[0]
}
