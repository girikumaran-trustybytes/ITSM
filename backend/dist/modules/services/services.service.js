"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteService = exports.updateService = exports.createService = exports.getService = exports.listServices = void 0;
const db_1 = require("../../db");
async function listServices(opts = {}) {
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`("name" ILIKE $${params.length} OR "description" ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT * FROM "Service" ${where} ORDER BY "createdAt" DESC`, params);
}
exports.listServices = listServices;
async function getService(id) {
    return (0, db_1.queryOne)('SELECT * FROM "Service" WHERE "id" = $1', [id]);
}
exports.getService = getService;
async function createService(payload) {
    const name = String(payload.name || '').trim();
    if (!name)
        throw { status: 400, message: 'Name is required' };
    const rows = await (0, db_1.query)('INSERT INTO "Service" ("name", "description", "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW()) RETURNING *', [name, payload.description || null]);
    return rows[0];
}
exports.createService = createService;
async function updateService(id, payload) {
    const data = {};
    if (payload.name !== undefined)
        data.name = String(payload.name).trim();
    if (payload.description !== undefined)
        data.description = payload.description;
    try {
        const setParts = [];
        const params = [];
        for (const [key, value] of Object.entries(data)) {
            params.push(value);
            setParts.push(`"${key}" = $${params.length}`);
        }
        setParts.push('"updatedAt" = NOW()');
        params.push(id);
        const rows = await (0, db_1.query)(`UPDATE "Service" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
        if (!rows[0])
            throw { status: 404, message: 'Service not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.updateService = updateService;
async function deleteService(id) {
    try {
        const rows = await (0, db_1.query)('DELETE FROM "Service" WHERE "id" = $1 RETURNING *', [id]);
        if (!rows[0])
            throw { status: 404, message: 'Service not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.deleteService = deleteService;
