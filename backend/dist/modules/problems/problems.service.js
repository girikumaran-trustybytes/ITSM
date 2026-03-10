"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProblem = exports.updateProblem = exports.createProblem = exports.getProblem = exports.listProblems = void 0;
const db_1 = require("../../db");
async function listProblems(opts = {}) {
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`("code" ILIKE $${params.length} OR "title" ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT * FROM "Problem" ${where} ORDER BY "createdAt" DESC`, params);
}
exports.listProblems = listProblems;
async function getProblem(id) {
    return (0, db_1.queryOne)('SELECT * FROM "Problem" WHERE "id" = $1', [id]);
}
exports.getProblem = getProblem;
async function createProblem(payload) {
    const code = String(payload.code || '').trim();
    const title = String(payload.title || '').trim();
    if (!code)
        throw { status: 400, message: 'Code is required' };
    if (!title)
        throw { status: 400, message: 'Title is required' };
    const rows = await (0, db_1.query)('INSERT INTO "Problem" ("code", "title", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, NOW(), NOW()) RETURNING *', [code, title, payload.status || null]);
    return rows[0];
}
exports.createProblem = createProblem;
async function updateProblem(id, payload) {
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
        const rows = await (0, db_1.query)(`UPDATE "Problem" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
        if (!rows[0])
            throw { status: 404, message: 'Problem not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.updateProblem = updateProblem;
async function deleteProblem(id) {
    try {
        const rows = await (0, db_1.query)('DELETE FROM "Problem" WHERE "id" = $1 RETURNING *', [id]);
        if (!rows[0])
            throw { status: 404, message: 'Problem not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.deleteProblem = deleteProblem;
