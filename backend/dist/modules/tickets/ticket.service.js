"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.unassignAsset = exports.assignAsset = exports.deleteTicket = exports.updateTicket = exports.uploadTicketAttachments = exports.resolveTicketWithDetails = exports.addPrivateNote = exports.addResponse = exports.createHistoryEntry = exports.transitionTicket = exports.createTicket = exports.getTicketById = exports.getTickets = void 0;
const db_1 = require("../../db");
const workflow_service_1 = require("../workflows/workflow.service");
const logger_1 = require("../../common/logger/logger");
const mailer_service_1 = __importDefault(require("../../services/mailer.service"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const isNumericId = (value) => /^\d+$/.test(value);
const MAX_ATTACHMENT_SIZE_BYTES = 32 * 1024 * 1024;
const MAX_ATTACHMENT_BATCH_BYTES = 32 * 1024 * 1024;
const ATTACHMENT_BASE_DIR = path_1.default.resolve(process.cwd(), 'uploads', 'tickets');
let attachmentSchemaReady = null;
let slaSchemaReady = null;
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
function normalizePriority(value) {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'high' || v === 'critical')
        return 'High';
    if (v === 'medium')
        return 'Medium';
    return 'Low';
}
function formatSlaClock(ms) {
    const sign = ms < 0 ? '-' : '';
    const abs = Math.abs(ms);
    const totalMinutes = Math.floor(abs / 60000);
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${sign}${hh}:${mm}`;
}
async function ensureSlaTrackingSchema() {
    if (!slaSchemaReady) {
        slaSchemaReady = (async () => {
            await (0, db_1.query)('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "responseTargetAt" TIMESTAMP(3)');
            await (0, db_1.query)('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "resolutionTargetAt" TIMESTAMP(3)');
            await (0, db_1.query)('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "firstRespondedAt" TIMESTAMP(3)');
            await (0, db_1.query)('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3)');
            await (0, db_1.query)('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "policyId" INTEGER');
        })();
    }
    await slaSchemaReady;
}
async function getSlaPolicyByPriority(priority) {
    const normalized = normalizePriority(priority);
    const byPriority = await (0, db_1.queryOne)(`SELECT *
     FROM "SlaConfig"
     WHERE "active" = TRUE
       AND LOWER("priority") = LOWER($1)
     ORDER BY "updatedAt" DESC
     LIMIT 1`, [normalized]);
    if (byPriority)
        return byPriority;
    const fallback = await (0, db_1.queryOne)(`SELECT *
     FROM "SlaConfig"
     WHERE "active" = TRUE
     ORDER BY "updatedAt" DESC
     LIMIT 1`);
    return fallback;
}
function fallbackSlaMinutes(priority) {
    const normalized = normalizePriority(priority);
    if (normalized === 'High')
        return { responseTimeMin: 30, resolutionTimeMin: 8 * 60 };
    if (normalized === 'Medium')
        return { responseTimeMin: 60, resolutionTimeMin: 24 * 60 };
    return { responseTimeMin: 240, resolutionTimeMin: 72 * 60 };
}
async function upsertSlaTrackingForTicket(ticket, options) {
    await ensureSlaTrackingSchema();
    const policy = await getSlaPolicyByPriority(ticket.priority);
    const fallback = fallbackSlaMinutes(ticket.priority);
    const responseMin = Number(policy?.responseTimeMin ?? fallback.responseTimeMin);
    const resolutionMin = Number(policy?.resolutionTimeMin ?? fallback.resolutionTimeMin);
    const startTime = ticket.slaStart ? new Date(ticket.slaStart) : (ticket.createdAt ? new Date(ticket.createdAt) : new Date());
    const responseTargetAt = new Date(startTime.getTime() + responseMin * 60 * 1000);
    const resolutionTargetAt = new Date(startTime.getTime() + resolutionMin * 60 * 1000);
    const status = ['Resolved', 'Closed'].includes(String(ticket.status || '')) ? 'resolved' : 'running';
    await (0, db_1.query)(`INSERT INTO "SlaTracking" (
      "ticketId", "slaName", "startTime", "breachTime", "status", "policyId",
      "responseTargetAt", "resolutionTargetAt", "firstRespondedAt", "resolvedAt", "createdAt", "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NOW(), NOW())
    ON CONFLICT ("ticketId") DO UPDATE
    SET
      "slaName" = EXCLUDED."slaName",
      "startTime" = EXCLUDED."startTime",
      "breachTime" = EXCLUDED."breachTime",
      "status" = EXCLUDED."status",
      "policyId" = EXCLUDED."policyId",
      "responseTargetAt" = EXCLUDED."responseTargetAt",
      "resolutionTargetAt" = EXCLUDED."resolutionTargetAt",
      "firstRespondedAt" = CASE WHEN $9 THEN "SlaTracking"."firstRespondedAt" ELSE EXCLUDED."firstRespondedAt" END,
      "resolvedAt" = CASE WHEN $10 THEN "SlaTracking"."resolvedAt" ELSE EXCLUDED."resolvedAt" END,
      "updatedAt" = NOW()`, [
        ticket.id,
        policy?.name || `${normalizePriority(ticket.priority)} SLA`,
        startTime,
        resolutionTargetAt,
        status,
        policy?.id || null,
        responseTargetAt,
        resolutionTargetAt,
        Boolean(options?.keepFirstResponse),
        Boolean(options?.keepResolvedAt),
    ]);
}
function toIsoOrNull(value) {
    if (!value)
        return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime()))
        return null;
    return d.toISOString();
}
function buildSlaSnapshot(ticket, tracking) {
    if (!tracking)
        return null;
    const now = Date.now();
    const responseTargetMs = tracking.responseTargetAt ? new Date(tracking.responseTargetAt).getTime() : null;
    const resolutionTargetMs = tracking.resolutionTargetAt ? new Date(tracking.resolutionTargetAt).getTime() : null;
    const responseDone = Boolean(tracking.firstRespondedAt);
    const resolutionDone = Boolean(tracking.resolvedAt) || ['Resolved', 'Closed'].includes(String(ticket.status || ''));
    const responseRemainingMs = responseTargetMs === null ? null : responseTargetMs - now;
    const resolutionRemainingMs = resolutionTargetMs === null ? null : resolutionTargetMs - now;
    const responseBreached = !responseDone && responseRemainingMs !== null && responseRemainingMs < 0;
    const resolutionBreached = !resolutionDone && resolutionRemainingMs !== null && resolutionRemainingMs < 0;
    return {
        policyName: tracking.slaName || null,
        priority: normalizePriority(ticket.priority),
        response: {
            targetAt: toIsoOrNull(tracking.responseTargetAt),
            completedAt: toIsoOrNull(tracking.firstRespondedAt),
            breached: responseBreached,
            remainingMs: responseRemainingMs,
            remainingLabel: responseRemainingMs === null ? '--:--' : formatSlaClock(responseRemainingMs),
        },
        resolution: {
            targetAt: toIsoOrNull(tracking.resolutionTargetAt),
            completedAt: toIsoOrNull(tracking.resolvedAt || ticket.resolvedAt),
            breached: resolutionBreached,
            remainingMs: resolutionRemainingMs,
            remainingLabel: resolutionRemainingMs === null ? '--:--' : formatSlaClock(resolutionRemainingMs),
        },
        breached: responseBreached || resolutionBreached,
        state: resolutionDone ? 'resolved' : responseDone ? 'responded' : 'running',
    };
}
async function attachSlaData(items) {
    if (!Array.isArray(items) || items.length === 0)
        return items;
    await ensureSlaTrackingSchema();
    const ids = items.map((t) => Number(t.id)).filter((id) => Number.isFinite(id));
    if (!ids.length)
        return items;
    const rows = await (0, db_1.query)('SELECT * FROM "SlaTracking" WHERE "ticketId" = ANY($1::int[])', [ids]);
    const map = new Map();
    rows.forEach((row) => map.set(Number(row.ticketId), row));
    items.forEach((ticket) => {
        const tracking = map.get(Number(ticket.id));
        const snapshot = buildSlaSnapshot(ticket, tracking);
        ticket.sla = snapshot;
        ticket.slaTimeLeft = snapshot?.resolution?.remainingLabel || '--:--';
    });
    return items;
}
async function ensureAttachmentSchema() {
    if (!attachmentSchemaReady) {
        attachmentSchemaReady = (async () => {
            await (0, db_1.query)('ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER');
            await (0, db_1.query)('ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "contentType" TEXT');
        })();
    }
    await attachmentSchemaReady;
}
function sanitizeFilename(name) {
    return String(name || 'file').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180) || 'file';
}
function decodeBase64Payload(input) {
    const raw = String(input || '');
    const cleaned = raw.includes(',') ? raw.split(',').pop() || '' : raw;
    return Buffer.from(cleaned, 'base64');
}
async function resolveChangedById(user) {
    const parsed = typeof user === 'number' ? user : parseInt(String(user), 10);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return null;
    // Primary path: auth id directly matches "User"."id"
    const direct = await (0, db_1.queryOne)('SELECT "id" FROM "User" WHERE "id" = $1', [parsed]);
    if (direct?.id)
        return direct.id;
    // Fallback path: auth token subject is app_user.user_id; map via email to "User"
    const appUser = await (0, db_1.queryOne)('SELECT email FROM app_user WHERE user_id = $1', [parsed]);
    const email = String(appUser?.email || '').trim().toLowerCase();
    if (!email)
        return null;
    const mapped = await (0, db_1.queryOne)('SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1)', [email]);
    return mapped?.id ?? null;
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
    await attachSlaData(items);
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
    const tracking = await (0, db_1.queryOne)('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [t.id]);
    t.attachments = attachments;
    t.history = history;
    t.sla = buildSlaSnapshot(t, tracking);
    t.slaTimeLeft = t.sla?.resolution?.remainingLabel || '--:--';
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
        await upsertSlaTrackingForTicket(created);
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
    const tracking = await (0, db_1.queryOne)('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [created.id]);
    created.sla = buildSlaSnapshot(created, tracking);
    created.slaTimeLeft = created.sla?.resolution?.remainingLabel || '--:--';
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
    if (['Resolved', 'Closed'].includes(String(toState || ''))) {
        await ensureSlaTrackingSchema();
        await (0, db_1.query)('UPDATE "SlaTracking" SET "resolvedAt" = COALESCE("resolvedAt", NOW()), "status" = $1, "updatedAt" = NOW() WHERE "ticketId" = $2', ['resolved', t.id]);
    }
    const changedById = await resolveChangedById(user);
    await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
        t.id,
        from,
        toState,
        changedById,
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
    const changedById = await resolveChangedById(opts.user);
    const rows = await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *', [
        t.id,
        t.status,
        t.status,
        changedById,
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
async function resolveAttachmentRows(ticketDbId, attachmentIds = []) {
    if (!attachmentIds.length)
        return [];
    const unique = Array.from(new Set(attachmentIds.filter((id) => Number.isFinite(id) && id > 0)));
    if (!unique.length)
        return [];
    const rows = await (0, db_1.query)(`SELECT * FROM "Attachment"
     WHERE "ticketId" = $1
       AND "id" = ANY($2::int[])`, [ticketDbId, unique]);
    if (rows.length !== unique.length) {
        throw { status: 400, message: 'One or more attachments are invalid for this ticket' };
    }
    return rows;
}
function appendAttachmentSummary(text, rows) {
    if (!rows.length)
        return text;
    const names = rows.map((r) => String(r.filename || `Attachment #${r.id}`)).join(', ');
    return `${text}\nAttachments: ${names}`;
}
const addResponse = async (ticketId, opts) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const attachmentRows = await resolveAttachmentRows(t.id, opts.attachmentIds || []);
    const messageWithAttachments = appendAttachmentSummary(opts.message, attachmentRows);
    const changedById = await resolveChangedById(opts.user);
    const rows = await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *', [
        t.id,
        t.status,
        t.status,
        changedById,
        messageWithAttachments,
        false,
    ]);
    const created = rows[0];
    await ensureSlaTrackingSchema();
    await (0, db_1.query)('UPDATE "SlaTracking" SET "firstRespondedAt" = COALESCE("firstRespondedAt", NOW()), "status" = CASE WHEN "status" = \'resolved\' THEN "status" ELSE \'responded\' END, "updatedAt" = NOW() WHERE "ticketId" = $1', [t.id]);
    await (0, logger_1.auditLog)({
        action: 'respond',
        ticketId: t.ticketId,
        user: opts.user,
        meta: { message: opts.message, attachmentIds: attachmentRows.map((a) => a.id) },
    });
    if (opts.sendEmail) {
        let targetEmail = String(opts.to || '').trim();
        if (!targetEmail && t.requesterId) {
            const requester = await (0, db_1.queryOne)('SELECT * FROM "User" WHERE "id" = $1', [t.requesterId]);
            targetEmail = String(requester?.email || '').trim();
        }
        if (!targetEmail) {
            throw { status: 400, message: 'Recipient email is required for sending response' };
        }
        await mailer_service_1.default.sendTicketResponseStrict(targetEmail, t, messageWithAttachments, opts.subject, opts.cc, opts.bcc, attachmentRows.map((a) => ({
            filename: String(a.filename || `attachment-${a.id}`),
            path: String(a.path || ''),
            contentType: String(a.contentType || ''),
        })));
    }
    return created;
};
exports.addResponse = addResponse;
const addPrivateNote = async (ticketId, opts) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    const attachmentRows = await resolveAttachmentRows(t.id, opts.attachmentIds || []);
    const noteWithAttachments = appendAttachmentSummary(opts.note, attachmentRows);
    const changedById = await resolveChangedById(opts.user);
    const rows = await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *', [
        t.id,
        t.status,
        t.status,
        changedById,
        noteWithAttachments,
        true,
    ]);
    const created = rows[0];
    await (0, logger_1.auditLog)({
        action: 'private_note',
        ticketId: t.ticketId,
        user: opts.user,
        meta: { note: opts.note, attachmentIds: attachmentRows.map((a) => a.id) },
    });
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
    await ensureSlaTrackingSchema();
    await (0, db_1.query)('UPDATE "SlaTracking" SET "resolvedAt" = NOW(), "status" = $1, "updatedAt" = NOW() WHERE "ticketId" = $2', ['resolved', t.id]);
    const changedById = await resolveChangedById(opts.user);
    await (0, db_1.query)('INSERT INTO "TicketStatusHistory" ("ticketId", "oldStatus", "newStatus", "changedById", "changedAt") VALUES ($1, $2, $3, $4, NOW())', [
        t.id,
        from,
        'Resolved',
        changedById,
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
const uploadTicketAttachments = async (ticketId, opts) => {
    const t = await getTicketRecord(ticketId);
    if (!t)
        throw { status: 404, message: 'Ticket not found' };
    await ensureAttachmentSchema();
    const files = Array.isArray(opts.files) ? opts.files : [];
    if (!files.length)
        throw { status: 400, message: 'No files selected' };
    const totalDeclared = files.reduce((sum, f) => sum + Number(f?.size || 0), 0);
    if (totalDeclared > MAX_ATTACHMENT_BATCH_BYTES) {
        throw { status: 400, message: 'Total attachment size must be 32MB or less' };
    }
    const changedById = await resolveChangedById(opts.user);
    const ticketDir = path_1.default.join(ATTACHMENT_BASE_DIR, String(t.ticketId || t.id));
    await promises_1.default.mkdir(ticketDir, { recursive: true });
    const saved = [];
    for (const file of files) {
        const declaredSize = Number(file?.size || 0);
        if (declaredSize <= 0)
            throw { status: 400, message: 'Attachment size is invalid' };
        if (declaredSize > MAX_ATTACHMENT_SIZE_BYTES) {
            throw { status: 400, message: `Attachment "${file?.name || 'file'}" exceeds 32MB` };
        }
        const binary = decodeBase64Payload(file.contentBase64);
        if (binary.length !== declaredSize) {
            throw { status: 400, message: `Attachment "${file?.name || 'file'}" is corrupted` };
        }
        const safe = sanitizeFilename(file.name);
        const storedName = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safe}`;
        const fullPath = path_1.default.join(ticketDir, storedName);
        await promises_1.default.writeFile(fullPath, binary);
        const created = await (0, db_1.queryOne)(`INSERT INTO "Attachment" ("filename", "path", "ticketId", "uploadedById", "sizeBytes", "contentType", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`, [safe, fullPath, t.id, changedById, declaredSize, String(file.type || '') || null]);
        if (created)
            saved.push(created);
    }
    if (opts.note && String(opts.note).trim()) {
        await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
            t.id,
            t.status,
            t.status,
            changedById,
            appendAttachmentSummary(String(opts.note).trim(), saved),
            Boolean(opts.internal),
        ]);
    }
    await (0, logger_1.auditLog)({
        action: 'upload_attachments',
        ticketId: t.ticketId,
        user: opts.user,
        meta: { count: saved.length, names: saved.map((s) => s.filename) },
    });
    return {
        items: saved.map((row) => ({
            id: row.id,
            filename: row.filename,
            sizeBytes: row.sizeBytes ?? null,
            contentType: row.contentType ?? null,
            createdAt: row.createdAt,
        })),
    };
};
exports.uploadTicketAttachments = uploadTicketAttachments;
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
    if (payload.priority !== undefined || payload.slaStart !== undefined) {
        await upsertSlaTrackingForTicket(updated, { keepFirstResponse: true, keepResolvedAt: true });
    }
    const changedById = await resolveChangedById(user);
    await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
        t.id,
        t.status,
        updated.status,
        changedById,
        'ticket updated',
        false,
    ]);
    await (0, logger_1.auditLog)({ action: 'update_ticket', ticketId: updated.ticketId, user, meta: { changes: data } });
    const tracking = await (0, db_1.queryOne)('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [updated.id]);
    updated.sla = buildSlaSnapshot(updated, tracking);
    updated.slaTimeLeft = updated.sla?.resolution?.remainingLabel || '--:--';
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
    const changedById = await resolveChangedById(user);
    await (0, db_1.query)('INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
        t.id,
        t.status,
        'Deleted',
        changedById,
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
