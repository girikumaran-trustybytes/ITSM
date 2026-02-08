"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unassignAsset = exports.assignAsset = exports.deleteTicket = exports.updateTicket = exports.resolveTicketWithDetails = exports.addPrivateNote = exports.addResponse = exports.createHistoryEntry = exports.transitionTicket = exports.createTicket = exports.getTicketById = exports.getTickets = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
const workflow_service_1 = require("../workflows/workflow.service");
const logger_1 = require("../../common/logger/logger");
const mailer_service_1 = __importDefault(require("../../services/mailer.service"));
const getTickets = async (opts = {}, viewer) => {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const where = {};
    if (opts.q) {
        where.OR = [
            { ticketId: { contains: opts.q } },
            { subject: { contains: opts.q } },
            { description: { contains: opts.q } },
            { category: { contains: opts.q } },
        ];
    }
    if (viewer?.role === 'USER' && viewer?.id) {
        where.requesterId = Number(viewer.id);
    }
    const [items, total] = await Promise.all([
        client_1.default.ticket.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip: (page - 1) * pageSize,
            take: pageSize,
            include: { requester: true, assignee: true },
        }),
        client_1.default.ticket.count({ where }),
    ]);
    return { items, total, page, pageSize };
};
exports.getTickets = getTickets;
const isNumericId = (value) => /^\d+$/.test(value);
const resolveTicketWhere = (idOrTicketId) => isNumericId(idOrTicketId) ? { id: Number(idOrTicketId) } : { ticketId: idOrTicketId };
const getTicketById = async (id, viewer) => {
    const t = await client_1.default.ticket.findUnique({
        where: resolveTicketWhere(id),
        include: { attachments: true, history: true, requester: true, assignee: true, asset: true },
    });
    if (t && viewer?.role === 'USER' && viewer?.id && t.requesterId !== Number(viewer.id)) {
        return null;
    }
    return t;
};
exports.getTicketById = getTicketById;
const createTicket = async (payload, creator = 'system') => {
    const ticketId = `TKT-${Date.now()}`;
    // auto-actions: compute priority from impact x urgency if not provided
    function computePriority(impact, urgency) {
        const map = { Low: 1, Medium: 2, High: 3 };
        const i = map[impact] || 1;
        const u = map[urgency] || 1;
        const score = i * u;
        if (score >= 6)
            return 'High';
        if (score >= 2)
            return 'Medium';
        return 'Low';
    }
    function computeSlaBreachTime(start, priority) {
        // simple SLA mapping (hours)
        const hoursByPriority = { High: 8, Medium: 24, Low: 72 };
        const hours = hoursByPriority[priority] || 24;
        return new Date(start.getTime() + hours * 60 * 60 * 1000);
    }
    function autoCategoryFromText(text) {
        if (!text)
            return undefined;
        const t = text.toLowerCase();
        if (t.includes('battery') || t.includes('laptop') || t.includes('screen') || t.includes('keyboard'))
            return 'Hardware';
        if (t.includes('email') || t.includes('outlook') || t.includes('imap'))
            return 'Email';
        if (t.includes('network') || t.includes('vpn') || t.includes('wifi'))
            return 'Network';
        return undefined;
    }
    const impact = payload.impact || 'Low';
    const urgency = payload.urgency || 'Low';
    const priority = payload.priority || computePriority(impact, urgency);
    const now = payload.slaStart ? new Date(payload.slaStart) : new Date();
    const category = payload.category || autoCategoryFromText(`${payload.description || ''} ${payload.summary || ''} ${payload.subject || ''}`);
    const data = {
        ticketId,
        subject: payload.subject || payload.summary || undefined,
        type: payload.type || 'Incident',
        priority,
        impact,
        urgency,
        status: payload.status || 'New',
        subcategory: payload.subcategory,
        description: payload.description,
        slaStart: now,
    };
    if (category)
        data.category = category;
    if (payload.requesterId)
        data.requesterId = payload.requesterId;
    if (payload.assigneeId)
        data.assigneeId = payload.assigneeId;
    const created = await client_1.default.ticket.create({ data });
    // start SLA tracking record
    try {
        await client_1.default.slaTracking.create({ data: { ticketId: created.id, slaName: `${created.priority} SLA`, startTime: now, breachTime: computeSlaBreachTime(now, priority), status: 'running' } });
    }
    catch (e) {
        console.warn('Failed creating SLA tracking record', e);
    }
    await (0, logger_1.auditLog)({
        action: 'create_ticket',
        ticketId: created.ticketId,
        user: creator,
        meta: { payload },
    });
    // notify requester if email available
    if (payload.requesterEmail) {
        await mailer_service_1.default.sendTicketCreated(payload.requesterEmail, created);
    }
    return created;
};
exports.createTicket = createTicket;
const transitionTicket = async (ticketId, toState, user = 'system') => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const can = workflow_service_1.workflowEngine.canTransition(t.type, t.status, toState);
    if (!can)
        throw { status: 400, message: `Invalid transition from ${t.status} to ${toState}` };
    const from = t.status;
    const updated = await client_1.default.ticket.update({
        where: resolveTicketWhere(ticketId),
        data: { status: toState },
    });
    await client_1.default.ticketHistory.create({
        data: {
            ticketId: t.id,
            fromStatus: from,
            toStatus: toState,
            changedById: typeof user === 'number' ? user : parseInt(String(user)) || undefined,
            note: '',
        },
    });
    await (0, logger_1.auditLog)({
        action: 'transition',
        ticketId: updated.ticketId,
        user,
        meta: { from, to: toState },
    });
    // notify requester/assignee
    try {
        const requester = await client_1.default.user.findUnique({ where: { id: updated.requesterId || undefined } });
        const assignee = await client_1.default.user.findUnique({ where: { id: updated.assigneeId || undefined } });
        if (requester && requester.email)
            await mailer_service_1.default.sendStatusUpdated(requester.email, updated);
        if (assignee && assignee.email)
            await mailer_service_1.default.sendStatusUpdated(assignee.email, updated);
    }
    catch (e) {
        // swallow notification errors
        console.warn('Failed sending status update emails', e);
    }
    return updated;
};
exports.transitionTicket = transitionTicket;
const createHistoryEntry = async (ticketId, opts) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const created = await client_1.default.ticketHistory.create({
        data: {
            ticketId: t.id,
            fromStatus: t.status,
            toStatus: t.status,
            changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined,
            note: opts.note,
        },
    });
    await (0, logger_1.auditLog)({
        action: 'add_history',
        ticketId: t.ticketId,
        user: opts.user,
        meta: { note: opts.note },
    });
    return created;
};
exports.createHistoryEntry = createHistoryEntry;
const addResponse = async (ticketId, opts) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const created = await client_1.default.ticketHistory.create({
        data: {
            ticketId: t.id,
            fromStatus: t.status,
            toStatus: t.status,
            changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined,
            note: opts.message,
            internal: false,
        },
    });
    await (0, logger_1.auditLog)({ action: 'respond', ticketId: t.ticketId, user: opts.user, meta: { message: opts.message } });
    if (opts.sendEmail && t.requesterId) {
        const requester = await client_1.default.user.findUnique({ where: { id: t.requesterId } });
        if (requester?.email)
            await mailer_service_1.default.sendTicketResponse(requester.email, t, opts.message);
    }
    return created;
};
exports.addResponse = addResponse;
const addPrivateNote = async (ticketId, opts) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const created = await client_1.default.ticketHistory.create({
        data: {
            ticketId: t.id,
            fromStatus: t.status,
            toStatus: t.status,
            changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined,
            note: opts.note,
            internal: true,
        },
    });
    await (0, logger_1.auditLog)({ action: 'private_note', ticketId: t.ticketId, user: opts.user, meta: { note: opts.note } });
    return created;
};
exports.addPrivateNote = addPrivateNote;
const resolveTicketWithDetails = async (ticketId, opts) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const from = t.status;
    const updated = await client_1.default.ticket.update({
        where: resolveTicketWhere(ticketId),
        data: { status: 'Resolved', resolution: opts.resolution, resolutionCategory: opts.resolutionCategory || undefined, resolvedAt: new Date() },
    });
    await client_1.default.ticketStatusHistory.create({ data: { ticketId: t.id, oldStatus: from, newStatus: 'Resolved', changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined } });
    await (0, logger_1.auditLog)({ action: 'resolve', ticketId: updated.ticketId, user: opts.user, meta: { resolution: opts.resolution, resolutionCategory: opts.resolutionCategory } });
    if (opts.sendEmail && t.requesterId) {
        const requester = await client_1.default.user.findUnique({ where: { id: t.requesterId } });
        if (requester?.email)
            await mailer_service_1.default.sendTicketResolved(requester.email, updated);
    }
    return updated;
};
exports.resolveTicketWithDetails = resolveTicketWithDetails;
const updateTicket = async (ticketId, payload, user) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const data = {};
    if (payload.subject !== undefined)
        data.subject = payload.subject;
    if (payload.summary !== undefined && payload.subject === undefined)
        data.subject = payload.summary;
    if (payload.description !== undefined)
        data.description = payload.description;
    if (payload.type !== undefined)
        data.type = payload.type;
    if (payload.priority !== undefined)
        data.priority = payload.priority;
    if (payload.category !== undefined)
        data.category = payload.category;
    if (payload.assigneeId !== undefined)
        data.assigneeId = payload.assigneeId || null;
    if (payload.requesterId !== undefined)
        data.requesterId = payload.requesterId || null;
    const updated = await client_1.default.ticket.update({ where: resolveTicketWhere(ticketId), data });
    await client_1.default.ticketHistory.create({ data: { ticketId: t.id, fromStatus: t.status, toStatus: updated.status, changedById: typeof user === 'number' ? user : parseInt(String(user)) || undefined, note: 'ticket updated' } });
    await (0, logger_1.auditLog)({ action: 'update_ticket', ticketId: updated.ticketId, user, meta: { changes: data } });
    return updated;
};
exports.updateTicket = updateTicket;
const deleteTicket = async (ticketId, user) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    // hard delete for now
    const deleted = await client_1.default.ticket.delete({ where: resolveTicketWhere(ticketId) });
    await client_1.default.ticketHistory.create({ data: { ticketId: t.id, fromStatus: t.status, toStatus: 'Deleted', changedById: typeof user === 'number' ? user : parseInt(String(user)) || undefined, note: 'deleted' } });
    await (0, logger_1.auditLog)({ action: 'delete_ticket', ticketId: t.ticketId, user });
    return deleted;
};
exports.deleteTicket = deleteTicket;
const assignAsset = async (ticketId, assetId, user) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const asset = await client_1.default.asset.findUnique({ where: { id: assetId } });
    if (!asset)
        throw { status: 404, message: 'Asset not found' };
    const updated = await client_1.default.ticket.update({
        where: resolveTicketWhere(ticketId),
        data: { assetId: asset.id },
        include: { asset: true },
    });
    await (0, logger_1.auditLog)({ action: 'assign_asset', ticketId: updated.ticketId, user, meta: { assetId: asset.id } });
    return updated;
};
exports.assignAsset = assignAsset;
const unassignAsset = async (ticketId, user) => {
    const t = await client_1.default.ticket.findUnique({ where: resolveTicketWhere(ticketId) });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const updated = await client_1.default.ticket.update({
        where: resolveTicketWhere(ticketId),
        data: { assetId: null },
        include: { asset: true },
    });
    await (0, logger_1.auditLog)({ action: 'unassign_asset', ticketId: updated.ticketId, user });
    return updated;
};
exports.unassignAsset = unassignAsset;
