"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enforceProtectedAdminBaseline = exports.enforceProtectedAdminRoleByUserId = exports.isProtectedAdminEmail = void 0;
const db_1 = require("../../db");
function getProtectedAdminEmails() {
    const configured = [
        process.env.PROTECTED_ADMIN_EMAIL,
        process.env.PROTECTED_ADMIN_EMAILS,
        process.env.ADMIN_EMAIL,
    ]
        .filter((value) => String(value || '').trim().length > 0)
        .join(',');
    const values = configured
        .split(',')
        .map((value) => String(value || '').trim().toLowerCase())
        .filter((value) => value.length > 0);
    if (values.length > 0)
        return Array.from(new Set(values));
    return ['admin@itsm.local'];
}
function isProtectedAdminEmail(email) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized)
        return false;
    return getProtectedAdminEmails().includes(normalized);
}
exports.isProtectedAdminEmail = isProtectedAdminEmail;
async function enforceProtectedAdminRoleByUserId(userId) {
    if (!Number.isFinite(userId) || userId <= 0)
        return;
    const user = await (0, db_1.queryOne)('SELECT "email" FROM "User" WHERE "id" = $1', [userId]);
    if (!isProtectedAdminEmail(user?.email || ''))
        return;
    await (0, db_1.query)(`UPDATE "User"
     SET "role" = 'ADMIN',
         "status" = 'ACTIVE',
         "updatedAt" = NOW()
     WHERE "id" = $1`, [userId]);
}
exports.enforceProtectedAdminRoleByUserId = enforceProtectedAdminRoleByUserId;
async function enforceProtectedAdminBaseline() {
    const protectedEmails = getProtectedAdminEmails();
    if (!protectedEmails.length)
        return;
    const rows = await (0, db_1.query)(`SELECT "id"
     FROM "User"
     WHERE LOWER("email") = ANY($1::text[])`, [protectedEmails]);
    for (const row of rows) {
        await enforceProtectedAdminRoleByUserId(Number(row.id));
    }
}
exports.enforceProtectedAdminBaseline = enforceProtectedAdminBaseline;
