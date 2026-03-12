import { query, queryOne } from '../../db'

let supplierSchemaReady = false

async function ensureSupplierSchema() {
  if (supplierSchemaReady) return
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "companyMail" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber2" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber3" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber4" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber5" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber6" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber7" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber8" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber9" BIGINT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson2" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail2" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson3" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail3" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson4" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail4" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson5" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail5" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson6" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail6" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson7" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail7" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson8" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail8" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson9" TEXT`)
  await query(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactEmail9" TEXT`)
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
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber2'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber2"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber2"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber3'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber3"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber3"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber4'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber4"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber4"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber5'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber5"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber5"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber6'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber6"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber6"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber7'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber7"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber7"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber8'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber8"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber8"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
      END IF;
    END
    $$;
  `)
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Supplier'
          AND column_name = 'contactNumber9'
          AND data_type <> 'bigint'
      ) THEN
        ALTER TABLE "Supplier"
        ALTER COLUMN "contactNumber9"
        TYPE BIGINT
        USING NULLIF(regexp_replace(COALESCE("contactNumber9"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
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
      OR "contactPerson2" ILIKE $${params.length}
      OR "contactEmail2" ILIKE $${params.length}
      OR "contactPerson3" ILIKE $${params.length}
      OR "contactEmail3" ILIKE $${params.length}
      OR "contactPerson4" ILIKE $${params.length}
      OR "contactEmail4" ILIKE $${params.length}
      OR "contactPerson5" ILIKE $${params.length}
      OR "contactEmail5" ILIKE $${params.length}
      OR "contactPerson6" ILIKE $${params.length}
      OR "contactEmail6" ILIKE $${params.length}
      OR "contactPerson7" ILIKE $${params.length}
      OR "contactEmail7" ILIKE $${params.length}
      OR "contactPerson8" ILIKE $${params.length}
      OR "contactEmail8" ILIKE $${params.length}
      OR "contactPerson9" ILIKE $${params.length}
      OR "contactEmail9" ILIKE $${params.length}
      OR "contactNumber"::text ILIKE $${params.length}
      OR "contactNumber2"::text ILIKE $${params.length}
      OR "contactNumber3"::text ILIKE $${params.length}
      OR "contactNumber4"::text ILIKE $${params.length}
      OR "contactNumber5"::text ILIKE $${params.length}
      OR "contactNumber6"::text ILIKE $${params.length}
      OR "contactNumber7"::text ILIKE $${params.length}
      OR "contactNumber8"::text ILIKE $${params.length}
      OR "contactNumber9"::text ILIKE $${params.length})`
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
