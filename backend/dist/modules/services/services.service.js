"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteService = exports.updateService = exports.createService = exports.getService = exports.listServices = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function listServices(opts = {}) {
    const where = {};
    if (opts.q) {
        where.OR = [
            { name: { contains: opts.q, mode: 'insensitive' } },
            { description: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    return client_1.default.service.findMany({ where, orderBy: { createdAt: 'desc' } });
}
exports.listServices = listServices;
async function getService(id) {
    return client_1.default.service.findUnique({ where: { id } });
}
exports.getService = getService;
async function createService(payload) {
    const name = String(payload.name || '').trim();
    if (!name)
        throw { status: 400, message: 'Name is required' };
    return client_1.default.service.create({ data: { name, description: payload.description || null } });
}
exports.createService = createService;
async function updateService(id, payload) {
    const data = {};
    if (payload.name !== undefined)
        data.name = String(payload.name).trim();
    if (payload.description !== undefined)
        data.description = payload.description;
    try {
        return await client_1.default.service.update({ where: { id }, data });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'Service not found' };
        throw err;
    }
}
exports.updateService = updateService;
async function deleteService(id) {
    try {
        return await client_1.default.service.delete({ where: { id } });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'Service not found' };
        throw err;
    }
}
exports.deleteService = deleteService;
