"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSla = void 0;
// Very small SLA engine: calculates breach when now > slaDue
function checkSla(ticket) {
    if (!ticket.slaDue)
        return { status: 'no-sla' };
    const due = new Date(ticket.slaDue).getTime();
    const now = Date.now();
    if (now > due)
        return { status: 'breached', byMs: now - due };
    const remaining = due - now;
    return { status: 'ok', remainingMs: remaining };
}
exports.checkSla = checkSla;
