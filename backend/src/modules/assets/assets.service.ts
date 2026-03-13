import { query, queryOne } from '../../db'

const DEFAULT_ASSET_CATEGORY = 'Uncategorised'
let assetSchemaReady = false

async function ensureAssetSchema() {
  if (assetSchemaReady) return
  await query(`
    ALTER TABLE "Asset"
    ADD COLUMN IF NOT EXISTS "customFields" JSONB NOT NULL DEFAULT '{}'::jsonb
  `)
  await query(`
    ALTER TABLE "Asset"
    ADD COLUMN IF NOT EXISTS "assetTypeId" TEXT
  `)
  await query(`
    ALTER TABLE "Asset"
    ADD COLUMN IF NOT EXISTS "displayName" TEXT,
    ADD COLUMN IF NOT EXISTS "description" TEXT,
    ADD COLUMN IF NOT EXISTS "impact" TEXT,
    ADD COLUMN IF NOT EXISTS "usageType" TEXT,
    ADD COLUMN IF NOT EXISTS "domain" TEXT,
    ADD COLUMN IF NOT EXISTS "region" TEXT,
    ADD COLUMN IF NOT EXISTS "availabilityZone" TEXT,
    ADD COLUMN IF NOT EXISTS "managedByGroup" TEXT,
    ADD COLUMN IF NOT EXISTS "company" TEXT,
    ADD COLUMN IF NOT EXISTS "usedBy" TEXT,
    ADD COLUMN IF NOT EXISTS "managedBy" TEXT,
    ADD COLUMN IF NOT EXISTS "assignedOn" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "hardwareType" TEXT,
    ADD COLUMN IF NOT EXISTS "physicalSubtype" TEXT,
    ADD COLUMN IF NOT EXISTS "virtualSubtype" TEXT,
    ADD COLUMN IF NOT EXISTS "product" TEXT,
    ADD COLUMN IF NOT EXISTS "cpuSpeed" TEXT,
    ADD COLUMN IF NOT EXISTS "cpuCoreCount" TEXT,
    ADD COLUMN IF NOT EXISTS "osServicePack" TEXT,
    ADD COLUMN IF NOT EXISTS "uuid" TEXT,
    ADD COLUMN IF NOT EXISTS "hostname" TEXT,
    ADD COLUMN IF NOT EXISTS "lastLoginBy" TEXT,
    ADD COLUMN IF NOT EXISTS "vendor" TEXT,
    ADD COLUMN IF NOT EXISTS "acquisitionType" TEXT,
    ADD COLUMN IF NOT EXISTS "rentalProvider" TEXT,
    ADD COLUMN IF NOT EXISTS "rentalStartDate" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "rentalEndDate" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "rentalMonthlyCost" NUMERIC,
    ADD COLUMN IF NOT EXISTS "rentalTotalCost" NUMERIC,
    ADD COLUMN IF NOT EXISTS "maintenanceIncluded" BOOLEAN,
    ADD COLUMN IF NOT EXISTS "contractNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "returnCondition" TEXT,
    ADD COLUMN IF NOT EXISTS "acquisitionDate" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "cost" NUMERIC,
    ADD COLUMN IF NOT EXISTS "salvageValue" NUMERIC,
    ADD COLUMN IF NOT EXISTS "depreciationType" TEXT,
    ADD COLUMN IF NOT EXISTS "warrantyYears" NUMERIC,
    ADD COLUMN IF NOT EXISTS "warrantyMonths" NUMERIC,
    ADD COLUMN IF NOT EXISTS "warrantyExpiryAt" TIMESTAMP,
    ADD COLUMN IF NOT EXISTS "itemId" TEXT,
    ADD COLUMN IF NOT EXISTS "itemName" TEXT,
    ADD COLUMN IF NOT EXISTS "publicAddress" TEXT,
    ADD COLUMN IF NOT EXISTS "instanceState" TEXT,
    ADD COLUMN IF NOT EXISTS "instanceType" TEXT,
    ADD COLUMN IF NOT EXISTS "provider" TEXT,
    ADD COLUMN IF NOT EXISTS "creationTimestamp" TIMESTAMP
  `)
  assetSchemaReady = true
}

export async function getNextAssetId() {
  await ensureAssetSchema()
  const row = await queryOne<{ max: number | null }>(`
    SELECT COALESCE(MAX(CASE WHEN "assetId" ~ '^[0-9]+$' THEN "assetId"::int END), 0) AS max
    FROM "Asset"
  `)
  const next = (row?.max || 0) + 1
  return String(next)
}

function normalizeAssetCategory(value: any) {
  const next = String(value || '').trim()
  return next || DEFAULT_ASSET_CATEGORY
}

function normalizeAssetRow<T extends Record<string, any>>(row: T): T {
  if (!row || typeof row !== 'object') return row
  return {
    ...row,
    category: normalizeAssetCategory((row as any).category),
  } as T
}

function buildAssetWhere(opts: {
  q?: string
  status?: string
  category?: string
  assignedToId?: number
  assignedUserEmail?: string
}) {
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`("assetId" ILIKE $${params.length} OR "serial" ILIKE $${params.length} OR "category" ILIKE $${params.length} OR "supplier" ILIKE $${params.length})`)
  }
  if (opts.status) {
    params.push(opts.status)
    conditions.push(`"status" = $${params.length}`)
  }
  if (opts.category) {
    params.push(opts.category)
    conditions.push(`"category" = $${params.length}`)
  }
  if (opts.assignedToId !== undefined && opts.assignedUserEmail) {
    params.push(opts.assignedToId)
    const assignedIdParam = params.length
    params.push(String(opts.assignedUserEmail).trim().toLowerCase())
    const assignedEmailParam = params.length
    conditions.push(`("assignedToId" = $${assignedIdParam} OR LOWER(COALESCE("assignedUserEmail", '')) = $${assignedEmailParam})`)
  } else if (opts.assignedToId !== undefined) {
    params.push(opts.assignedToId)
    conditions.push(`"assignedToId" = $${params.length}`)
  } else if (opts.assignedUserEmail) {
    params.push(String(opts.assignedUserEmail).trim().toLowerCase())
    conditions.push(`LOWER(COALESCE("assignedUserEmail", '')) = $${params.length}`)
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
  assignedUserEmail?: string
} = {}) {
  await ensureAssetSchema()
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

  return { items: items.map((row: any) => normalizeAssetRow(row)), total, page, pageSize }
}

export async function getAssetById(id: number) {
  await ensureAssetSchema()
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

  const normalizedAsset = normalizeAssetRow(asset)
  normalizedAsset.childAssets = childAssets
  normalizedAsset.tickets = tickets
  normalizedAsset.assetChanges = assetChanges
  normalizedAsset.assetProblems = assetProblems
  normalizedAsset.assetServices = assetServices
  return normalizedAsset
}

export async function createAsset(data: any) {
  await ensureAssetSchema()
  const normalized = {
    ...data,
    category: normalizeAssetCategory(data?.category),
  }
  const { text, values } = buildInsert('Asset', normalized)
  const rows = await query(text, values)
  return normalizeAssetRow(rows[0])
}

export async function updateAsset(id: number, data: any) {
  await ensureAssetSchema()
  const normalized = {
    ...data,
    ...(data?.category !== undefined ? { category: normalizeAssetCategory(data.category) } : {}),
  }
  const { text, params } = buildUpdate('Asset', id, normalized)
  const rows = await query(text, params)
  return normalizeAssetRow(rows[0])
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
