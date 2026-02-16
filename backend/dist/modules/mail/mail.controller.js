"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTestMail = exports.testImap = exports.testSmtp = exports.getConfig = void 0;
const mail_integration_1 = require("../../services/mail.integration");
function pickOverride(body) {
    if (!body || typeof body !== 'object')
        return undefined;
    const smtp = body.smtp && typeof body.smtp === 'object'
        ? {
            host: body.smtp.host,
            port: body.smtp.port,
            secure: body.smtp.secure,
            user: body.smtp.user,
            pass: body.smtp.pass,
            from: body.smtp.from,
        }
        : undefined;
    const imap = body.imap && typeof body.imap === 'object'
        ? {
            host: body.imap.host,
            port: body.imap.port,
            secure: body.imap.secure,
            user: body.imap.user,
            pass: body.imap.pass,
            mailbox: body.imap.mailbox,
        }
        : undefined;
    const provider = body.provider;
    if (!smtp && !imap && !provider)
        return undefined;
    return { provider, smtp, imap };
}
async function getConfig(_req, res) {
    return res.json((0, mail_integration_1.getPublicMailConfig)());
}
exports.getConfig = getConfig;
async function testSmtp(req, res) {
    try {
        const result = await (0, mail_integration_1.verifySmtp)(pickOverride(req.body));
        return res.json(result);
    }
    catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'SMTP test failed' });
    }
}
exports.testSmtp = testSmtp;
async function testImap(req, res) {
    try {
        const result = await (0, mail_integration_1.verifyImap)(pickOverride(req.body));
        return res.json(result);
    }
    catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'IMAP test failed' });
    }
}
exports.testImap = testImap;
async function sendTestMail(req, res) {
    try {
        const to = req.body?.to;
        const subject = req.body?.subject || 'ITSM Mail Integration Test';
        const text = req.body?.text || 'SMTP integration test email from ITSM backend.';
        const html = req.body?.html;
        const from = req.body?.from;
        const result = await (0, mail_integration_1.sendSmtpMail)({ to, subject, text, html, from }, pickOverride(req.body));
        return res.json(result);
    }
    catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'Failed to send test mail' });
    }
}
exports.sendTestMail = sendTestMail;
