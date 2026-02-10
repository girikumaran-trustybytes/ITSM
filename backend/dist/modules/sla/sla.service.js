"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSlaConfig = exports.updateSlaConfig = exports.createSlaConfig = exports.getSlaConfig = exports.listSlaConfigs = void 0;
const db_1 = require("../../db");
async function listSlaConfigs(opts = {}) {
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`("name" ILIKE $${params.length} OR "priority" ILIKE $${params.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT * FROM "SlaConfig" ${where} ORDER BY "createdAt" DESC`, params);
}
exports.listSlaConfigs = listSlaConfigs;
async function getSlaConfig(id) {
    return (0, db_1.queryOne)('SELECT * FROM "SlaConfig" WHERE "id" = $1', [id]);
}
exports.getSlaConfig = getSlaConfig;
async function createSlaConfig(payload) {
    const name = String(payload.name || '').trim();
    const priority = String(payload.priority || '').trim();
    const responseTimeMin = Number(payload.responseTimeMin);
    const resolutionTimeMin = Number(payload.resolutionTimeMin);
    if (!name)
        throw { status: 400, message: 'Name is required' };
    if (!priority)
        throw { status: 400, message: 'Priority is required' };
    if (!Number.isFinite(responseTimeMin) || responseTimeMin < 0)
        throw { status: 400, message: 'Invalid response time' };
    if (!Number.isFinite(resolutionTimeMin) || resolutionTimeMin < 0)
        throw { status: 400, message: 'Invalid resolution time' };
    const rows = await (0, db_1.query)('INSERT INTO "SlaConfig" ("name", "priority", "responseTimeMin", "resolutionTimeMin", "businessHours", "active", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) RETURNING *', [
        name,
        priority,
        responseTimeMin,
        resolutionTimeMin,
        Boolean(payload.businessHours),
        payload.active === undefined ? true : Boolean(payload.active),
    ]);
    return rows[0];
}
exports.createSlaConfig = createSlaConfig;
async function updateSlaConfig(id, payload) {
    const data = {};
    if (payload.name !== undefined)
        data.name = String(payload.name).trim();
    if (payload.priority !== undefined)
        data.priority = String(payload.priority).trim();
    if (payload.responseTimeMin !== undefined)
        data.responseTimeMin = Number(payload.responseTimeMin);
    if (payload.resolutionTimeMin !== undefined)
        data.resolutionTimeMin = Number(payload.resolutionTimeMin);
    if (payload.businessHours !== undefined)
        data.businessHours = Boolean(payload.businessHours);
    if (payload.active !== undefined)
        data.active = Boolean(payload.active);
    try {
        const setParts = [];
        const params = [];
        for (const [key, value] of Object.entries(data)) {
            params.push(value);
            setParts.push(`"${key}" = $${params.length}`);
        }
        setParts.push('"updatedAt" = NOW()');
        params.push(id);
        const rows = await (0, db_1.query)(`UPDATE "SlaConfig" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
        if (!rows[0])
            throw { status: 404, message: 'SLA config not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.updateSlaConfig = updateSlaConfig;
async function deleteSlaConfig(id) {
    try {
        const rows = await (0, db_1.query)('DELETE FROM "SlaConfig" WHERE "id" = $1 RETURNING *', [id]);
        if (!rows[0])
            throw { status: 404, message: 'SLA config not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.deleteSlaConfig = deleteSlaConfig;
