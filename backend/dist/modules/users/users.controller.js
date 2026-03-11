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
async function list(req, res) {
    try {
        try {
            await rbacSvc.ensureRbacSeeded();
        }
        catch (seedErr) {
            console.warn('RBAC seed skipped for /users list due to seed error:', seedErr);
        }
        const q = req.query.q ? String(req.query.q) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const role = req.query.role ? String(req.query.role) : undefined;
        const users = await svc.listUsers({ q, limit, role });
        res.json(Array.isArray(users) ? users.map((u) => normalizeStatusFromInvite(u)) : []);
    }
    catch (err) {
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
        await rbacSvc.ensureRbacSeeded();
        const payload = req.body || {};
        const actorId = Number(req.user?.id || 0);
        const created = await svc.createUser(payload);
        if (payload.defaultPermissionTemplate) {
            await rbacSvc.upsertUserPermissions(created.id, {
                templateKey: String(payload.defaultPermissionTemplate),
                autoSwitchCustom: false,
            }, actorId);
        }
        const inviteMode = String(payload.inviteMode || '').toLowerCase();
        const inviteResult = await inviteSvc.inviteExistingUser(created.id, actorId, {
            mode: 'invite',
            sendNow: inviteMode === 'now',
        }, { ipAddress: req.ip });
        await (0, logger_1.auditLog)({
            action: 'create_user',
            entity: 'user',
            entityId: created.id,
            user: actorId,
            meta: { email: created.email, role: created.role, invitationId: inviteResult?.invitationId || null },
        });
        res.status(201).json(normalizeStatusFromInvite({ ...created, inviteStatus: inviteResult?.inviteStatus || 'invite_pending' }));
    }
    catch (err) {
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
        const result = await inviteSvc.inviteExistingUser(id, Number(req.user?.id || 0), { mode: 'invite', sendNow: true }, { ipAddress: req.ip });
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to send invite' });
    }
}
exports.sendInvite = sendInvite;
async function sendServiceAccountInvite(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const result = await inviteSvc.inviteExistingUser(id, Number(req.user?.id || 0), { mode: 'invite', sendNow: true }, { ipAddress: req.ip });
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to send service account invite' });
    }
}
exports.sendServiceAccountInvite = sendServiceAccountInvite;
async function reinviteServiceAccount(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const result = await inviteSvc.inviteExistingUser(id, Number(req.user?.id || 0), { mode: 'reinvite', sendNow: true }, { ipAddress: req.ip });
        res.json(result);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to re-invite service account' });
    }
}
exports.reinviteServiceAccount = reinviteServiceAccount;
async function markInvitePending(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const result = await inviteSvc.inviteExistingUser(id, Number(req.user?.id || 0), { mode: 'invite', sendNow: false }, { ipAddress: req.ip });
        res.json({ ...result, inviteStatus: 'invite_pending' });
    }
    catch (err) {
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
