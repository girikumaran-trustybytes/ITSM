import { query, queryOne } from '../../db'

let supplierSchemaReady = false

async function ensureSupplierSchema() {
  if (supplierSchemaReady) return
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "companyMail" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT`)
  await query(`UPDATE "Supplier" SET "contactPerson" = COALESCE("contactPerson", "contactName") WHERE "contactPerson" IS NULL`)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  supplierSchemaReady = true
}

function normalizeSupplierPayload(data: any) {
  const next = { ...(data || {}) }
  if (next.contactPerson == null && next.contactName != null) next.contactPerson = next.contactName
  delete next.contactName
  return next
}

export const createSupplier = async (data: any) => {
  await ensureSupplierSchema()
  const payload = normalizeSupplierPayload(data)
  const keys = Object.keys(payload || {}).filter((k) => payload[k] !== undefined)
  const cols = keys.map((k) => `"${k}"`)
  const params = keys.map((_, i) => `$${i + 1}`)
  const values = keys.map((k) => payload[k])
  const text = `INSERT INTO "Supplier" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`
  const rows = await query(text, values)
  return rows[0]
}

export const updateSupplier = async (id: number, data: any) => {
  await ensureSupplierSchema()
  const payload = normalizeSupplierPayload(data)
  const setParts: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(payload || {})) {
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
  await ensureSupplierSchema()
  return queryOne('SELECT * FROM "Supplier" WHERE "id" = $1', [id])
}

export const listSuppliers = async (opts: { q?: string } = {}) => {
  await ensureSupplierSchema()
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(
      `("companyName" ILIKE $${params.length}
      OR "companyMail" ILIKE $${params.length}
      OR "contactPerson" ILIKE $${params.length}
      OR "contactName" ILIKE $${params.length}
      OR "contactEmail" ILIKE $${params.length}
      OR "contactNumber"::text ILIKE $${params.length})`
    )
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return query(`SELECT * FROM "Supplier" ${where} ORDER BY "companyName" ASC`, params)
}

export const deleteSupplier = async (id: number) => {
  await ensureSupplierSchema()
  const rows = await query('DELETE FROM "Supplier" WHERE "id" = $1 RETURNING *', [id])
  return rows[0] ?? null
}
