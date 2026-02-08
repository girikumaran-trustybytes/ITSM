"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSlaConfig = exports.updateSlaConfig = exports.createSlaConfig = exports.getSlaConfig = exports.listSlaConfigs = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function listSlaConfigs(opts = {}) {
    const where = {};
    if (opts.q) {
        where.OR = [
            { name: { contains: opts.q, mode: 'insensitive' } },
            { priority: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    return client_1.default.slaConfig.findMany({ where, orderBy: { createdAt: 'desc' } });
}
exports.listSlaConfigs = listSlaConfigs;
async function getSlaConfig(id) {
    return client_1.default.slaConfig.findUnique({ where: { id } });
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
    return client_1.default.slaConfig.create({
        data: {
            name,
            priority,
            responseTimeMin,
            resolutionTimeMin,
            businessHours: Boolean(payload.businessHours),
            active: payload.active === undefined ? true : Boolean(payload.active),
        },
    });
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
        return await client_1.default.slaConfig.update({ where: { id }, data });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'SLA config not found' };
        throw err;
    }
}
exports.updateSlaConfig = updateSlaConfig;
async function deleteSlaConfig(id) {
    try {
        return await client_1.default.slaConfig.delete({ where: { id } });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'SLA config not found' };
        throw err;
    }
}
exports.deleteSlaConfig = deleteSlaConfig;
