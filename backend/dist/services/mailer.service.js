"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mail_integration_1 = require("./mail.integration");
async function safeSend(to, subject, text) {
    try {
        await (0, mail_integration_1.sendSmtpMail)({ to, subject, text });
    }
    catch (error) {
        console.warn('[MAILER] Failed to send email', { to, subject, error: error?.message || error });
    }
}
async function strictSend(to, subject, text) {
    await (0, mail_integration_1.sendSmtpMail)({ to, subject, text });
}
exports.default = {
    async sendTicketCreated(email, ticket) {
        const subject = `[ITSM] Ticket created: ${ticket?.ticketId || ticket?.id || ''}`.trim();
        const text = [
            'Your ticket has been created.',
            `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
            `Subject: ${ticket?.subject || '-'}`,
            `Status: ${ticket?.status || 'New'}`,
        ].join('\n');
        await safeSend(email, subject, text);
    },
    async sendStatusUpdated(email, ticket) {
        const subject = `[ITSM] Ticket status updated: ${ticket?.ticketId || ticket?.id || ''}`.trim();
        const text = [
            'A ticket status has been updated.',
            `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
            `Subject: ${ticket?.subject || '-'}`,
            `Status: ${ticket?.status || '-'}`,
        ].join('\n');
        await safeSend(email, subject, text);
    },
    async sendTicketResponse(email, ticket, message) {
        const subject = `[ITSM] New response: ${ticket?.ticketId || ticket?.id || ''}`.trim();
        const text = [
            'A new response was added to your ticket.',
            `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
            `Message: ${message || '-'}`,
        ].join('\n');
        await safeSend(email, subject, text);
    },
    async sendTicketResponseStrict(email, ticket, message, subjectOverride, cc, bcc) {
        const subject = String(subjectOverride || `[ITSM] New response: ${ticket?.ticketId || ticket?.id || ''}`).trim();
        const text = [
            'A new response was added to your ticket.',
            `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
            `Message: ${message || '-'}`,
        ].join('\n');
        await (0, mail_integration_1.sendSmtpMail)({ to: email, cc, bcc, subject, text });
    },
    async sendTicketResolved(email, ticket) {
        const subject = `[ITSM] Ticket resolved: ${ticket?.ticketId || ticket?.id || ''}`.trim();
        const text = [
            'Your ticket has been resolved.',
            `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
            `Resolution: ${ticket?.resolution || '-'}`,
        ].join('\n');
        await safeSend(email, subject, text);
    },
};
