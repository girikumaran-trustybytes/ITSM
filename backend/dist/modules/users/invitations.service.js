"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptInvitationToken = exports.revokeInvitationById = exports.resendInvitationById = exports.createInvitationRequest = exports.inviteExistingUser = void 0;
const crypto_1 = require("crypto");
const bcrypt_1 = __importDefault(require("bcrypt"));
const db_1 = require("../../db");
const logger_1 = require("../../common/logger/logger");
const userService = __importStar(require("./users.service"));
const rbacService = __importStar(require("./rbac.service"));
function hashToken(token) {
    return (0, crypto_1.createHash)('sha256').update(String(token || '')).digest('hex');
}
async function ensureInviteSchema() {
    await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS user_invites (
      invite_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      token_hash TEXT,
      expires_at TIMESTAMP(3),
      status TEXT NOT NULL DEFAULT 'invite_pending',
      sent_at TIMESTAMP(3),
      accepted_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
}
async function getLatestInvite(userId) {
    return (0, db_1.queryOne)(`SELECT invite_id, status
     FROM user_invites
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`, [userId]);
}
async function inviteExistingUser(userId, actorUserId, options = {}, _meta = {}) {
    await ensureInviteSchema();
    const sendNow = options.sendNow !== false;
    const mode = options.mode === 'reinvite' ? 'reinvite' : 'invite';
    if (sendNow) {
        const result = await rbacService.sendUserInvite(userId, actorUserId, { mode });
        const latest = await getLatestInvite(userId);
        return {
            invitationId: latest?.invite_id || null,
            ...result,
            inviteStatus: result?.inviteStatus || latest?.status || 'invited_not_accepted',
        };
    }
    await rbacService.markInvitePending(userId, actorUserId);
    const latest = await getLatestInvite(userId);
    return {
        invitationId: latest?.invite_id || null,
        inviteStatus: 'invite_pending',
    };
}
exports.inviteExistingUser = inviteExistingUser;
async function createInvitationRequest(payload, actorUserId, meta = {}) {
    await ensureInviteSchema();
    const email = String(payload?.email || '').trim().toLowerCase();
    if (!email)
        throw { status: 400, message: 'Email is required' };
    let existing = await (0, db_1.queryOne)('SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1', [email]);
    if (!existing) {
        const preferredRole = Array.isArray(payload?.roleNames) && payload.roleNames.length > 0
            ? String(payload.roleNames[0] || 'USER').toUpperCase()
            : 'USER';
        const created = await userService.createUser({
            email,
            name: payload?.name || null,
            role: preferredRole,
            isServiceAccount: false,
        });
        existing = { id: Number(created?.id) };
    }
    const invite = await inviteExistingUser(Number(existing.id), actorUserId, { mode: 'invite', sendNow: payload?.sendNow !== false }, meta);
    return {
        invitationId: invite.invitationId,
        userId: Number(existing.id),
        inviteStatus: invite.inviteStatus,
    };
}
exports.createInvitationRequest = createInvitationRequest;
async function resendInvitationById(invitationId, actorUserId, meta = {}) {
    await ensureInviteSchema();
    const row = await (0, db_1.queryOne)(`SELECT invite_id, user_id, status
     FROM user_invites
     WHERE invite_id = $1`, [invitationId]);
    if (!row)
        throw { status: 404, message: 'Invitation not found' };
    if (String(row.status || '').toLowerCase() === 'accepted') {
        throw { status: 400, message: 'Invitation already accepted' };
    }
    if (String(row.status || '').toLowerCase() === 'revoked') {
        throw { status: 400, message: 'Invitation is revoked' };
    }
    return inviteExistingUser(Number(row.user_id), actorUserId, { mode: 'reinvite', sendNow: true }, meta);
}
exports.resendInvitationById = resendInvitationById;
async function revokeInvitationById(invitationId, actorUserId, _meta = {}) {
    await ensureInviteSchema();
    const row = await (0, db_1.queryOne)(`SELECT invite_id, user_id, status
     FROM user_invites
     WHERE invite_id = $1`, [invitationId]);
    if (!row)
        throw { status: 404, message: 'Invitation not found' };
    await (0, db_1.query)(`UPDATE user_invites
     SET status = 'revoked'
     WHERE invite_id = $1`, [invitationId]);
    await (0, logger_1.auditLog)({
        action: 'invite_revoked',
        entity: 'user_invite',
        entityId: invitationId,
        user: actorUserId,
    });
    return {
        invitationId,
        userId: Number(row.user_id),
        inviteStatus: 'revoked',
    };
}
exports.revokeInvitationById = revokeInvitationById;
async function acceptInvitationToken(token, password, name, _meta = {}) {
    await ensureInviteSchema();
    const rawToken = String(token || '').trim();
    if (!rawToken)
        throw { status: 400, message: 'Invitation token is required' };
    if (String(password || '').length < 8)
        throw { status: 400, message: 'Password must be at least 8 characters' };
    const tokenHash = hashToken(rawToken);
    const invite = await (0, db_1.queryOne)(`SELECT invite_id, user_id, expires_at, status
     FROM user_invites
     WHERE token_hash = $1
     ORDER BY created_at DESC
     LIMIT 1`, [tokenHash]);
    if (!invite)
        throw { status: 400, message: 'Invalid invitation token' };
    if (String(invite.status || '').toLowerCase() === 'revoked')
        throw { status: 400, message: 'Invitation is revoked' };
    if (String(invite.status || '').toLowerCase() === 'accepted')
        throw { status: 400, message: 'Invitation already accepted' };
    if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
        throw { status: 400, message: 'Invitation token has expired' };
    }
    const passwordHash = await bcrypt_1.default.hash(String(password), 12);
    const nextName = String(name || '').trim();
    if (nextName) {
        await (0, db_1.query)(`UPDATE "User"
       SET "password" = $1,
           "name" = $2,
           "status" = 'ACTIVE',
           "updatedAt" = NOW()
       WHERE "id" = $3`, [passwordHash, nextName, invite.user_id]);
    }
    else {
        await (0, db_1.query)(`UPDATE "User"
       SET "password" = $1,
           "status" = 'ACTIVE',
           "updatedAt" = NOW()
       WHERE "id" = $2`, [passwordHash, invite.user_id]);
    }
    await (0, db_1.query)(`UPDATE user_invites
     SET status = 'accepted',
         accepted_at = NOW()
     WHERE invite_id = $1`, [invite.invite_id]);
    await (0, logger_1.auditLog)({
        action: 'invite_accepted',
        entity: 'user_invite',
        entityId: invite.invite_id,
        user: invite.user_id,
    });
    return {
        ok: true,
        invitationId: invite.invite_id,
        userId: invite.user_id,
    };
}
exports.acceptInvitationToken = acceptInvitationToken;
