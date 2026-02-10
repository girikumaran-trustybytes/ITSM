"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSupplier = exports.listSuppliers = exports.getSupplier = exports.updateSupplier = exports.createSupplier = void 0;
const db_1 = require("../../db");
const createSupplier = async (data) => {
    const keys = Object.keys(data || {}).filter((k) => data[k] !== undefined);
    const cols = keys.map((k) => `"${k}"`);
    const params = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) => data[k]);
    const text = `INSERT INTO "Supplier" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`;
    const rows = await (0, db_1.query)(text, values);
    return rows[0];
};
exports.createSupplier = createSupplier;
const updateSupplier = async (id, data) => {
    const setParts = [];
    const params = [];
    for (const [key, value] of Object.entries(data || {})) {
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
    return (0, db_1.queryOne)('SELECT * FROM "Supplier" WHERE "id" = $1', [id]);
};
exports.getSupplier = getSupplier;
const listSuppliers = async (opts = {}) => {
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`("companyName" ILIKE $${params.length} OR "contactName" ILIKE $${params.length} OR "contactEmail" ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT * FROM "Supplier" ${where} ORDER BY "companyName" ASC`, params);
};
exports.listSuppliers = listSuppliers;
const deleteSupplier = async (id) => {
    const rows = await (0, db_1.query)('DELETE FROM "Supplier" WHERE "id" = $1 RETURNING *', [id]);
    return rows[0] ?? null;
};
exports.deleteSupplier = deleteSupplier;
