"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transitionTicket = exports.createTicket = exports.getTicketById = exports.getTickets = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
const workflow_service_1 = require("../workflows/workflow.service");
const logger_1 = require("../../common/logger/logger");
const mailer_service_1 = __importDefault(require("../../services/mailer.service"));
const getTickets = async (opts = {}) => {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const where = {};
    if (opts.q) {
        where.OR = [
            { ticketId: { contains: opts.q } },
            { description: { contains: opts.q } },
            { category: { contains: opts.q } },
        ];
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
const getTicketById = async (id) => {
    const t = await client_1.default.ticket.findUnique({
        where: { ticketId: id },
        include: { attachments: true, history: true, requester: true, assignee: true },
    });
    return t;
};
exports.getTicketById = getTicketById;
const createTicket = async (payload, creator = 'system') => {
    const ticketId = `TKT-${Date.now()}`;
    const created = await client_1.default.ticket.create({
        data: {
            ticketId,
            type: payload.type || 'Incident',
            priority: payload.priority || 'Low',
            impact: payload.impact || 'Low',
            urgency: payload.urgency || 'Low',
            status: payload.status || 'New',
            category: payload.category,
            subcategory: payload.subcategory,
            description: payload.description,
            requesterId: payload.requesterId,
            assigneeId: payload.assigneeId,
            slaStart: payload.slaStart ? new Date(payload.slaStart) : new Date(),
        },
    });
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
    const t = await client_1.default.ticket.findUnique({ where: { ticketId } });
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const can = workflow_service_1.workflowEngine.canTransition(t.type, t.status, toState);
    if (!can)
        throw { status: 400, message: `Invalid transition from ${t.status} to ${toState}` };
    const from = t.status;
    const updated = await client_1.default.ticket.update({
        where: { ticketId },
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
