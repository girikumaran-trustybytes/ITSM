"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.updateUser = exports.createUser = exports.getUserById = exports.listUsers = void 0;
const db_1 = require("../../db");
const bcrypt_1 = __importDefault(require("bcrypt"));
function normalizeRole(input) {
    const value = String(input || 'USER').trim().toUpperCase();
    if (['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM'].includes(value))
        return value;
    return 'USER';
}
async function listUsers(opts = {}) {
    const conditions = [];
    const params = [];
    if (opts.role) {
        params.push(opts.role);
        conditions.push(`u."role" = $${params.length}`);
    }
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`(u."name" ILIKE $${params.length} OR u."email" ILIKE $${params.length})`);
    }
    const take = opts.limit && opts.limit > 0 ? opts.limit : 50;
    params.push(take);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return (0, db_1.query)(`SELECT
       u."id",
       u."name",
       u."email",
       u."role",
       u."status",
       u."createdAt",
       COALESCE(ui.status, 'none') AS "inviteStatus"
     FROM "User" u
     LEFT JOIN LATERAL (
       SELECT status
       FROM user_invites
       WHERE user_id = u."id"
       ORDER BY created_at DESC
       LIMIT 1
     ) ui ON TRUE
     ${where}
     ORDER BY u."name" ASC NULLS LAST, u."email" ASC
     LIMIT $${params.length}`, params);
}
exports.listUsers = listUsers;
async function getUserById(id) {
    return (0, db_1.queryOne)('SELECT "id", "name", "email", "role", "phone", "client", "site", "accountManager", "status", "createdAt", "updatedAt" FROM "User" WHERE "id" = $1', [id]);
}
exports.getUserById = getUserById;
async function createUser(payload) {
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email)
        throw { status: 400, message: 'Email is required' };
    let password = String(payload.password || '');
    if (password && password.length < 6)
        throw { status: 400, message: 'Password must be at least 6 characters' };
    if (!password) {
        password = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
    }
    const existing = await (0, db_1.queryOne)('SELECT "id" FROM "User" WHERE "email" = $1', [email]);
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
        role: normalizeRole(payload.role),
        status: String(payload.status || 'ACTIVE').trim().toUpperCase(),
    };
    const rows = await (0, db_1.query)('INSERT INTO "User" ("email", "password", "name", "phone", "client", "site", "accountManager", "role", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING "id", "name", "email", "role", "phone", "client", "site", "accountManager", "status", "createdAt", "updatedAt"', [data.email, data.password, data.name, data.phone, data.client, data.site, data.accountManager, data.role, data.status]);
    return rows[0];
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
        data.role = normalizeRole(payload.role);
    if (payload.status !== undefined)
        data.status = String(payload.status).trim().toUpperCase();
    if (payload.password) {
        if (String(payload.password).length < 6)
            throw { status: 400, message: 'Password must be at least 6 characters' };
        data.password = await bcrypt_1.default.hash(String(payload.password), 12);
    }
    try {
        const setParts = [];
        const params = [];
        for (const [key, value] of Object.entries(data)) {
            params.push(value);
            setParts.push(`"${key}" = $${params.length}`);
        }
        setParts.push('"updatedAt" = NOW()');
        params.push(id);
        const rows = await (0, db_1.query)(`UPDATE "User" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING "id", "name", "email", "role", "phone", "client", "site", "accountManager", "status", "createdAt", "updatedAt"`, params);
        if (!rows[0])
            throw { status: 404, message: 'User not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        if (err?.code === '23505')
            throw { status: 409, message: 'Email already exists' };
        throw err;
    }
}
exports.updateUser = updateUser;
async function deleteUser(id) {
    try {
        const rows = await (0, db_1.query)('DELETE FROM "User" WHERE "id" = $1 RETURNING "id", "name", "email"', [id]);
        if (!rows[0])
            throw { status: 404, message: 'User not found' };
        return rows[0];
    }
    catch (err) {
        if (err?.status === 404)
            throw err;
        throw err;
    }
}
exports.deleteUser = deleteUser;
