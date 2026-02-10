"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaskStatus = exports.listTasksByTicket = exports.createTask = void 0;
const db_1 = require("../../db");
async function createTask(ticketId, name, assignedToId) {
    const rows = await (0, db_1.query)('INSERT INTO "Task" ("ticketId", "name", "assignedToId", "createdAt") VALUES ($1, $2, $3, NOW()) RETURNING *', [ticketId, name, assignedToId || null]);
    return rows[0];
}
exports.createTask = createTask;
async function listTasksByTicket(ticketId) {
    return (0, db_1.query)('SELECT * FROM "Task" WHERE "ticketId" = $1', [ticketId]);
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
