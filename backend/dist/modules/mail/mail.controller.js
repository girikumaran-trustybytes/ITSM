"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateConfig = exports.updateInboundRouting = exports.sendTestMail = exports.testImap = exports.testSmtp = exports.getConfig = void 0;
const mail_integration_1 = require("../../services/mail.integration");
const db_1 = require("../../db");
async function ensureSystemSettingsTable() {
    await (0, db_1.query)(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}
async function loadStoredMailSettings() {
    await ensureSystemSettingsTable();
    const rows = await (0, db_1.query)('SELECT value FROM system_settings WHERE key = $1', ['mail.settings']);
    const stored = rows[0]?.value;
    return stored && typeof stored === 'object' ? stored : null;
}
function normalizeStoredMailSettings(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const smtp = raw.smtp && typeof raw.smtp === 'object' ? raw.smtp : {};
    const imap = raw.imap && typeof raw.imap === 'object' ? raw.imap : {};
    const inbound = raw.inbound && typeof raw.inbound === 'object' ? raw.inbound : {};
    const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
    const inboundRoutes = Array.isArray(inbound.inboundRoutes)
        ? inbound.inboundRoutes
            .map((row) => ({
            email: String(row?.email || '').trim().toLowerCase(),
            queue: String(row?.queue || '').trim(),
        }))
            .filter((row) => row.email && row.queue)
        : undefined;
    const outboundRoutes = Array.isArray(inbound.outboundRoutes)
        ? inbound.outboundRoutes
            .map((row) => ({
            queue: String(row?.queue || '').trim(),
            from: String(row?.from || '').trim().toLowerCase(),
        }))
            .filter((row) => row.queue && row.from)
        : undefined;
    return {
        provider: raw.provider,
        smtp: {
            host: String(smtp.host || '').trim(),
            port: smtp.port ?? undefined,
            secure: Boolean(smtp.secure),
            user: String(smtp.user || '').trim(),
            pass: String(smtp.pass || '').trim(),
            from: String(smtp.from || '').trim(),
        },
        imap: {
            host: String(imap.host || '').trim(),
            port: imap.port ?? undefined,
            secure: Boolean(imap.secure),
            user: String(imap.user || '').trim(),
            pass: String(imap.pass || '').trim(),
            mailbox: String(imap.mailbox || '').trim(),
        },
        inbound: {
            defaultQueue: String(inbound.defaultQueue || '').trim(),
            inboundRoutes,
            outboundRoutes,
        },
        settings,
    };
}
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
    try {
        const stored = await loadStoredMailSettings();
        if (stored) {
            const normalized = normalizeStoredMailSettings(stored);
            const override = {};
            if (normalized.provider)
                override.provider = normalized.provider;
            if (normalized.smtp)
                override.smtp = normalized.smtp;
            if (normalized.imap)
                override.imap = normalized.imap;
            if (Object.keys(override).length) {
                (0, mail_integration_1.setMailConfigOverride)(override);
            }
            if (normalized.inbound?.defaultQueue) {
                (0, mail_integration_1.setInboundRoutingConfig)(normalized.inbound);
            }
            const cfg = (0, mail_integration_1.getPublicMailConfig)();
            return res.json({ ...cfg, settings: normalized.settings || {} });
        }
        return res.json((0, mail_integration_1.getPublicMailConfig)());
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to load mail configuration' });
    }
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
async function updateInboundRouting(req, res) {
    try {
        const defaultQueue = String(req.body?.defaultQueue || '').trim();
        if (!defaultQueue)
            return res.status(400).json({ error: 'defaultQueue is required' });
        const inboundRoutes = Array.isArray(req.body?.inboundRoutes)
            ? req.body.inboundRoutes.map((row) => ({
                email: String(row?.email || '').trim().toLowerCase(),
                queue: String(row?.queue || '').trim(),
            }))
            : undefined;
        const outboundRoutes = Array.isArray(req.body?.outboundRoutes)
            ? req.body.outboundRoutes.map((row) => ({
                queue: String(row?.queue || '').trim(),
                from: String(row?.from || '').trim().toLowerCase(),
            }))
            : undefined;
        const next = (0, mail_integration_1.setInboundRoutingConfig)({ defaultQueue, inboundRoutes, outboundRoutes });
        const stored = await loadStoredMailSettings();
        const normalized = normalizeStoredMailSettings(stored || {});
        normalized.inbound = next;
        await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['mail.settings', normalized]);
        return res.json(next);
    }
    catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'Failed to update inbound routing' });
    }
}
exports.updateInboundRouting = updateInboundRouting;
async function updateConfig(req, res) {
    try {
        const incoming = normalizeStoredMailSettings(req.body || {});
        const override = {};
        if (incoming.provider)
            override.provider = incoming.provider;
        if (incoming.smtp)
            override.smtp = incoming.smtp;
        if (incoming.imap)
            override.imap = incoming.imap;
        if (Object.keys(override).length) {
            (0, mail_integration_1.setMailConfigOverride)(override);
        }
        if (incoming.inbound?.defaultQueue) {
            (0, mail_integration_1.setInboundRoutingConfig)(incoming.inbound);
        }
        await ensureSystemSettingsTable();
        await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['mail.settings', incoming]);
        const cfg = (0, mail_integration_1.getPublicMailConfig)();
        return res.json({ ...cfg, settings: incoming.settings || {} });
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to update mail configuration' });
    }
}
exports.updateConfig = updateConfig;
