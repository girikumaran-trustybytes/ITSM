"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unassignAsset = exports.assignAsset = exports.deleteTicket = exports.updateTicket = exports.resolveTicketWithDetails = exports.addPrivateNote = exports.addResponse = exports.createHistoryEntry = exports.transitionTicket = exports.createTicket = exports.getTicketById = exports.getTickets = void 0;
const db_1 = require("../../db");
const workflow_service_1 = require("../workflows/workflow.service");
const logger_1 = require("../../common/logger/logger");
const mailer_service_1 = __importDefault(require("../../services/mailer.service"));
const isNumericId = (value) => /^\d+$/.test(value);
function buildTicketWhere(idOrTicketId, alias = 't', startIndex = 1) {
    if (isNumericId(idOrTicketId)) {
        return { clause: `${alias}."id" = $${startIndex}`, params: [Number(idOrTicketId)] };
    }
    return { clause: `${alias}."ticketId" = $${startIndex}`, params: [idOrTicketId] };
}
async function getTicketRecord(idOrTicketId) {
    const where = buildTicketWhere(idOrTicketId, 't', 1);
    return (0, db_1.queryOne)(`SELECT * FROM "Ticket" t WHERE ${where.clause}`, where.params);
}
function buildInsert(table, data) {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const cols = keys.map((k) => `"${k}"`);
    const params = keys.map((_, i) => `$${i + 1}`);
    const values = keys.map((k) => data[k]);
    const text = `INSERT INTO "${table}" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`;
    return { text, values };
}
async function getNextTicketTag() {
    await (0, db_1.query)('CREATE SEQUENCE IF NOT EXISTS ticket_id_seq START 1');
    await (0, db_1.query)(`SELECT setval(
      'ticket_id_seq',
      GREATEST(
        (SELECT last_value FROM ticket_id_seq),
        (SELECT COALESCE(MAX((regexp_match("ticketId", '^TB#([0-9]+)$'))[1]::INTEGER), 0) FROM "Ticket")
      )
    )`);
    const row = await (0, db_1.queryOne)(`SELECT nextval('ticket_id_seq')::text AS next_id`);
    const num = Number(row?.next_id || 1);
    return `TB#${String(num).padStart(5, '0')}`;
}
const getTickets = async (opts = {}, viewer) => {
    const page = opts.page ?? 1;
    const pageSize = opts.pageSize ?? 20;
    const conditions = [];
    const params = [];
    if (opts.q) {
        params.push(`%${opts.q}%`);
        conditions.push(`(t."ticketId" ILIKE $${params.length} OR t."subject" ILIKE $${params.length} OR t."description" ILIKE $${params.length} OR t."category" ILIKE $${params.length})`);
    }
    if (viewer?.role === 'USER' && viewer?.id) {
        params.push(Number(viewer.id));
        conditions.push(`t."requesterId" = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * pageSize;
    const [items, totalRow] = await Promise.all([
        (0, db_1.query)(`SELECT t.*, row_to_json(r) AS "requester", row_to_json(a) AS "assignee"
       FROM "Ticket" t
       LEFT JOIN "User" r ON r."id" = t."requesterId"
       LEFT JOIN "User" a ON a."id" = t."assigneeId"
       ${where}
       ORDER BY t."createdAt" DESC
       OFFSET $${params.length + 1}
       LIMIT $${params.length + 2}`, [...params, offset, pageSize]),
        (0, db_1.queryOne)(`SELECT COUNT(*)::text AS count FROM "Ticket" t ${where}`, params),
    ]);
    const total = Number(totalRow?.count || 0);
    return { items, total, page, pageSize };
};
exports.getTickets = getTickets;
const getTicketById = async (id, viewer) => {
    const where = buildTicketWhere(id, 't', 1);
    const t = await (0, db_1.queryOne)(`SELECT t.*, row_to_json(r) AS "requester", row_to_json(a) AS "assignee", row_to_json(asset) AS "asset"
     FROM "Ticket" t
     LEFT JOIN "User" r ON r."id" = t."requesterId"
     LEFT JOIN "User" a ON a."id" = t."assigneeId"
     LEFT JOIN "Asset" asset ON asset."id" = t."assetId"
     WHERE ${where.clause}`, where.params);
    if (t && viewer?.role === 'USER' && viewer?.id && t.requesterId !== Number(viewer.id)) {
        return null;
    }
    if (!t)
        return null;
    const [attachments, history] = await Promise.all([
        (0, db_1.query)('SELECT * FROM "Attachment" WHERE "ticketId" = $1', [t.id]),
        (0, db_1.query)('SELECT * FROM "TicketHistory" WHERE "ticketId" = $1', [t.id]),
    ]);
    t.attachments = attachments;
    t.history = history;
    return t;
};
exports.getTicketById = getTicketById;
const createTicket = async (payload, creator = 'system') => {
    const ticketId = await getNextTicketTag();
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
    const { text, values } = buildInsert('Ticket', data);
    const createdRows = await (0, db_1.query)(text, values);
    const created = createdRows[0];
    // start SLA tracking record
    try {
        await (0, db_1.query)('INSERT INTO "SlaTracking" ("ticketId", "slaName", "startTime", "breachTime", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())', [created.id, `${created.priority} SLA`, now, computeSlaBreachTime(now, priority), 'running']);
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
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const can = workflow_service_1.workflowEngine.canTransition(t.type, t.status, toState);
    if (!can)
        throw { status: 400, message: `Invalid transition from ${t.status} to ${toState}` };
    const from = t.status;
    const where = buildTicketWhere(ticketId, 't', 2);
    const updatedRows = await (0, db_1.query)(`UPDATE "Ticket" t SET "status" = $1, "updatedAt" = NOW() WHERE ${where.clause} RETURNING *`, [toState, ...where.params]);
    const updated = updatedRows[0];
    await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
        t.id,
        from,
        toState,
        typeof user === 'number' ? user : parseInt(String(user)) || null,
        '',
        false,
    ]);
    await (0, logger_1.auditLog)({
        action: 'transition',
        ticketId: updated.ticketId,
        user,
        meta: { from, to: toState },
    });
    // notify requester/assignee
    try {
        const requester = updated.requesterId ? await (0, db_1.queryOne)('SELECT * FROM "User" WHERE "id" = $1', [updated.requesterId]) : null;
        const assignee = updated.assigneeId ? await (0, db_1.queryOne)('SELECT * FROM "User" WHERE "id" = $1', [updated.assigneeId]) : null;
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
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const rows = await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *', [
        t.id,
        t.status,
        t.status,
        typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || null,
        opts.note,
        false,
    ]);
    const created = rows[0];
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
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const rows = await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *', [
        t.id,
        t.status,
        t.status,
        typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || null,
        opts.message,
        false,
    ]);
    const created = rows[0];
    await (0, logger_1.auditLog)({ action: 'respond', ticketId: t.ticketId, user: opts.user, meta: { message: opts.message } });
    if (opts.sendEmail && t.requesterId) {
        try {
            const requester = await (0, db_1.queryOne)('SELECT * FROM "User" WHERE "id" = $1', [t.requesterId]);
            if (requester?.email)
                await mailer_service_1.default.sendTicketResponse(requester.email, t, opts.message);
        }
        catch (e) {
            console.warn('Failed sending ticket response email', e);
        }
    }
    return created;
};
exports.addResponse = addResponse;
const addPrivateNote = async (ticketId, opts) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const rows = await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *', [
        t.id,
        t.status,
        t.status,
        typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || null,
        opts.note,
        true,
    ]);
    const created = rows[0];
    await (0, logger_1.auditLog)({ action: 'private_note', ticketId: t.ticketId, user: opts.user, meta: { note: opts.note } });
    return created;
};
exports.addPrivateNote = addPrivateNote;
const resolveTicketWithDetails = async (ticketId, opts) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const from = t.status;
    const where = buildTicketWhere(ticketId, 't', 4);
    const updatedRows = await (0, db_1.query)(`UPDATE "Ticket" t SET "status" = $1, "resolution" = $2, "resolutionCategory" = $3, "resolvedAt" = NOW(), "updatedAt" = NOW() WHERE ${where.clause} RETURNING *`, [
        'Resolved',
        opts.resolution,
        opts.resolutionCategory || null,
        ...where.params,
    ]);
    const updated = updatedRows[0];
    await (0, db_1.query)('INSERT INTO "TicketStatusHistory" ("ticketId", "oldStatus", "newStatus", "changedById", "changedAt") VALUES ($1, $2, $3, $4, NOW())', [
        t.id,
        from,
        'Resolved',
        typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || null,
    ]);
    await (0, logger_1.auditLog)({ action: 'resolve', ticketId: updated.ticketId, user: opts.user, meta: { resolution: opts.resolution, resolutionCategory: opts.resolutionCategory } });
    if (opts.sendEmail && t.requesterId) {
        try {
            const requester = await (0, db_1.queryOne)('SELECT * FROM "User" WHERE "id" = $1', [t.requesterId]);
            if (requester?.email)
                await mailer_service_1.default.sendTicketResolved(requester.email, updated);
        }
        catch (e) {
            console.warn('Failed sending ticket resolved email', e);
        }
    }
    return updated;
};
exports.resolveTicketWithDetails = resolveTicketWithDetails;
const updateTicket = async (ticketId, payload, user) => {
    const t = await getTicketRecord(ticketId);
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
    const setParts = [];
    const params = [];
    for (const [key, value] of Object.entries(data)) {
        params.push(value);
        setParts.push(`"${key}" = $${params.length}`);
    }
    setParts.push('"updatedAt" = NOW()');
    const where = buildTicketWhere(ticketId, 't', params.length + 1);
    const updatedRows = await (0, db_1.query)(`UPDATE "Ticket" t SET ${setParts.join(', ')} WHERE ${where.clause} RETURNING *`, [...params, ...where.params]);
    const updated = updatedRows[0];
    await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
        t.id,
        t.status,
        updated.status,
        typeof user === 'number' ? user : parseInt(String(user)) || null,
        'ticket updated',
        false,
    ]);
    await (0, logger_1.auditLog)({ action: 'update_ticket', ticketId: updated.ticketId, user, meta: { changes: data } });
    return updated;
};
exports.updateTicket = updateTicket;
const deleteTicket = async (ticketId, user) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    // hard delete for now
    const where = buildTicketWhere(ticketId, 't', 1);
    const deletedRows = await (0, db_1.query)(`DELETE FROM "Ticket" t WHERE ${where.clause} RETURNING *`, where.params);
    const deleted = deletedRows[0];
    await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
        t.id,
        t.status,
        'Deleted',
        typeof user === 'number' ? user : parseInt(String(user)) || null,
        'deleted',
        false,
    ]);
    await (0, logger_1.auditLog)({ action: 'delete_ticket', ticketId: t.ticketId, user });
    return deleted;
};
exports.deleteTicket = deleteTicket;
const assignAsset = async (ticketId, assetId, user) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const asset = await (0, db_1.queryOne)('SELECT * FROM "Asset" WHERE "id" = $1', [assetId]);
    if (!asset)
        throw { status: 404, message: 'Asset not found' };
    const where = buildTicketWhere(ticketId, 't', 2);
    await (0, db_1.query)(`UPDATE "Ticket" t SET "assetId" = $1, "updatedAt" = NOW() WHERE ${where.clause}`, [asset.id, ...where.params]);
    const updated = await (0, db_1.queryOne)(`SELECT t.*, row_to_json(a) AS "asset"
     FROM "Ticket" t
     LEFT JOIN "Asset" a ON a."id" = t."assetId"
     WHERE t."id" = $1`, [t.id]);
    await (0, logger_1.auditLog)({ action: 'assign_asset', ticketId: updated.ticketId, user, meta: { assetId: asset.id } });
    return updated;
};
exports.assignAsset = assignAsset;
const unassignAsset = async (ticketId, user) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const where = buildTicketWhere(ticketId, 't', 1);
    await (0, db_1.query)(`UPDATE "Ticket" t SET "assetId" = NULL, "updatedAt" = NOW() WHERE ${where.clause}`, where.params);
    const updated = await (0, db_1.queryOne)(`SELECT t.*, row_to_json(a) AS "asset"
     FROM "Ticket" t
     LEFT JOIN "Asset" a ON a."id" = t."assetId"
     WHERE t."id" = $1`, [t.id]);
    await (0, logger_1.auditLog)({ action: 'unassign_asset', ticketId: updated.ticketId, user });
    return updated;
};
exports.unassignAsset = unassignAsset;
