"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaskStatus = exports.listTasksByTicket = exports.createTask = void 0;
const db_1 = require("../../db");
async function resolveTicketDbId(ticketRef) {
    const raw = String(ticketRef || '').trim();
    if (!raw)
        throw { status: 400, message: 'ticketId is required' };
    if (/^\d+$/.test(raw)) {
        const row = await (0, db_1.queryOne)('SELECT "id" FROM "Ticket" WHERE "id" = $1', [Number(raw)]);
        if (!row?.id)
            throw { status: 404, message: 'Ticket not found' };
        return row.id;
    }
    const row = await (0, db_1.queryOne)('SELECT "id" FROM "Ticket" WHERE "ticketId" = $1', [raw]);
    if (!row?.id)
        throw { status: 404, message: 'Ticket not found' };
    return row.id;
}
async function createTask(ticketId, name, assignedToId) {
    const ticketDbId = await resolveTicketDbId(ticketId);
    const rows = await (0, db_1.query)('INSERT INTO "Task" ("ticketId", "name", "assignedToId", "createdAt") VALUES ($1, $2, $3, NOW()) RETURNING *', [ticketDbId, name, assignedToId || null]);
    return rows[0];
}
exports.createTask = createTask;
async function listTasksByTicket(ticketId) {
    const ticketDbId = await resolveTicketDbId(ticketId);
    return (0, db_1.query)('SELECT * FROM "Task" WHERE "ticketId" = $1', [ticketDbId]);
}
exports.listTasksByTicket = listTasksByTicket;
async function updateTaskStatus(taskId, status) {
    const setParts = ['"status" = $1'];
    const params = [status];
    if (status === 'completed') {
        setParts.push('"completedAt" = NOW()');
    }
    params.push(taskId);
    const rows = await (0, db_1.query)(`UPDATE "Task" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
    return rows[0] ?? null;
}
exports.updateTaskStatus = updateTaskStatus;
