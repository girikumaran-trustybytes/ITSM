"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSlaConfig = exports.updateSlaConfig = exports.createSlaConfig = exports.getSlaConfig = exports.listSlaConfigs = void 0;
const db_1 = require("../../db");
let schemaReady = null;
async function ensureSlaConfigSchema() {
    if (!schemaReady) {
        schemaReady = (async () => {
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "priorityRank" INTEGER');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "format" TEXT');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "timeZone" TEXT');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "businessSchedule" JSONB');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "description" TEXT');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "applyMatch" TEXT');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "conditions" JSONB');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "responseEscalations" JSONB');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "resolutionEscalations" JSONB');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "operationalHours" TEXT');
            await (0, db_1.query)('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "escalationEmail" BOOLEAN');
        })();
    }
    await schemaReady;
}
async function listSlaConfigs(opts = {}) {
    await ensureSlaConfigSchema();
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
    await ensureSlaConfigSchema();
    return (0, db_1.queryOne)('SELECT * FROM "SlaConfig" WHERE "id" = $1', [id]);
}
exports.getSlaConfig = getSlaConfig;
async function createSlaConfig(payload) {
    await ensureSlaConfigSchema();
    const name = String(payload.name || '').trim();
    const priority = String(payload.priority || '').trim();
    const priorityRank = payload.priorityRank === undefined ? null : Number(payload.priorityRank);
    const format = payload.format === undefined ? null : String(payload.format || '').trim();
    const description = payload.description === undefined ? null : String(payload.description || '').trim();
    const applyMatch = payload.applyMatch === undefined ? null : String(payload.applyMatch || '').trim();
    const responseTimeMin = Number(payload.responseTimeMin);
    const resolutionTimeMin = Number(payload.resolutionTimeMin);
    const timeZone = payload.timeZone === undefined ? null : String(payload.timeZone || '').trim();
    const businessSchedule = payload.businessSchedule && typeof payload.businessSchedule === 'object' ? payload.businessSchedule : null;
    const conditions = Array.isArray(payload.conditions) ? payload.conditions : null;
    const responseEscalations = Array.isArray(payload.responseEscalations) ? payload.responseEscalations : null;
    const resolutionEscalations = Array.isArray(payload.resolutionEscalations) ? payload.resolutionEscalations : null;
    const operationalHours = payload.operationalHours === undefined ? null : String(payload.operationalHours || '').trim();
    const escalationEmail = payload.escalationEmail === undefined ? null : Boolean(payload.escalationEmail);
    if (!name)
        throw { status: 400, message: 'Name is required' };
    if (!priority)
        throw { status: 400, message: 'Priority is required' };
    if (priorityRank !== null && (!Number.isFinite(priorityRank) || priorityRank < 1 || priorityRank > 4)) {
        throw { status: 400, message: 'Invalid priority rank' };
    }
    if (!Number.isFinite(responseTimeMin) || responseTimeMin < 0)
        throw { status: 400, message: 'Invalid response time' };
    if (!Number.isFinite(resolutionTimeMin) || resolutionTimeMin < 0)
        throw { status: 400, message: 'Invalid resolution time' };
    const rows = await (0, db_1.query)('INSERT INTO "SlaConfig" ("name", "priority", "priorityRank", "format", "description", "applyMatch", "conditions", "responseEscalations", "resolutionEscalations", "operationalHours", "escalationEmail", "responseTimeMin", "resolutionTimeMin", "businessHours", "timeZone", "businessSchedule", "active", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()) RETURNING *', [
        name,
        priority,
        priorityRank,
        format,
        description,
        applyMatch,
        conditions,
        responseEscalations,
        resolutionEscalations,
        operationalHours,
        escalationEmail,
        responseTimeMin,
        resolutionTimeMin,
        Boolean(payload.businessHours),
        timeZone,
        businessSchedule,
        payload.active === undefined ? true : Boolean(payload.active),
    ]);
    return rows[0];
}
exports.createSlaConfig = createSlaConfig;
async function updateSlaConfig(id, payload) {
    await ensureSlaConfigSchema();
    const data = {};
    if (payload.name !== undefined)
        data.name = String(payload.name).trim();
    if (payload.priority !== undefined)
        data.priority = String(payload.priority).trim();
    if (payload.priorityRank !== undefined)
        data.priorityRank = Number(payload.priorityRank);
    if (payload.format !== undefined)
        data.format = String(payload.format).trim();
    if (payload.description !== undefined)
        data.description = String(payload.description).trim();
    if (payload.applyMatch !== undefined)
        data.applyMatch = String(payload.applyMatch).trim();
    if (payload.conditions !== undefined)
        data.conditions = Array.isArray(payload.conditions) ? payload.conditions : null;
    if (payload.responseEscalations !== undefined)
        data.responseEscalations = Array.isArray(payload.responseEscalations) ? payload.responseEscalations : null;
    if (payload.resolutionEscalations !== undefined)
        data.resolutionEscalations = Array.isArray(payload.resolutionEscalations) ? payload.resolutionEscalations : null;
    if (payload.operationalHours !== undefined)
        data.operationalHours = String(payload.operationalHours).trim();
    if (payload.escalationEmail !== undefined)
        data.escalationEmail = Boolean(payload.escalationEmail);
    if (payload.responseTimeMin !== undefined)
        data.responseTimeMin = Number(payload.responseTimeMin);
    if (payload.resolutionTimeMin !== undefined)
        data.resolutionTimeMin = Number(payload.resolutionTimeMin);
    if (payload.businessHours !== undefined)
        data.businessHours = Boolean(payload.businessHours);
    if (payload.timeZone !== undefined)
        data.timeZone = String(payload.timeZone).trim();
    if (payload.businessSchedule !== undefined)
        data.businessSchedule = payload.businessSchedule && typeof payload.businessSchedule === 'object'
            ? payload.businessSchedule
            : null;
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
