"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listNotifications = void 0;
const db_1 = require("../../db");
async function listNotifications(viewer, opts = {}) {
    const role = String(viewer?.role || 'USER').toUpperCase();
    const limit = Math.min(Math.max(Number(opts.limit || 100), 1), 200);
    const viewerId = Number(viewer?.id);
    const params = [];
    const conditions = [];
    if (role === 'ADMIN') {
        conditions.push('1=1');
    }
    else if (role === 'AGENT') {
        params.push(['ticket', 'asset', 'change', 'problem', 'service', 'supplier', 'sla', 'system']);
        conditions.push(`a."entity" = ANY($${params.length}::text[])`);
    }
    else {
        if (!Number.isFinite(viewerId) || viewerId <= 0)
            return [];
        params.push(viewerId);
        const userParam = `$${params.length}`;
        conditions.push(`(
      (a."entity" = 'ticket' AND (t."requesterId" = ${userParam} OR a."userId" = ${userParam}))
      OR a."userId" = ${userParam}
    )`);
    }
    params.push(limit);
    const rows = await (0, db_1.query)(`SELECT
      a."id",
      a."action",
      a."entity",
      a."entityId",
      a."userId",
      a."meta",
      a."createdAt",
      (a."meta"->>'ticketId') AS "ticketId"
     FROM "AuditLog" a
     LEFT JOIN "Ticket" t ON t."ticketId" = (a."meta"->>'ticketId')
     WHERE ${conditions.join(' AND ')}
     ORDER BY a."createdAt" DESC
     LIMIT $${params.length}`, params);
    return rows;
}
exports.listNotifications = listNotifications;
