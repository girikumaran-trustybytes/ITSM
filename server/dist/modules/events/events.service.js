"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listEvents = void 0;
const db_1 = require("../../db");
async function listEvents(opts = {}) {
    const sinceId = Number(opts.sinceId || 0);
    const limit = Math.max(1, Math.min(500, Number(opts.limit || 100)));
    return (0, db_1.query)(`SELECT id, event_type, entity_name, entity_id, operation, business_key, payload, created_at
     FROM app_event_outbox
     WHERE id > $1
     ORDER BY id ASC
     LIMIT $2`, [sinceId, limit]);
}
exports.listEvents = listEvents;
