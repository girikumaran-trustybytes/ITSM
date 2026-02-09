import { query, queryOne } from '../../db'

export const createSupplier = async (data: any) => {
  const keys = Object.keys(data || {}).filter((k) => data[k] !== undefined)
  const cols = keys.map((k) => `"${k}"`)
  const params = keys.map((_, i) => `$${i + 1}`)
  const values = keys.map((k) => data[k])
  const text = `INSERT INTO "Supplier" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`
  const rows = await query(text, values)
  return rows[0]
}

export const updateSupplier = async (id: number, data: any) => {
  const setParts: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data || {})) {
    if (value === undefined) continue
    params.push(value)
    setParts.push(`"${key}" = $${params.length}`)
  }
  setParts.push('"updatedAt" = NOW()')
  params.push(id)
  const rows = await query(
    `UPDATE "Supplier" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`,
    params
  )
  return rows[0] ?? null
}

export const getSupplier = async (id: number) => {
  return queryOne('SELECT * FROM "Supplier" WHERE "id" = $1', [id])
}

export const listSuppliers = async (opts: { q?: string } = {}) => {
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`("companyName" ILIKE $${params.length} OR "contactName" ILIKE $${params.length} OR "contactEmail" ILIKE $${params.length})`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return query(`SELECT * FROM "Supplier" ${where} ORDER BY "companyName" ASC`, params)
}

export const deleteSupplier = async (id: number) => {
  const rows = await query('DELETE FROM "Supplier" WHERE "id" = $1 RETURNING *', [id])
  return rows[0] ?? null
}
