"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTicketResolved = exports.sendTicketResponse = exports.sendSLABreach = exports.sendStatusUpdated = exports.sendAssignmentChanged = exports.sendTicketCreated = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const host = process.env.SMTP_HOST;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const transporter = nodemailer_1.default.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
});
async function sendMail(to, subject, html) {
    if (!host) {
        console.warn('SMTP not configured - skipping email to', to);
        return;
    }
    await transporter.sendMail({
        to,
        subject,
        html,
        from: process.env.SMTP_FROM || user,
    });
}
async function sendTicketCreated(to, ticket) {
    const html = `<h3>New Ticket Created: ${ticket.ticketId}</h3><p>Type: ${ticket.type}</p><p>Priority: ${ticket.priority}</p><p>${ticket.description || ''}</p>`;
    await sendMail(to, `Ticket ${ticket.ticketId} created`, html);
}
exports.sendTicketCreated = sendTicketCreated;
async function sendAssignmentChanged(to, ticket) {
    const html = `<h3>Ticket Assigned: ${ticket.ticketId}</h3><p>Assigned to: ${ticket.assignee?.email || 'N/A'}</p>`;
    await sendMail(to, `Ticket ${ticket.ticketId} assigned`, html);
}
exports.sendAssignmentChanged = sendAssignmentChanged;
async function sendStatusUpdated(to, ticket) {
    const html = `<h3>Ticket ${ticket.ticketId} - Status Updated</h3><p>New status: ${ticket.status}</p>`;
    await sendMail(to, `Ticket ${ticket.ticketId} status updated`, html);
}
exports.sendStatusUpdated = sendStatusUpdated;
async function sendSLABreach(to, ticket) {
    const html = `<h3>SLA Breach Alert: ${ticket.ticketId}</h3><p>Please review the ticket.</p>`;
    await sendMail(to, `SLA Breach: ${ticket.ticketId}`, html);
}
exports.sendSLABreach = sendSLABreach;
async function sendTicketResponse(to, ticket, message) {
    const html = `<h3>Update on Ticket ${ticket.ticketId}</h3><p>${message}</p>`;
    await sendMail(to, `Update: ${ticket.ticketId}`, html);
}
exports.sendTicketResponse = sendTicketResponse;
async function sendTicketResolved(to, ticket) {
    const html = `<h3>Ticket ${ticket.ticketId} Resolved</h3><p>Resolution: ${ticket.resolution || ''}</p>`;
    await sendMail(to, `Resolved: ${ticket.ticketId}`, html);
}
exports.sendTicketResolved = sendTicketResolved;
exports.default = { sendTicketCreated, sendAssignmentChanged, sendStatusUpdated, sendSLABreach, sendTicketResponse, sendTicketResolved };
