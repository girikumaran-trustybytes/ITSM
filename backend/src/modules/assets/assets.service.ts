import { query, queryOne } from '../../db'

function buildAssetWhere(opts: {
  q?: string
  status?: string
  category?: string
  assignedToId?: number
}) {
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`("assetId" ILIKE $${params.length} OR "name" ILIKE $${params.length} OR "serial" ILIKE $${params.length} OR "category" ILIKE $${params.length} OR "supplier" ILIKE $${params.length})`)
  }
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`"status" = $${params.length}`)
  }
  if (opts.category) {
    params.push(opts.category)
    conditions.push(`"category" = $${params.length}`)
  }
  if (opts.assignedToId !== undefined) {
    params.push(opts.assignedToId)
    conditions.push(`"assignedToId" = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return { where, params }
}

function buildInsert(table: string, data: Record<string, any>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined)
  const cols = keys.map((k) => `"${k}"`)
  const params = keys.map((_, i) => `$${i + 1}`)
  const values = keys.map((k) => data[k])
  const text = `INSERT INTO "${table}" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`
  return { text, values }
}

function buildUpdate(table: string, id: number, data: Record<string, any>) {
  const setParts: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    params.push(value)
    setParts.push(`"${key}" = $${params.length}`)
  }
  setParts.push('"updatedAt" = NOW()')
  params.push(id)
  const text = `UPDATE "${table}" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`
  return { text, params }
}

export async function listAssets(opts: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  category?: string
  assignedToId?: number
} = {}) {
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 20
  const { where, params } = buildAssetWhere(opts)
  const offset = (page - 1) * pageSize
  const itemsPromise = query(
    `SELECT a.*, row_to_json(u) AS "assignedTo", row_to_json(p) AS "parentAsset"
     FROM "Asset" a
     LEFT JOIN "User" u ON u."id" = a."assignedToId"
     LEFT JOIN "Asset" p ON p."id" = a."parentAssetId"
     ${where}
     ORDER BY a."createdAt" DESC
     OFFSET $${params.length + 1}
     LIMIT $${params.length + 2}`,
    [...params, offset, pageSize]
  )
  const totalPromise = queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM "Asset" ${where}`,
    params
  )
  const [items, totalRow] = await Promise.all([itemsPromise, totalPromise])
  const total = Number(totalRow?.count || 0)

  return { items, total, page, pageSize }
}

export async function getAssetById(id: number) {
  const asset = await queryOne<any>(
    `SELECT a.*, row_to_json(u) AS "assignedTo", row_to_json(p) AS "parentAsset"
     FROM "Asset" a
     LEFT JOIN "User" u ON u."id" = a."assignedToId"
     LEFT JOIN "Asset" p ON p."id" = a."parentAssetId"
     WHERE a."id" = $1`,
    [id]
  )
  if (!asset) return null

  const [childAssets, tickets, assetChanges, assetProblems, assetServices] = await Promise.all([
    query('SELECT * FROM "Asset" WHERE "parentAssetId" = $1', [id]),
    query('SELECT * FROM "Ticket" WHERE "assetId" = $1', [id]),
    query(
      `SELECT ac.*, row_to_json(c) AS "change"
       FROM "AssetChange" ac
       JOIN "Change" c ON c."id" = ac."changeId"
       WHERE ac."assetId" = $1`,
      [id]
    ),
    query(
      `SELECT ap.*, row_to_json(p) AS "problem"
       FROM "AssetProblem" ap
       JOIN "Problem" p ON p."id" = ap."problemId"
       WHERE ap."assetId" = $1`,
      [id]
    ),
    query(
      `SELECT asv.*, row_to_json(s) AS "service"
       FROM "AssetService" asv
       JOIN "Service" s ON s."id" = asv."serviceId"
       WHERE asv."assetId" = $1`,
      [id]
    ),
  ])

  asset.childAssets = childAssets
  asset.tickets = tickets
  asset.assetChanges = assetChanges
  asset.assetProblems = assetProblems
  asset.assetServices = assetServices
  return asset
}

export async function createAsset(data: any) {
  const { text, values } = buildInsert('Asset', data)
  const rows = await query(text, values)
  return rows[0]
}

export async function updateAsset(id: number, data: any) {
  const { text, params } = buildUpdate('Asset', id, data)
  const rows = await query(text, params)
  return rows[0]
}

export async function deleteAsset(id: number) {
  const rows = await query('DELETE FROM "Asset" WHERE "id" = $1 RETURNING *', [id])
  return rows[0]
}

export async function linkTicketsToAsset(assetId: number, ticketIds: string[]) {
  await query('UPDATE "Ticket" SET "assetId" = NULL WHERE "assetId" = $1', [assetId])
  if (ticketIds.length === 0) return
  const numericIds = ticketIds.map((t) => Number(t)).filter((n) => !Number.isNaN(n))
  if (numericIds.length) {
    await query(
      'UPDATE "Ticket" SET "assetId" = $1 WHERE "ticketId" = ANY($2) OR "id" = ANY($3)',
      [assetId, ticketIds, numericIds]
    )
  } else {
    await query(
      'UPDATE "Ticket" SET "assetId" = $1 WHERE "ticketId" = ANY($2)',
      [assetId, ticketIds]
    )
  }
}

export async function setAssetChanges(assetId: number, changeIds: number[]) {
  await query('DELETE FROM "AssetChange" WHERE "assetId" = $1', [assetId])
  if (!changeIds.length) return
  const values: any[] = []
  const placeholders = changeIds.map((changeId, i) => {
    values.push(assetId, changeId)
    const idx = i * 2
    return `($${idx + 1}, $${idx + 2})`
  })
  await query(
    `INSERT INTO "AssetChange" ("assetId", "changeId") VALUES ${placeholders.join(', ')}`,
    values
  )
}

export async function setAssetProblems(assetId: number, problemIds: number[]) {
  await query('DELETE FROM "AssetProblem" WHERE "assetId" = $1', [assetId])
  if (!problemIds.length) return
  const values: any[] = []
  const placeholders = problemIds.map((problemId, i) => {
    values.push(assetId, problemId)
    const idx = i * 2
    return `($${idx + 1}, $${idx + 2})`
  })
  await query(
    `INSERT INTO "AssetProblem" ("assetId", "problemId") VALUES ${placeholders.join(', ')}`,
    values
  )
}

export async function setAssetServices(assetId: number, serviceIds: number[]) {
  await query('DELETE FROM "AssetService" WHERE "assetId" = $1', [assetId])
  if (!serviceIds.length) return
  const values: any[] = []
  const placeholders = serviceIds.map((serviceId, i) => {
    values.push(assetId, serviceId)
    const idx = i * 2
    return `($${idx + 1}, $${idx + 2})`
  })
  await query(
    `INSERT INTO "AssetService" ("assetId", "serviceId") VALUES ${placeholders.join(', ')}`,
    values
  )
}
