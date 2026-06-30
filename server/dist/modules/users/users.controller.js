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
Object.defineProperty(exports, "__esModule", { value: true });
exports.putMyPresence = exports.getMyPresence = exports.revokeInvitation = exports.resendInvitation = exports.createInvitation = exports.markInvitePending = exports.reinviteServiceAccount = exports.sendServiceAccountInvite = exports.sendInvite = exports.addTicketCustomAction = exports.updatePermissions = exports.deleteTicketQueue = exports.updateTicketQueue = exports.createTicketQueue = exports.listTicketQueues = exports.getPermissions = exports.remove = exports.update = exports.create = exports.getOne = exports.list = void 0;
const svc = __importStar(require("./users.service"));
const logger_1 = require("../../common/logger/logger");
const rbacSvc = __importStar(require("./rbac.service"));
const inviteSvc = __importStar(require("./invitations.service"));
function normalizeStatusFromInvite(user) {
    const inviteStatus = String(user?.inviteStatus || '').trim().toLowerCase();
    const normalized = inviteStatus === 'accepted' ? 'Active' : 'Invited';
    return { ...user, status: normalized };
}
function isTransientDbTimeout(err) {
    const code = String(err?.code || '').trim().toUpperCase();
    const msg = String(err?.message || err?.error || '').toLowerCase();
    return (code === '57014' || // PostgreSQL statement timeout
        code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'ENETUNREACH' ||
        code === 'EHOSTUNREACH' ||
        msg.includes('query read timeout') ||
        msg.includes('statement timeout') ||
        msg.includes('db operation timed out'));
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function toBool(value, fallback = false) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
function normalizePublicBaseUrl(input) {
    const raw = String(input || '').trim();
    if (!raw)
        return '';
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
            return '';
        return `${parsed.protocol}//${parsed.host}`;
    }
    catch {
        return '';
    }
}
function deriveInviteActivationBaseUrl(req) {
    const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
    const envCandidates = [
        process.env.INVITE_ACTIVATION_BASE_URL,
        process.env.FRONTEND_URL,
        process.env.APP_URL,
        process.env.WEB_APP_URL,
    ]
        .map((value) => normalizePublicBaseUrl(value))
        .filter(Boolean);
    const envBase = envCandidates[0] || '';
    const envLooksLocal = /localhost|127\.0\.0\.1/i.test(envBase);
    if (envBase && !(isProduction && envLooksLocal))
        return envBase;
    const requestOrigin = normalizePublicBaseUrl(req.get('origin'));
    if (requestOrigin)
        return requestOrigin;
    const referer = String(req.get('referer') || '').trim();
    if (referer) {
        try {
            const parsed = new URL(referer);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return `${parsed.protocol}//${parsed.host}`;
            }
        }
        catch {
            // ignore malformed referrer
        }
    }
    if (envBase)
        return envBase;
    return undefined;
}
const USER_CREATE_RETRY_ATTEMPTS = Math.max(0, Number(process.env.USER_CREATE_RETRY_ATTEMPTS || 1));
const USER_CREATE_RETRY_DELAY_MS = Math.max(250, Number(process.env.USER_CREATE_RETRY_DELAY_MS || 700));
const USER_CREATE_ATTEMPT_TIMEOUT_MS = Math.max(2500, Number(process.env.USER_CREATE_ATTEMPT_TIMEOUT_MS || 8000));
const USER_LIST_RETRY_ATTEMPTS = Math.max(0, Number(process.env.USER_LIST_RETRY_ATTEMPTS || 2));
const USER_LIST_RETRY_DELAY_MS = Math.max(250, Number(process.env.USER_LIST_RETRY_DELAY_MS || 700));
const USER_LIST_ATTEMPT_TIMEOUT_MS = Math.max(5000, Number(process.env.USER_LIST_ATTEMPT_TIMEOUT_MS || 20000));
const inviteSingleFlight = new Map();
function withTimeout(promise, timeoutMs) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const timeoutError = new Error(`DB operation timed out after ${timeoutMs}ms`);
            timeoutError.code = 'ETIMEDOUT';
            reject(timeoutError);
        }, timeoutMs);
        promise.then((value) => {
            clearTimeout(timer);
            resolve(value);
        }, (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
async function withTimeoutRetry(runner) {
    let lastErr = null;
    for (let attempt = 0; attempt <= USER_CREATE_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await withTimeout(runner(), USER_CREATE_ATTEMPT_TIMEOUT_MS);
        }
        catch (err) {
            lastErr = err;
            if (!isTransientDbTimeout(err) || attempt >= USER_CREATE_RETRY_ATTEMPTS)
                break;
            await wait(USER_CREATE_RETRY_DELAY_MS * (attempt + 1));
        }
    }
    throw lastErr;
}
async function withListTimeoutRetry(runner) {
    let lastErr = null;
    for (let attempt = 0; attempt <= USER_LIST_RETRY_ATTEMPTS; attempt += 1) {
        try {
            return await withTimeout(runner(), USER_LIST_ATTEMPT_TIMEOUT_MS);
        }
        catch (err) {
            lastErr = err;
            if (!isTransientDbTimeout(err) || attempt >= USER_LIST_RETRY_ATTEMPTS)
                break;
            await wait(USER_LIST_RETRY_DELAY_MS * (attempt + 1));
        }
    }
    throw lastErr;
}
async function runInviteSingleFlight(key, runner) {
    const existing = inviteSingleFlight.get(key);
    if (existing)
        return existing;
    const pending = runner().finally(() => {
        inviteSingleFlight.delete(key);
    });
    inviteSingleFlight.set(key, pending);
    return pending;
}
async function list(req, res) {
    try {
        // Do not block user listing on runtime RBAC seeding.
        void rbacSvc.ensureRbacSeeded().catch((seedErr) => {
            console.warn('RBAC seed warmup skipped for /users list due to seed error:', seedErr);
        });
        const q = req.query.q ? String(req.query.q) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const role = req.query.role ? String(req.query.role) : undefined;
        const principalType = req.query.principalType ? String(req.query.principalType) : undefined;
        const opts = { q, limit, role, principalType: role ? principalType : (principalType || 'user') };
        let users = [];
        try {
            users = await withListTimeoutRetry(() => svc.listUsers(opts));
        }
        catch (err) {
            if (!isTransientDbTimeout(err))
                throw err;
            try {
                // Fallback to lightweight list when invite-status joins are slow.
                users = await withListTimeoutRetry(() => svc.listUsersLightweight(opts));
                res.setHeader('X-Users-Source', 'lightweight-fallback');
            }
            catch (fallbackErr) {
                if (!isTransientDbTimeout(fallbackErr))
                    throw fallbackErr;
                // Last-resort fallback with a minimal query that avoids optional tables.
                users = await withTimeout(svc.listUsersEmergency(opts), Math.min(USER_LIST_ATTEMPT_TIMEOUT_MS, 8000));
                res.setHeader('X-Users-Source', 'emergency-fallback');
            }
        }
        res.json(Array.isArray(users) ? users.map((u) => normalizeStatusFromInvite(u)) : []);
    }
    catch (err) {
        if (isTransientDbTimeout(err)) {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to list users' });
    }
}
exports.list = list;
async function getOne(req, res) {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ error: 'Invalid id' });
    const user = await svc.getUserById(id);
    if (!user)
        return res.status(404).json({ error: 'User not found' });
    res.json(normalizeStatusFromInvite(user));
}
exports.getOne = getOne;
async function create(req, res) {
    try {
        try {
            await rbacSvc.ensureRbacSeeded();
        }
        catch (seedErr) {
            console.warn('RBAC seed skipped for /users create due to seed error:', seedErr);
        }
        const payload = req.body || {};
        const actorId = Number(req.user?.id || 0);
        const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req);
        const created = await withTimeoutRetry(() => svc.createUser(payload));
        if (payload.defaultPermissionTemplate) {
            await rbacSvc.upsertUserPermissions(created.id, {
                templateKey: String(payload.defaultPermissionTemplate),
                autoSwitchCustom: false,
            }, actorId);
        }
        const inviteMode = String(payload.inviteMode || '').toLowerCase();
        const shouldHandleInviteDuringCreate = inviteMode === 'now' || inviteMode === 'later';
        let inviteResult = null;
        if (shouldHandleInviteDuringCreate) {
            try {
                inviteResult = await withTimeoutRetry(() => inviteSvc.inviteExistingUser(created.id, actorId, {
                    mode: 'invite',
                    sendNow: inviteMode === 'now',
                    requireImmediate: inviteMode === 'now',
                    activationBaseUrl: inviteActivationBaseUrl,
                }, { ipAddress: req.ip }));
            }
            catch (inviteErr) {
                console.warn('User created but invitation flow failed during /users create:', inviteErr);
            }
        }
        await (0, logger_1.auditLog)({
            action: 'create_user',
            entity: 'user',
            entityId: created.id,
            user: actorId,
            meta: { email: created.email, role: created.role, invitationId: inviteResult?.invitationId || null },
        });
        const inviteStatus = inviteResult?.inviteStatus
            || (shouldHandleInviteDuringCreate && inviteMode === 'later' ? 'invite_pending' : created?.inviteStatus || 'none');
        res.status(201).json(normalizeStatusFromInvite({ ...created, inviteStatus }));
    }
    catch (err) {
        if (isTransientDbTimeout(err)) {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to create user' });
    }
}
exports.create = create;
async function update(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const payload = req.body || {};
        const actorRole = String(req?.user?.role || '').toUpperCase();
        if (payload?.name !== undefined && actorRole !== 'ADMIN') {
            return res.status(403).json({ error: 'Only admin can change user name' });
        }
        const updated = await svc.updateUser(id, payload);
        await (0, logger_1.auditLog)({ action: 'update_user', entity: 'user', entityId: updated.id, user: req.user?.id });
        res.json(normalizeStatusFromInvite(updated));
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to update user' });
    }
}
exports.update = update;
async function remove(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const deleted = await svc.deleteUser(id);
        await (0, logger_1.auditLog)({ action: 'delete_user', entity: 'user', entityId: deleted.id, user: req.user?.id, meta: { email: deleted.email } });
        res.json({ success: true, deleted });
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to delete user' });
    }
}
exports.remove = remove;
async function getPermissions(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const snapshot = await rbacSvc.getUserPermissionsSnapshot(id);
        res.json(snapshot);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to load permissions' });
    }
}
exports.getPermissions = getPermissions;
async function listTicketQueues(req, res) {
    try {
        const queues = await rbacSvc.listTicketQueues();
        res.json(queues);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to list ticket queues' });
    }
}
exports.listTicketQueues = listTicketQueues;
async function createTicketQueue(req, res) {
    try {
        const payload = req.body || {};
        const created = await rbacSvc.createTicketQueue({ label: payload.label, queueKey: payload.queueKey }, Number(req.user?.id || 0));
        res.status(201).json(created);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to create ticket queue' });
    }
}
exports.createTicketQueue = createTicketQueue;
async function updateTicketQueue(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const payload = req.body || {};
        const updated = await rbacSvc.updateTicketQueue(id, { label: payload.label }, Number(req.user?.id || 0));
        res.json(updated);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to update ticket queue' });
    }
}
exports.updateTicketQueue = updateTicketQueue;
async function deleteTicketQueue(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const removed = await rbacSvc.deleteTicketQueue(id, Number(req.user?.id || 0));
        res.json({ success: true, deleted: removed });
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to delete ticket queue' });
    }
}
exports.deleteTicketQueue = deleteTicketQueue;
async function updatePermissions(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const payload = req.body || {};
        const snapshot = await rbacSvc.upsertUserPermissions(id, {
            role: payload.role,
            templateKey: payload.templateKey,
            permissions: payload.permissions,
            autoSwitchCustom: payload.autoSwitchCustom !== false,
        }, Number(req.user?.id || 0));
        res.json(snapshot);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to update permissions' });
    }
}
exports.updatePermissions = updatePermissions;
async function addTicketCustomAction(req, res) {
    try {
        const payload = req.body || {};
        const created = await rbacSvc.createTicketQueueCustomAction({
            queue: payload.queue,
            label: payload.label,
            actionKey: payload.actionKey,
        }, Number(req.user?.id || 0));
        res.status(201).json(created);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to add custom action' });
    }
}
exports.addTicketCustomAction = addTicketCustomAction;
async function sendInvite(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const toEmail = String(req.body?.toEmail || '').trim();
        const requireImmediate = toBool(req.body?.requireImmediate ?? req.body?.immediate ?? req.query?.immediate, true);
        const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req);
        const key = `invite:${id}:${String(toEmail || '').toLowerCase()}`;
        const result = await runInviteSingleFlight(key, () => inviteSvc.inviteExistingUser(id, Number(req.user?.id || 0), {
            mode: 'invite',
            sendNow: true,
            requireImmediate,
            toEmail: toEmail || undefined,
            activationBaseUrl: inviteActivationBaseUrl,
        }, { ipAddress: req.ip }));
        res.json(result);
    }
    catch (err) {
        if (String(err?.source || '').toLowerCase() === 'smtp' || String(err?.code || '').toUpperCase().startsWith('SMTP_')) {
            return res.status(err.status || 502).json({ error: err.message || 'Invite email delivery failed' });
        }
        if (isTransientDbTimeout(err)) {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to send invite' });
    }
}
exports.sendInvite = sendInvite;
async function sendServiceAccountInvite(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const toEmail = String(req.body?.toEmail || '').trim();
        const requireImmediate = toBool(req.body?.requireImmediate ?? req.body?.immediate ?? req.query?.immediate, true);
        const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req);
        const key = `invite:${id}:${String(toEmail || '').toLowerCase()}`;
        const result = await runInviteSingleFlight(key, () => inviteSvc.inviteAgentUser(id, Number(req.user?.id || 0), {
            mode: 'invite',
            sendNow: true,
            requireImmediate,
            toEmail: toEmail || undefined,
            activationBaseUrl: inviteActivationBaseUrl,
        }, { ipAddress: req.ip }));
        res.json(result);
    }
    catch (err) {
        if (String(err?.source || '').toLowerCase() === 'smtp' || String(err?.code || '').toUpperCase().startsWith('SMTP_')) {
            return res.status(err.status || 502).json({ error: err.message || 'Invite email delivery failed' });
        }
        if (isTransientDbTimeout(err)) {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to send service account invite' });
    }
}
exports.sendServiceAccountInvite = sendServiceAccountInvite;
async function reinviteServiceAccount(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const toEmail = String(req.body?.toEmail || '').trim();
        const requireImmediate = toBool(req.body?.requireImmediate ?? req.body?.immediate ?? req.query?.immediate, true);
        const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req);
        const key = `reinvite:${id}:${String(toEmail || '').toLowerCase()}`;
        const result = await runInviteSingleFlight(key, () => inviteSvc.inviteAgentUser(id, Number(req.user?.id || 0), {
            mode: 'reinvite',
            sendNow: true,
            requireImmediate,
            toEmail: toEmail || undefined,
            activationBaseUrl: inviteActivationBaseUrl,
        }, { ipAddress: req.ip }));
        res.json(result);
    }
    catch (err) {
        if (String(err?.source || '').toLowerCase() === 'smtp' || String(err?.code || '').toUpperCase().startsWith('SMTP_')) {
            return res.status(err.status || 502).json({ error: err.message || 'Invite email delivery failed' });
        }
        if (isTransientDbTimeout(err)) {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to re-invite service account' });
    }
}
exports.reinviteServiceAccount = reinviteServiceAccount;
async function markInvitePending(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const result = await withTimeoutRetry(() => inviteSvc.inviteExistingUser(id, Number(req.user?.id || 0), { mode: 'invite', sendNow: false }, { ipAddress: req.ip }));
        res.json({ ...result, inviteStatus: 'invite_pending' });
    }
    catch (err) {
        if (isTransientDbTimeout(err)) {
            return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' });
        }
        res.status(err.status || 500).json({ error: err.message || 'Failed to mark invite pending' });
    }
}
exports.markInvitePending = markInvitePending;
async function createInvitation(req, res) {
    try {
        const payload = req.body || {};
        const result = await inviteSvc.createInvitationRequest({
            email: payload.email,
            name: payload.name || payload.fullName,
            roleIds: payload.roleIds || payload.role_ids,
            roleNames: payload.roleNames,
            teamIds: payload.teamIds || payload.team_ids,
            sendNow: payload.sendNow !== false,
        }, Number(req.user?.id || 0), { ipAddress: req.ip });
        res.status(201).json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to create invitation' });
    }
}
exports.createInvitation = createInvitation;
async function resendInvitation(req, res) {
    try {
        const invitationId = Number(req.params.invitationId);
        if (!invitationId)
            return res.status(400).json({ error: 'Invalid invitation id' });
        const result = await inviteSvc.resendInvitationById(invitationId, Number(req.user?.id || 0), { ipAddress: req.ip });
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to resend invitation' });
    }
}
exports.resendInvitation = resendInvitation;
async function revokeInvitation(req, res) {
    try {
        const invitationId = Number(req.params.invitationId);
        if (!invitationId)
            return res.status(400).json({ error: 'Invalid invitation id' });
        const result = await inviteSvc.revokeInvitationById(invitationId, Number(req.user?.id || 0), { ipAddress: req.ip });
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to revoke invitation' });
    }
}
exports.revokeInvitation = revokeInvitation;
async function getMyPresence(req, res) {
    try {
        const id = Number(req.user?.id || 0);
        if (!id)
            return res.status(401).json({ error: 'Unauthorized' });
        const result = await svc.getUserPresence(id);
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to load presence' });
    }
}
exports.getMyPresence = getMyPresence;
async function putMyPresence(req, res) {
    try {
        const id = Number(req.user?.id || 0);
        if (!id)
            return res.status(401).json({ error: 'Unauthorized' });
        const status = req.body?.status;
        const result = await svc.saveUserPresence(id, status);
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to save presence' });
    }
}
exports.putMyPresence = putMyPresence;
