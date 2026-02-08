"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteChange = exports.updateChange = exports.createChange = exports.getChange = exports.listChanges = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function listChanges(opts = {}) {
    const where = {};
    if (opts.q) {
        where.OR = [
            { code: { contains: opts.q, mode: 'insensitive' } },
            { title: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    return client_1.default.change.findMany({ where, orderBy: { createdAt: 'desc' } });
}
exports.listChanges = listChanges;
async function getChange(id) {
    return client_1.default.change.findUnique({ where: { id } });
}
exports.getChange = getChange;
async function createChange(payload) {
    const code = String(payload.code || '').trim();
    const title = String(payload.title || '').trim();
    if (!code)
        throw { status: 400, message: 'Code is required' };
    if (!title)
        throw { status: 400, message: 'Title is required' };
    return client_1.default.change.create({ data: { code, title, status: payload.status || null } });
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
        return await client_1.default.change.update({ where: { id }, data });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'Change not found' };
        throw err;
    }
}
exports.updateChange = updateChange;
async function deleteChange(id) {
    try {
        return await client_1.default.change.delete({ where: { id } });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'Change not found' };
        throw err;
    }
}
exports.deleteChange = deleteChange;
