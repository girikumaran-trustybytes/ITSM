"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuditByTicketId = exports.auditLog = void 0;
const winston_1 = __importDefault(require("winston"));
const db_1 = require("../../db");
const logger = winston_1.default.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston_1.default.format.combine(winston_1.default.format.timestamp(), winston_1.default.format.json()),
    transports: [
        new winston_1.default.transports.Console(),
        new winston_1.default.transports.File({ filename: 'logs/app.log' }),
    ],
});
const AUDIT_STORE = [];
async function auditLog(entry) {
    // persist to in-memory store for quick lookup + structured logger
    AUDIT_STORE.push(entry);
    logger.info('audit', { ...entry });
    try {
        const userId = typeof entry.user === 'number' ? entry.user : parseInt(String(entry.user)) || undefined;
        await (0, db_1.query)('INSERT INTO "AuditLog" ("action", "entity", "entityId", "userId", "assetId", "meta", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())', [
            entry.action,
            entry.entity || (entry.ticketId ? 'ticket' : 'system'),
            entry.entityId ?? null,
            userId ?? null,
            entry.assetId ?? null,
            { ...entry.meta, ticketId: entry.ticketId, from: entry.from, to: entry.to },
        ]);
    }
    catch (err) {
        // avoid breaking primary flow if audit storage fails
        logger.warn('audit_store_failed', { error: err?.message || String(err) });
    }
}
exports.auditLog = auditLog;
function getAuditByTicketId(ticketId) {
    return AUDIT_STORE.filter(a => a.ticketId === ticketId);
}
exports.getAuditByTicketId = getAuditByTicketId;
exports.default = logger;
