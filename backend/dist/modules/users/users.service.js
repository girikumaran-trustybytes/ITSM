"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getUserById = exports.listUsers = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
const bcrypt_1 = __importDefault(require("bcrypt"));
async function listUsers(opts = {}) {
    const where = {};
    if (opts.role) {
        where.role = opts.role;
    }
    if (opts.q) {
        where.OR = [
            { name: { contains: opts.q, mode: 'insensitive' } },
            { email: { contains: opts.q, mode: 'insensitive' } },
        ];
    }
    const take = opts.limit && opts.limit > 0 ? opts.limit : 50;
    return client_1.default.user.findMany({
        where,
        take,
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    });
}
exports.listUsers = listUsers;
async function getUserById(id) {
    return client_1.default.user.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, role: true, phone: true, client: true, site: true, accountManager: true, status: true, createdAt: true, updatedAt: true },
    });
}
exports.getUserById = getUserById;
async function createUser(payload) {
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    if (!email)
        throw { status: 400, message: 'Email is required' };
    if (!password || password.length < 6)
        throw { status: 400, message: 'Password must be at least 6 characters' };
    const existing = await client_1.default.user.findUnique({ where: { email } });
    if (existing)
        throw { status: 409, message: 'Email already exists' };
    const hashed = await bcrypt_1.default.hash(password, 12);
    const data = {
        email,
        password: hashed,
        name: payload.name ?? null,
        phone: payload.phone ?? null,
        client: payload.client ?? null,
        site: payload.site ?? null,
        accountManager: payload.accountManager ?? null,
        role: payload.role || 'USER',
        status: payload.status || 'ACTIVE',
    };
    return client_1.default.user.create({
        data,
        select: { id: true, name: true, email: true, role: true, phone: true, client: true, site: true, accountManager: true, status: true, createdAt: true, updatedAt: true },
    });
}
exports.createUser = createUser;
async function updateUser(id, payload) {
    const data = {};
    if (payload.email !== undefined)
        data.email = String(payload.email).trim().toLowerCase();
    if (payload.name !== undefined)
        data.name = payload.name;
    if (payload.phone !== undefined)
        data.phone = payload.phone;
    if (payload.client !== undefined)
        data.client = payload.client;
    if (payload.site !== undefined)
        data.site = payload.site;
    if (payload.accountManager !== undefined)
        data.accountManager = payload.accountManager;
    if (payload.role !== undefined)
        data.role = payload.role;
    if (payload.status !== undefined)
        data.status = payload.status;
    if (payload.password) {
        if (String(payload.password).length < 6)
            throw { status: 400, message: 'Password must be at least 6 characters' };
        data.password = await bcrypt_1.default.hash(String(payload.password), 12);
    }
    try {
        return await client_1.default.user.update({
            where: { id },
            data,
            select: { id: true, name: true, email: true, role: true, phone: true, client: true, site: true, accountManager: true, status: true, createdAt: true, updatedAt: true },
        });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'User not found' };
        if (err?.code === 'P2002')
            throw { status: 409, message: 'Email already exists' };
        throw err;
    }
}
exports.updateUser = updateUser;
async function deleteUser(id) {
    try {
        return await client_1.default.user.delete({
            where: { id },
            select: { id: true, name: true, email: true },
        });
    }
    catch (err) {
        if (err?.code === 'P2025')
            throw { status: 404, message: 'User not found' };
        throw err;
    }
}
exports.deleteUser = deleteUser;
