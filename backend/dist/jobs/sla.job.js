"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSlaChecks = void 0;
const ticket_service_1 = require("../modules/tickets/ticket.service");
const sla_engine_1 = require("../modules/sla/sla.engine");
async function runSlaChecks() {
    try {
        const res = await (0, ticket_service_1.getTickets)({ page: 1, pageSize: 1000 });
        const tickets = Array.isArray(res.items) ? res.items : [];
        tickets.forEach(async (t) => {
            const r = (0, sla_engine_1.checkSla)(t);
            if (r.status === 'breached') {
                console.warn(`SLA breached for ${t.ticketId || t.id}`);
                // simple automation: if ticket is New, move to In Progress for triage
                try {
                    if (t.status === 'New') {
                        await (0, ticket_service_1.transitionTicket)(t.ticketId || t.id, 'In Progress', 'system');
                        console.info(`Auto-transitioned ${t.ticketId || t.id} to In Progress due to SLA breach`);
                    }
                }
                catch (e) {
                    console.warn('Failed to auto-transition ticket on SLA breach', e);
                }
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
