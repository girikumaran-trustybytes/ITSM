"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChange = exports.updateChange = exports.createChange = exports.getChange = exports.listChanges = void 0;
const db_1 = require("../../db");
async function listChanges(opts = {}) {
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`("code" ILIKE $${params.length} OR "title" ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT * FROM "Change" ${where} ORDER BY "createdAt" DESC`, params);
}
exports.listChanges = listChanges;
async function getChange(id) {
    return (0, db_1.queryOne)('SELECT * FROM "Change" WHERE "id" = $1', [id]);
}
exports.getChange = getChange;
async function createChange(payload) {
    const code = String(payload.code || '').trim();
    const title = String(payload.title || '').trim();
    if (!code)
        throw { status: 400, message: 'Code is required' };
    if (!title)
        throw { status: 400, message: 'Title is required' };
    const rows = await (0, db_1.query)('INSERT INTO "Change" ("code", "title", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *', [code, title, payload.status || null]);
    return rows[0];
}
exports.createChange = createChange;
async function updateChange(id, payload) {
    const data = {};
    if (payload.code !== undefined)
        data.code = String(payload.code).trim();
    if (payload.title !== undefined)
        data.title = String(payload.title).trim();
    if (payload.status !== undefined)
        data.status = payload.status;
    try {
        const setParts = [];
        const params = [];
        for (const [key, value] of Object.entries(data)) {
            params.push(value);
            setParts.push(`"${key}" = $${params.length}`);
        }
        setParts.push('"updatedAt" = NOW()');
        params.push(id);
        const rows = await (0, db_1.query)(`UPDATE "Change" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
        if (!rows[0])
            throw { status: 404, message: 'Change not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.updateChange = updateChange;
async function deleteChange(id) {
    try {
        const rows = await (0, db_1.query)('DELETE FROM "Change" WHERE "id" = $1 RETURNING *', [id]);
        if (!rows[0])
            throw { status: 404, message: 'Change not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.deleteChange = deleteChange;
