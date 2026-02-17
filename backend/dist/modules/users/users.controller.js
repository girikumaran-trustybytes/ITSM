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
exports.markInvitePending = exports.reinviteServiceAccount = exports.sendServiceAccountInvite = exports.sendInvite = exports.addTicketCustomAction = exports.updatePermissions = exports.getPermissions = exports.remove = exports.update = exports.create = exports.getOne = exports.list = void 0;
const svc = __importStar(require("./users.service"));
const logger_1 = require("../../common/logger/logger");
const rbacSvc = __importStar(require("./rbac.service"));
async function list(req, res) {
    try {
        await rbacSvc.ensureRbacSeeded();
        const q = req.query.q ? String(req.query.q) : undefined;
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const role = req.query.role ? String(req.query.role) : undefined;
        const users = await svc.listUsers({ q, limit, role });
        res.json(users);
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
    res.json(user);
}
exports.getOne = getOne;
async function create(req, res) {
    try {
        await rbacSvc.ensureRbacSeeded();
        const payload = req.body || {};
        const created = await svc.createUser(payload);
        if (payload.defaultPermissionTemplate) {
            await rbacSvc.upsertUserPermissions(created.id, {
                templateKey: String(payload.defaultPermissionTemplate),
                autoSwitchCustom: false,
            }, Number(req.user?.id || 0));
        }
        const inviteMode = String(payload.inviteMode || '').toLowerCase();
        if (inviteMode === 'later') {
            await rbacSvc.markInvitePending(created.id, Number(req.user?.id || 0));
        }
        if (inviteMode === 'now') {
            await rbacSvc.sendUserInvite(created.id, Number(req.user?.id || 0));
        }
        await (0, logger_1.auditLog)({ action: 'create_user', entity: 'user', entityId: created.id, user: req.user?.id, meta: { email: created.email, role: created.role } });
        res.status(201).json(created);
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
        const updated = await svc.updateUser(id, payload);
        await (0, logger_1.auditLog)({ action: 'update_user', entity: 'user', entityId: updated.id, user: req.user?.id });
        res.json(updated);
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
        const result = await rbacSvc.sendUserInvite(id, Number(req.user?.id || 0));
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
        const toEmail = String(req.body?.toEmail || '').trim() || undefined;
        const result = await rbacSvc.sendServiceAccountInvite(id, Number(req.user?.id || 0), { mode: 'invite', toEmail });
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
        const toEmail = String(req.body?.toEmail || '').trim() || undefined;
        const result = await rbacSvc.sendServiceAccountInvite(id, Number(req.user?.id || 0), { mode: 'reinvite', toEmail });
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
        await rbacSvc.markInvitePending(id, Number(req.user?.id || 0));
        res.json({ inviteStatus: 'invite_pending' });
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to mark invite pending' });
    }
}
exports.markInvitePending = markInvitePending;
