"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplier = exports.listSuppliers = exports.getSupplier = exports.updateSupplier = exports.createSupplier = void 0;
const db_1 = require("../../db");
let supplierSchemaReady = false;
async function ensureSupplierSchema() {
    if (supplierSchemaReady)
        return;
    await (0, db_1.query)(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "companyMail" TEXT`);
    await (0, db_1.query)(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber" BIGINT`);
    await (0, db_1.query)(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT`);
    await (0, db_1.query)(`ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT`);
    await (0, db_1.query)(`UPDATE "Supplier" SET "contactPerson" = COALESCE("contactPerson", "contactName") WHERE "contactPerson" IS NULL`);
    await (0, db_1.query)(`
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
  `);
    supplierSchemaReady = true;
}
function normalizeSupplierPayload(data) {
    const next = { ...(data || {}) };
    if (next.contactPerson == null && next.contactName != null)
        next.contactPerson = next.contactName;
    delete next.contactName;
    return next;
}
const createSupplier = async (data) => {
    await ensureSupplierSchema();
    const payload = normalizeSupplierPayload(data);
    const keys = Object.keys(payload || {}).filter((k) => payload[k] !== undefined);
    const cols = keys.map((k) => `"${k}"`);
    const params = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) => payload[k]);
    const text = `INSERT INTO "Supplier" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`;
    const rows = await (0, db_1.query)(text, values);
    return rows[0];
};
exports.createSupplier = createSupplier;
const updateSupplier = async (id, data) => {
    await ensureSupplierSchema();
    const payload = normalizeSupplierPayload(data);
    const setParts = [];
    const params = [];
    for (const [key, value] of Object.entries(payload || {})) {
        if (value === undefined)
            continue;
        params.push(value);
        setParts.push(`"${key}" = $${params.length}`);
    }
    setParts.push('"updatedAt" = NOW()');
    params.push(id);
    const rows = await (0, db_1.query)(`UPDATE "Supplier" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
    return rows[0] ?? null;
};
exports.updateSupplier = updateSupplier;
const getSupplier = async (id) => {
    await ensureSupplierSchema();
    return (0, db_1.queryOne)('SELECT * FROM "Supplier" WHERE "id" = $1', [id]);
};
exports.getSupplier = getSupplier;
const listSuppliers = async (opts = {}) => {
    await ensureSupplierSchema();
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`("companyName" ILIKE $${params.length}
      OR "companyMail" ILIKE $${params.length}
      OR "contactPerson" ILIKE $${params.length}
      OR "contactName" ILIKE $${params.length}
      OR "contactEmail" ILIKE $${params.length}
      OR "contactNumber"::text ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT * FROM "Supplier" ${where} ORDER BY "companyName" ASC`, params);
};
exports.listSuppliers = listSuppliers;
const deleteSupplier = async (id) => {
    await ensureSupplierSchema();
    const rows = await (0, db_1.query)('DELETE FROM "Supplier" WHERE "id" = $1 RETURNING *', [id]);
    return rows[0] ?? null;
};
exports.deleteSupplier = deleteSupplier;
