import { query, queryOne } from '../../db'

export async function listServices(opts: { q?: string } = {}) {
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`("name" ILIKE $${params.length} OR "description" ILIKE $${params.length})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return query(`SELECT * FROM "Service" ${where} ORDER BY "createdAt" DESC`, params)
}

export async function getService(id: number) {
  return queryOne('SELECT * FROM "Service" WHERE "id" = $1', [id])
}

export async function createService(payload: any) {
  const name = String(payload.name || '').trim()
  if (!name) throw { status: 400, message: 'Name is required' }
  const rows = await query(
    'INSERT INTO "Service" ("name", "description", "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW()) RETURNING *',
    [name, payload.description || null]
  )
  return rows[0]
}

export async function updateService(id: number, payload: any) {
  const data: any = {}
  if (payload.name !== undefined) data.name = String(payload.name).trim()
  if (payload.description !== undefined) data.description = payload.description
  try {
    const setParts: string[] = []
    const params: any[] = []
    for (const [key, value] of Object.entries(data)) {
      params.push(value)
      setParts.push(`"${key}" = $${params.length}`)
    }
    setParts.push('"updatedAt" = NOW()')
    params.push(id)
    const rows = await query(
      `UPDATE "Service" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
      params
    )
    if (!rows[0]) throw { status: 404, message: 'Service not found' }
    return rows[0]
  } catch (err: any) {
    if (err?.status === 404) throw err
    throw err
  }
}

export async function deleteService(id: number) {
  try {
    const rows = await query('DELETE FROM "Service" WHERE "id" = $1 RETURNING *', [id])
    if (!rows[0]) throw { status: 404, message: 'Service not found' }
    return rows[0]
  } catch (err: any) {
    if (err?.status === 404) throw err
    throw err
  }
}
