"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSlaChecks = void 0;
const ticket_service_1 = require("../modules/tickets/ticket.service");
const sla_engine_1 = require("../modules/sla/sla.engine");
async function runSlaChecks() {
    try {
        const res = await (0, ticket_service_1.getTickets)({ page: 1, pageSize: 1000 });
        const tickets = Array.isArray(res.items) ? res.items : [];
        tickets.forEach((t) => {
            const r = (0, sla_engine_1.checkSla)(t);
            if (r.status === 'breached') {
                console.warn(`SLA breached for ${t.ticketId || t.id}`);
                // In production enqueue escalation job/notification
            }
        });
    }
    catch (e) {
        console.error('SLA job failed', e);
    }
}
exports.runSlaChecks = runSlaChecks;
// run every minute for demo (in production use a proper scheduler)
setInterval(() => {
    runSlaChecks().catch(() => { });
}, 60000);
