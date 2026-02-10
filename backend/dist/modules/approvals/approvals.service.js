"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setApprovalStatus = exports.listApprovalsByTicket = exports.createApproval = void 0;
const db_1 = require("../../db");
async function createApproval(ticketId, approverId) {
    const rows = await (0, db_1.query)('INSERT INTO "Approval" ("ticketId", "approverId", "createdAt") VALUES ($1, $2, NOW()) RETURNING *', [ticketId, approverId || null]);
    return rows[0];
}
exports.createApproval = createApproval;
async function listApprovalsByTicket(ticketId) {
    return (0, db_1.query)('SELECT * FROM "Approval" WHERE "ticketId" = $1', [ticketId]);
}
exports.listApprovalsByTicket = listApprovalsByTicket;
async function setApprovalStatus(approvalId, status, approverId, comment) {
    const setParts = ['"status" = $1'];
    const params = [status];
    if (approverId !== undefined) {
        params.push(approverId);
        setParts.push(`"approverId" = $${params.length}`);
    }
    if (comment !== undefined) {
        params.push(comment);
        setParts.push(`"comment" = $${params.length}`);
    }
    if (status === 'approved') {
        setParts.push('"approvedAt" = NOW()');
    }
    params.push(approvalId);
    const rows = await (0, db_1.query)(`UPDATE "Approval" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING *`, params);
    return rows[0] ?? null;
}
exports.setApprovalStatus = setApprovalStatus;
