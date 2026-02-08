"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteProblem = exports.updateProblem = exports.createProblem = exports.getProblem = exports.listProblems = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function listProblems(opts = {}) {
    const where = {};
    if (opts.q) {
        where.OR = [
            { code: { contains: opts.q, mode: 'insensitive' } },
            { title: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    return client_1.default.problem.findMany({ where, orderBy: { createdAt: 'desc' } });
}
exports.listProblems = listProblems;
async function getProblem(id) {
    return client_1.default.problem.findUnique({ where: { id } });
}
exports.getProblem = getProblem;
async function createProblem(payload) {
    const code = String(payload.code || '').trim();
    const title = String(payload.title || '').trim();
    if (!code)
        throw { status: 400, message: 'Code is required' };
    if (!title)
        throw { status: 400, message: 'Title is required' };
    return client_1.default.problem.create({ data: { code, title, status: payload.status || null } });
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
        return await client_1.default.problem.update({ where: { id }, data });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'Problem not found' };
        throw err;
    }
}
exports.updateProblem = updateProblem;
async function deleteProblem(id) {
    try {
        return await client_1.default.problem.delete({ where: { id } });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'Problem not found' };
        throw err;
    }
}
exports.deleteProblem = deleteProblem;
