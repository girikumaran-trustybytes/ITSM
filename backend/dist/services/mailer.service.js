"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Stub mailer service - implement actual email sending as needed
exports.default = {
    async sendTicketCreated(email, ticket) {
        console.log(`[MAILER STUB] Ticket created email would be sent to ${email}`);
    },
    async sendStatusUpdated(email, ticket) {
        console.log(`[MAILER STUB] Status updated email would be sent to ${email}`);
    },
    async sendTicketResponse(email, ticket, message) {
        console.log(`[MAILER STUB] Ticket response email would be sent to ${email}`);
    },
    async sendTicketResolved(email, ticket) {
        console.log(`[MAILER STUB] Ticket resolved email would be sent to ${email}`);
    },
};
