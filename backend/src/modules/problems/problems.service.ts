import { query, queryOne } from '../../db'

export async function listProblems(opts: { q?: string } = {}) {
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`("code" ILIKE $${params.length} OR "title" ILIKE $${params.length})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return query(`SELECT * FROM "Problem" ${where} ORDER BY "createdAt" DESC`, params)
}

export async function getProblem(id: number) {
  return queryOne('SELECT * FROM "Problem" WHERE "id" = $1', [id])
}

export async function createProblem(payload: any) {
  const code = String(payload.code || '').trim()
  const title = String(payload.title || '').trim()
  if (!code) throw { status: 400, message: 'Code is required' }
  if (!title) throw { status: 400, message: 'Title is required' }
  const rows = await query(
    'INSERT INTO "Problem" ("code", "title", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *',
    [code, title, payload.status || null]
  )
  return rows[0]
}

export async function updateProblem(id: number, payload: any) {
  const data: any = {}
  if (payload.code !== undefined) data.code = String(payload.code).trim()
  if (payload.title !== undefined) data.title = String(payload.title).trim()
  if (payload.status !== undefined) data.status = payload.status
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
      `UPDATE "Problem" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
      params
    )
    if (!rows[0]) throw { status: 404, message: 'Problem not found' }
    return rows[0]
  } catch (err: any) {
    if (err?.status === 404) throw err
    throw err
  }
}

export async function deleteProblem(id: number) {
  try {
    const rows = await query('DELETE FROM "Problem" WHERE "id" = $1 RETURNING *', [id])
    if (!rows[0]) throw { status: 404, message: 'Problem not found' }
    return rows[0]
  } catch (err: any) {
    if (err?.status === 404) throw err
    throw err
  }
}
