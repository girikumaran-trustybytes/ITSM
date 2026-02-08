"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startSlaWorker = void 0;
const client_1 = __importDefault(require("../prisma/client"));
const notification_service_1 = require("../services/notification.service");
const POLL_INTERVAL = Number(process.env.SLA_POLL_MS || 30000);
async function checkSla() {
    const running = await client_1.default.slaTracking.findMany({ where: { status: 'running' } });
    for (const s of running) {
        if (s.breachTime && new Date(s.breachTime) <= new Date()) {
            // mark breach and notify
            await client_1.default.slaTracking.update({ where: { id: s.id }, data: { status: 'breached' } });
            // create history entry on ticket
            await client_1.default.ticketStatusHistory.create({ data: { ticketId: s.ticketId, oldStatus: 'open', newStatus: 'sla_breached', changedAt: new Date() } });
            // notify via templates (configurable in real app)
            await (0, notification_service_1.sendEmail)('ops@example.com', `SLA breach: ${s.slaName}`, 'sla_breach.html', { ticketId: s.ticketId, slaName: s.slaName, breachTime: s.breachTime, appUrl: process.env.APP_URL || 'http://localhost:3000' });
        }
    }
}
function startSlaWorker() {
    setInterval(() => { checkSla().catch(console.error); }, POLL_INTERVAL);
    console.info('[SLA Worker] started, interval', POLL_INTERVAL);
}
exports.startSlaWorker = startSlaWorker;
