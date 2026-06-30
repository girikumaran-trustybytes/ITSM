"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyImap = exports.sendSmtpMail = exports.verifySmtp = exports.resolveOutboundFromForQueue = exports.resolveInboundQueueByRecipient = exports.setInboundRoutingConfig = exports.resolveMailboxForQueue = exports.getMailboxConfigs = exports.setMailboxConfigs = exports.getInboundRoutingConfig = exports.getPublicMailConfig = exports.loadMailConfigFromEnv = exports.getMailConfigOverride = exports.setMailConfigOverride = void 0;
const net_1 = __importDefault(require("net"));
const tls_1 = __importDefault(require("tls"));
const nodemailer_1 = __importDefault(require("nodemailer"));
function htmlEscape(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function toHtmlFromText(text) {
    const normalized = String(text || '').trim();
    if (!normalized)
        return '<p style="margin:0 0 16px 0;">(No content)</p>';
    const blocks = normalized
        .split(/\r?\n\r?\n+/)
        .map((part) => part.trim())
        .filter(Boolean);
    if (blocks.length === 0)
        return '<p style="margin:0 0 16px 0;">(No content)</p>';
    return blocks
        .map((part) => `<p style="margin:0 0 16px 0;">${htmlEscape(part).replace(/\r?\n/g, '<br/>')}</p>`)
        .join('');
}
function applyGlobalMailTemplate(contentHtml) {
    const bodyHtml = String(contentHtml || '').trim() || '<p style="margin:0 0 16px 0;">(No content)</p>';
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Notification</title>
  </head>
  <body style="margin:0;padding:16px 18px;color:#111827;font-family:Arial,'Helvetica Neue',Helvetica,sans-serif;text-align:left;line-height:1.7;font-size:15px;background:#ffffff;">
    ${bodyHtml}
  </body>
</html>`;
}
function inlineDataImagesAsCid(html) {
    const source = String(html || '');
    if (!source)
        return { html: source, attachments: [] };
    const attachments = [];
    const cache = new Map();
    let counter = 0;
    const transformed = source.replace(/(src\s*=\s*["'])(data:image\/([a-z0-9.+-]+);base64,([^"']+))(["'])/gi, (_match, prefix, dataUrl, subtype, b64Body, suffix) => {
        const key = String(dataUrl || '');
        if (cache.has(key)) {
            return `${prefix}cid:${cache.get(key)}${suffix}`;
        }
        const normalizedBase64 = String(b64Body || '').replace(/\s+/g, '');
        let content;
        try {
            content = Buffer.from(normalizedBase64, 'base64');
        }
        catch {
            return `${prefix}${dataUrl}${suffix}`;
        }
        if (!content.length)
            return `${prefix}${dataUrl}${suffix}`;
        const safeSubtype = String(subtype || 'png').toLowerCase().replace(/[^a-z0-9.+-]/g, '') || 'png';
        const cid = `inline-image-${Date.now()}-${counter}@itsm`;
        counter += 1;
        cache.set(key, cid);
        attachments.push({
            filename: `inline-${counter}.${safeSubtype.replace('+xml', '')}`,
            content,
            contentType: `image/${safeSubtype}`,
            cid,
            disposition: 'inline',
        });
        return `${prefix}cid:${cid}${suffix}`;
    });
    return { html: transformed, attachments };
}
const MAIL_PROVIDER_PRESETS = {
    gmail: {
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
    },
    'google-workspace': {
        smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
        imap: { host: 'imap.gmail.com', port: 993, secure: true },
    },
    zoho: {
        smtp: { host: 'smtp.zoho.com', port: 465, secure: true },
        imap: { host: 'imap.zoho.com', port: 993, secure: true },
    },
    'microsoft-workspace': {
        smtp: { host: 'smtp.office365.com', port: 587, secure: false },
        imap: { host: 'outlook.office365.com', port: 993, secure: true },
    },
    outlook: {
        smtp: { host: 'smtp-mail.outlook.com', port: 587, secure: false },
        imap: { host: 'outlook.office365.com', port: 993, secure: true },
    },
    custom: {
        smtp: { host: '', port: 465, secure: true },
        imap: { host: '', port: 993, secure: true },
    },
};
// Seeded defaults requested by deployment owner; env vars still override these.
const SEEDED_SMTP_USER = 'support.techdesk@gmail.com';
const SEEDED_SMTP_PASS = 'heqcvxfsxcicftpj';
const SMTP_CONNECTION_TIMEOUT_MS = Math.max(3000, toInt(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10000));
const SMTP_GREETING_TIMEOUT_MS = Math.max(3000, toInt(process.env.SMTP_GREETING_TIMEOUT_MS, 10000));
const SMTP_SOCKET_TIMEOUT_MS = Math.max(5000, toInt(process.env.SMTP_SOCKET_TIMEOUT_MS, 20000));
const SMTP_SEND_RETRY_ATTEMPTS = Math.max(0, toInt(process.env.SMTP_SEND_RETRY_ATTEMPTS, 1));
const SMTP_SEND_RETRY_DELAY_MS = Math.max(250, toInt(process.env.SMTP_SEND_RETRY_DELAY_MS, 800));
const DEFAULT_INBOUND_QUEUE = String(process.env.MAIL_TICKET_DEFAULT_QUEUE || 'Support Team').trim() || 'Support Team';
const DEFAULT_BASE_MAIL = String(process.env.APPLICATION_BASE_MAIL
    || process.env.APP_BASE_MAIL
    || process.env.SMTP_FROM
    || process.env.SMTP_USER
    || SEEDED_SMTP_USER).trim();
const DEFAULT_SUPPORT_EMAIL = String(process.env.MAIL_TICKET_INGEST_ADDRESS
    || process.env.IMAP_USER
    || DEFAULT_BASE_MAIL).trim().toLowerCase();
let runtimeInboundRoutingConfig = {
    defaultQueue: DEFAULT_INBOUND_QUEUE,
    inboundRoutes: [
        { email: DEFAULT_SUPPORT_EMAIL, queue: 'Support Team' },
        { email: DEFAULT_SUPPORT_EMAIL, queue: 'HR Team' },
        { email: DEFAULT_SUPPORT_EMAIL, queue: 'Management Team' },
    ],
    outboundRoutes: [
        { queue: 'Support Team', from: DEFAULT_SUPPORT_EMAIL },
        { queue: 'HR Team', from: DEFAULT_SUPPORT_EMAIL },
        { queue: 'Management Team', from: DEFAULT_SUPPORT_EMAIL },
    ],
};
let runtimeMailboxConfigs = [];
function normalizeMailProvider(value) {
    const providerRaw = String(value || '').trim().toLowerCase();
    if (providerRaw === 'google-workspace')
        return 'google-workspace';
    if (providerRaw === 'zoho')
        return 'zoho';
    if (providerRaw === 'microsoft-workspace' || providerRaw === 'ms-workspace' || providerRaw === 'office365' || providerRaw === 'microsoft-365')
        return 'microsoft-workspace';
    if (providerRaw === 'outlook')
        return 'outlook';
    if (providerRaw === 'custom')
        return 'custom';
    return 'gmail';
}
function toBool(value, fallback) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
function toInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(1, Math.floor(n));
}
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function loadMailConfigBase() {
    const provider = normalizeMailProvider(process.env.MAIL_PROVIDER || 'gmail');
    const preset = MAIL_PROVIDER_PRESETS[provider];
    return {
        provider,
        smtp: {
            host: String(process.env.SMTP_HOST || preset.smtp.host).trim(),
            port: toInt(process.env.SMTP_PORT, preset.smtp.port),
            secure: toBool(process.env.SMTP_SECURE, preset.smtp.secure),
            user: String(process.env.SMTP_USER || SEEDED_SMTP_USER).trim(),
            pass: String(process.env.SMTP_PASS || SEEDED_SMTP_PASS).trim(),
            from: String(process.env.SMTP_FROM || process.env.SMTP_USER || DEFAULT_BASE_MAIL).trim(),
        },
        imap: {
            host: String(process.env.IMAP_HOST || preset.imap.host).trim(),
            port: toInt(process.env.IMAP_PORT, preset.imap.port),
            secure: toBool(process.env.IMAP_SECURE, preset.imap.secure),
            user: String(process.env.IMAP_USER || process.env.SMTP_USER || SEEDED_SMTP_USER).trim(),
            pass: String(process.env.IMAP_PASS || process.env.SMTP_PASS || SEEDED_SMTP_PASS).trim(),
            mailbox: String(process.env.IMAP_MAILBOX || 'INBOX').trim() || 'INBOX',
        },
    };
}
let runtimeMailConfigOverride = null;
function setMailConfigOverride(next) {
    runtimeMailConfigOverride = next && Object.keys(next).length ? next : null;
}
exports.setMailConfigOverride = setMailConfigOverride;
function getMailConfigOverride() {
    return runtimeMailConfigOverride;
}
exports.getMailConfigOverride = getMailConfigOverride;
function loadMailConfigFromEnv() {
    return mergeConfig(runtimeMailConfigOverride ?? undefined);
}
exports.loadMailConfigFromEnv = loadMailConfigFromEnv;
function getPublicMailConfig() {
    const cfg = loadMailConfigFromEnv();
    return {
        provider: cfg.provider,
        smtp: {
            host: cfg.smtp.host,
            port: cfg.smtp.port,
            secure: cfg.smtp.secure,
            user: cfg.smtp.user,
            from: cfg.smtp.from,
            hasPassword: Boolean(cfg.smtp.pass),
        },
        imap: {
            host: cfg.imap.host,
            port: cfg.imap.port,
            secure: cfg.imap.secure,
            user: cfg.imap.user,
            mailbox: cfg.imap.mailbox,
            hasPassword: Boolean(cfg.imap.pass),
        },
        inbound: {
            defaultQueue: runtimeInboundRoutingConfig.defaultQueue,
            inboundRoutes: runtimeInboundRoutingConfig.inboundRoutes,
            outboundRoutes: runtimeInboundRoutingConfig.outboundRoutes,
        },
    };
}
exports.getPublicMailConfig = getPublicMailConfig;
function getInboundRoutingConfig() {
    return {
        defaultQueue: runtimeInboundRoutingConfig.defaultQueue,
        inboundRoutes: [...runtimeInboundRoutingConfig.inboundRoutes],
        outboundRoutes: [...runtimeInboundRoutingConfig.outboundRoutes],
    };
}
exports.getInboundRoutingConfig = getInboundRoutingConfig;
function setMailboxConfigs(next) {
    runtimeMailboxConfigs = Array.isArray(next) ? next : [];
}
exports.setMailboxConfigs = setMailboxConfigs;
function getMailboxConfigs() {
    return runtimeMailboxConfigs.slice();
}
exports.getMailboxConfigs = getMailboxConfigs;
function resolveMailboxForQueue(queueName) {
    const queue = String(queueName || '').trim().toLowerCase();
    if (!runtimeMailboxConfigs.length)
        return null;
    if (queue) {
        const match = runtimeMailboxConfigs.find((mb) => String(mb.queue || '').trim().toLowerCase() === queue);
        if (match)
            return match;
    }
    const support = runtimeMailboxConfigs.find((mb) => String(mb.queue || '').trim().toLowerCase() === 'support team');
    return support || runtimeMailboxConfigs[0] || null;
}
exports.resolveMailboxForQueue = resolveMailboxForQueue;
function setInboundRoutingConfig(next) {
    const normalizedQueue = String(next?.defaultQueue || '').trim();
    const inboundRoutes = Array.isArray(next?.inboundRoutes)
        ? next.inboundRoutes
            .map((row) => ({
            email: String(row?.email || '').trim().toLowerCase(),
            queue: String(row?.queue || '').trim(),
        }))
            .filter((row) => row.email && row.queue)
        : runtimeInboundRoutingConfig.inboundRoutes;
    const outboundRoutes = Array.isArray(next?.outboundRoutes)
        ? next.outboundRoutes
            .map((row) => ({
            queue: String(row?.queue || '').trim(),
            from: String(row?.from || '').trim().toLowerCase(),
        }))
            .filter((row) => row.queue && row.from)
        : runtimeInboundRoutingConfig.outboundRoutes;
    runtimeInboundRoutingConfig = {
        defaultQueue: normalizedQueue || runtimeInboundRoutingConfig.defaultQueue || DEFAULT_INBOUND_QUEUE,
        inboundRoutes,
        outboundRoutes,
    };
    return getInboundRoutingConfig();
}
exports.setInboundRoutingConfig = setInboundRoutingConfig;
function resolveInboundQueueByRecipient(toRaw, fallbackQueue) {
    const explicitDefault = String(fallbackQueue || '').trim();
    if (explicitDefault)
        return explicitDefault;
    const target = String(toRaw || '').toLowerCase();
    const matched = runtimeInboundRoutingConfig.inboundRoutes.find((route) => {
        const email = String(route.email || '').trim().toLowerCase();
        return email && target.includes(email);
    });
    if (matched?.queue)
        return matched.queue;
    return String(runtimeInboundRoutingConfig.defaultQueue || DEFAULT_INBOUND_QUEUE).trim() || DEFAULT_INBOUND_QUEUE;
}
exports.resolveInboundQueueByRecipient = resolveInboundQueueByRecipient;
function resolveOutboundFromForQueue(queueName) {
    const queue = String(queueName || '').trim().toLowerCase();
    if (!queue)
        return '';
    const matched = runtimeInboundRoutingConfig.outboundRoutes.find((route) => String(route.queue || '').trim().toLowerCase() === queue);
    return String(matched?.from || '').trim();
}
exports.resolveOutboundFromForQueue = resolveOutboundFromForQueue;
function mergeConfig(override) {
    const base = loadMailConfigBase();
    const provider = normalizeMailProvider(override?.provider || base.provider);
    const preset = MAIL_PROVIDER_PRESETS[provider];
    const normalizeSmtpSecure = (port, secure) => {
        if (port === 465)
            return true;
        if (port === 587 || port === 25)
            return false;
        return secure;
    };
    const normalizeImapSecure = (port, secure) => {
        if (port === 993)
            return true;
        if (port === 143)
            return false;
        return secure;
    };
    const smtpPort = toInt(override?.smtp?.port, base.smtp.port || preset.smtp.port);
    const imapPort = toInt(override?.imap?.port, base.imap.port || preset.imap.port);
    const rawSmtpSecure = toBool(override?.smtp?.secure, base.smtp.secure ?? preset.smtp.secure);
    const rawImapSecure = toBool(override?.imap?.secure, base.imap.secure ?? preset.imap.secure);
    return {
        provider,
        smtp: {
            host: String(override?.smtp?.host || base.smtp.host || preset.smtp.host).trim(),
            port: smtpPort,
            secure: normalizeSmtpSecure(smtpPort, rawSmtpSecure),
            user: String(override?.smtp?.user || base.smtp.user || '').trim(),
            pass: String(override?.smtp?.pass || base.smtp.pass || '').trim(),
            from: String(override?.smtp?.from || base.smtp.from || base.smtp.user || DEFAULT_BASE_MAIL).trim(),
        },
        imap: {
            host: String(override?.imap?.host || base.imap.host || preset.imap.host).trim(),
            port: imapPort,
            secure: normalizeImapSecure(imapPort, rawImapSecure),
            user: String(override?.imap?.user || base.imap.user || base.smtp.user || '').trim(),
            pass: String(override?.imap?.pass || base.imap.pass || base.smtp.pass || '').trim(),
            mailbox: String(override?.imap?.mailbox || base.imap.mailbox || 'INBOX').trim() || 'INBOX',
        },
    };
}
function assertSmtpConfigured(cfg) {
    if (!cfg.host)
        throw { status: 400, message: 'SMTP host is required' };
    if (!cfg.port)
        throw { status: 400, message: 'SMTP port is required' };
    if (!cfg.user)
        throw { status: 400, message: 'SMTP user is required' };
    if (!cfg.pass)
        throw { status: 400, message: 'SMTP pass/app-password is required' };
}
function assertImapConfigured(cfg) {
    if (!cfg.host)
        throw { status: 400, message: 'IMAP host is required' };
    if (!cfg.port)
        throw { status: 400, message: 'IMAP port is required' };
    if (!cfg.user)
        throw { status: 400, message: 'IMAP user is required' };
    if (!cfg.pass)
        throw { status: 400, message: 'IMAP pass/app-password is required' };
}
function isTlsVersionMismatch(error) {
    const msg = String(error?.message || '').toLowerCase();
    return msg.includes('wrong version number') || msg.includes('ssl routines') || msg.includes('tls');
}
function isTransientSmtpError(error) {
    const code = String(error?.code || '').trim().toUpperCase();
    const message = String(error?.message || '').toLowerCase();
    return (code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'EPIPE' ||
        code === 'ESOCKET' ||
        code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN' ||
        message.includes('timeout') ||
        message.includes('connection closed') ||
        message.includes('socket hang up') ||
        message.includes('greeting never received'));
}
function isSmtpAuthError(error) {
    const code = String(error?.code || '').trim().toUpperCase();
    const responseCode = Number(error?.responseCode || 0);
    const message = String(error?.message || '').toLowerCase();
    return (code === 'EAUTH' ||
        responseCode === 535 ||
        message.includes('invalid login') ||
        message.includes('authentication') ||
        message.includes('username and password not accepted'));
}
function createSmtpTransport(cfg, overrides) {
    const resolvedPort = Number(overrides?.port || cfg.port);
    const resolvedSecure = typeof overrides?.secure === 'boolean' ? overrides.secure : cfg.secure;
    return nodemailer_1.default.createTransport({
        host: cfg.host,
        port: resolvedPort,
        secure: resolvedSecure,
        connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
        greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
        socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
        auth: { user: cfg.user, pass: cfg.pass },
    });
}
function getSmtpTransportCandidates(cfg) {
    const primary = { port: Number(cfg.port), secure: Boolean(cfg.secure) };
    const host = String(cfg.host || '').trim().toLowerCase();
    const canSwitchSubmissionPort = (host.includes('gmail.com') ||
        host.includes('outlook') ||
        host.includes('office365') ||
        host.includes('zoho'));
    if (!canSwitchSubmissionPort)
        return [primary];
    const candidates = [primary];
    if (primary.port === 465)
        candidates.push({ port: 587, secure: false });
    if (primary.port === 587)
        candidates.push({ port: 465, secure: true });
    const seen = new Set();
    return candidates.filter((candidate) => {
        const key = `${candidate.port}:${candidate.secure ? '1' : '0'}`;
        if (seen.has(key))
            return false;
        seen.add(key);
        return true;
    });
}
async function verifySmtp(override) {
    const cfg = mergeConfig(override).smtp;
    assertSmtpConfigured(cfg);
    const candidates = getSmtpTransportCandidates(cfg);
    let lastError = null;
    for (const candidate of candidates) {
        try {
            const transport = createSmtpTransport(cfg, candidate);
            await transport.verify();
            return {
                ok: true,
                host: cfg.host,
                port: candidate.port,
                secure: candidate.secure,
                user: cfg.user,
            };
        }
        catch (error) {
            lastError = error;
            if (isTlsVersionMismatch(error)) {
                try {
                    const transport = createSmtpTransport(cfg, { ...candidate, secure: !candidate.secure });
                    await transport.verify();
                    return {
                        ok: true,
                        host: cfg.host,
                        port: candidate.port,
                        secure: !candidate.secure,
                        user: cfg.user,
                    };
                }
                catch (tlsFallbackError) {
                    lastError = tlsFallbackError;
                }
            }
        }
    }
    throw lastError || new Error('SMTP verification failed');
}
exports.verifySmtp = verifySmtp;
async function sendSmtpMail(payload, override) {
    const cfg = mergeConfig(override).smtp;
    assertSmtpConfigured(cfg);
    const to = Array.isArray(payload.to) ? payload.to.filter(Boolean) : [String(payload.to || '').trim()];
    if (to.length === 0 || !to[0])
        throw { status: 400, message: 'Recipient email is required' };
    const cc = Array.isArray(payload.cc)
        ? payload.cc.map((v) => String(v || '').trim()).filter(Boolean)
        : String(payload.cc || '').split(',').map((v) => v.trim()).filter(Boolean);
    const bcc = Array.isArray(payload.bcc)
        ? payload.bcc.map((v) => String(v || '').trim()).filter(Boolean)
        : String(payload.bcc || '').split(',').map((v) => v.trim()).filter(Boolean);
    const subject = String(payload.subject || '').trim();
    if (!subject)
        throw { status: 400, message: 'Subject is required' };
    if (!payload.text && !payload.html)
        throw { status: 400, message: 'Either text or html body is required' };
    const normalizedText = String(payload.text || '').trim();
    const normalizedHtml = String(payload.html || '').trim();
    const finalHtml = applyGlobalMailTemplate(normalizedHtml || toHtmlFromText(normalizedText));
    const inlineMedia = inlineDataImagesAsCid(finalHtml);
    const outgoingAttachments = [
        ...(Array.isArray(payload.attachments) ? payload.attachments : []),
        ...inlineMedia.attachments,
    ];
    const sendWithTransport = async (smtpCfg, overrides) => {
        const transport = createSmtpTransport(smtpCfg, overrides);
        return transport.sendMail({
            from: payload.from || smtpCfg.from,
            to,
            cc: cc.length ? cc : undefined,
            bcc: bcc.length ? bcc : undefined,
            subject,
            text: normalizedText || undefined,
            html: inlineMedia.html,
            attachments: outgoingAttachments.length ? outgoingAttachments : undefined,
        });
    };
    const sendWithCandidate = async (smtpCfg, candidate) => {
        try {
            return await sendWithTransport(smtpCfg, candidate);
        }
        catch (error) {
            if (isTlsVersionMismatch(error)) {
                return sendWithTransport(smtpCfg, {
                    ...candidate,
                    secure: typeof candidate.secure === 'boolean' ? !candidate.secure : !smtpCfg.secure,
                });
            }
            throw error;
        }
    };
    const sendWithCandidateFallbacks = async (smtpCfg) => {
        const candidates = getSmtpTransportCandidates(smtpCfg);
        let lastError = null;
        for (const candidate of candidates) {
            try {
                return await sendWithCandidate(smtpCfg, candidate);
            }
            catch (error) {
                lastError = error;
                if (!isTransientSmtpError(error) && !isTlsVersionMismatch(error))
                    break;
            }
        }
        throw lastError || new Error('SMTP delivery failed');
    };
    let info = null;
    let lastError = null;
    for (let attempt = 0; attempt <= SMTP_SEND_RETRY_ATTEMPTS; attempt += 1) {
        try {
            info = await sendWithCandidateFallbacks(cfg);
            break;
        }
        catch (error) {
            lastError = error;
            const canRetry = attempt < SMTP_SEND_RETRY_ATTEMPTS && isTransientSmtpError(error);
            if (!canRetry)
                break;
            await wait(SMTP_SEND_RETRY_DELAY_MS * (attempt + 1));
        }
    }
    const shouldTrySeededFallback = isSmtpAuthError(lastError) ||
        isTransientSmtpError(lastError);
    if (!info && shouldTrySeededFallback) {
        const seededCfg = {
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            user: SEEDED_SMTP_USER,
            pass: SEEDED_SMTP_PASS,
            from: String(payload.from || SEEDED_SMTP_USER).trim(),
        };
        for (let attempt = 0; attempt <= SMTP_SEND_RETRY_ATTEMPTS; attempt += 1) {
            try {
                info = await sendWithCandidateFallbacks(seededCfg);
                break;
            }
            catch (error) {
                lastError = error;
                const canRetry = attempt < SMTP_SEND_RETRY_ATTEMPTS && isTransientSmtpError(error);
                if (!canRetry)
                    break;
                await wait(SMTP_SEND_RETRY_DELAY_MS * (attempt + 1));
            }
        }
    }
    if (!info) {
        console.error('SMTP delivery failed', {
            host: cfg.host,
            port: cfg.port,
            secure: cfg.secure,
            code: lastError?.code,
            responseCode: lastError?.responseCode,
            message: lastError?.message,
        });
        const err = new Error(lastError?.message || 'SMTP delivery failed');
        err.status = Number(lastError?.status || 502);
        err.code = lastError?.code ? `SMTP_${String(lastError.code).toUpperCase()}` : 'SMTP_SEND_FAILED';
        err.source = 'smtp';
        throw err;
    }
    return {
        ok: true,
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected,
    };
}
exports.sendSmtpMail = sendSmtpMail;
function imapEscape(input) {
    return String(input || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
async function testImapSession(imapCfg) {
    assertImapConfigured(imapCfg);
    const socket = await new Promise((resolve, reject) => {
        const timeoutMs = 12000;
        const onError = (error) => reject({ status: 502, message: error?.message || 'IMAP connection failed' });
        const onConnect = (sock) => {
            sock.setTimeout(timeoutMs, () => {
                try {
                    sock.destroy();
                }
                catch { }
                reject({ status: 504, message: 'IMAP connection timeout' });
            });
            resolve(sock);
        };
        if (imapCfg.secure) {
            const tlsSocket = tls_1.default.connect({
                host: imapCfg.host,
                port: imapCfg.port,
                servername: imapCfg.host,
            }, () => onConnect(tlsSocket));
            tlsSocket.once('error', onError);
        }
        else {
            const plainSocket = net_1.default.connect({ host: imapCfg.host, port: imapCfg.port }, () => onConnect(plainSocket));
            plainSocket.once('error', onError);
        }
    });
    let seq = 0;
    let buffer = '';
    let greetingSeen = false;
    let current = null;
    const cleanup = () => {
        try {
            socket.removeAllListeners('data');
        }
        catch { }
        try {
            socket.removeAllListeners('error');
        }
        catch { }
        try {
            socket.removeAllListeners('close');
        }
        catch { }
        try {
            socket.end();
        }
        catch { }
        try {
            socket.destroy();
        }
        catch { }
    };
    const failCurrent = (message) => {
        if (!current)
            return;
        const c = current;
        current = null;
        clearTimeout(c.timer);
        c.reject({ status: 502, message });
    };
    const onLine = (line) => {
        const trimmed = line.trim();
        if (!trimmed)
            return;
        if (!greetingSeen) {
            if (/^\*\s+OK/i.test(trimmed)) {
                greetingSeen = true;
                return;
            }
            throw { status: 502, message: `IMAP greeting failed: ${trimmed}` };
        }
        if (!current)
            return;
        const okMatch = new RegExp(`^${current.tag}\\s+(OK|NO|BAD)\\b`, 'i').exec(trimmed);
        if (okMatch) {
            const status = String(okMatch[1] || '').toUpperCase();
            const lines = current.lines.slice();
            const c = current;
            current = null;
            clearTimeout(c.timer);
            if (status === 'OK')
                c.resolve(lines);
            else
                c.reject({ status: 502, message: `IMAP command failed: ${trimmed}` });
            return;
        }
        current.lines.push(trimmed);
    };
    socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        while (true) {
            const idx = buffer.indexOf('\r\n');
            if (idx < 0)
                break;
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            try {
                onLine(line);
            }
            catch (error) {
                failCurrent(error?.message || 'IMAP protocol error');
            }
        }
    });
    socket.on('error', (error) => {
        failCurrent(error?.message || 'IMAP socket error');
    });
    await new Promise((resolve, reject) => {
        const started = Date.now();
        const poll = () => {
            if (greetingSeen)
                return resolve();
            if (Date.now() - started > 8000)
                return reject({ status: 504, message: 'IMAP greeting timeout' });
            setTimeout(poll, 30);
        };
        poll();
    });
    const run = (command) => {
        if (current)
            return Promise.reject({ status: 500, message: 'IMAP command overlap' });
        seq += 1;
        const tag = `A${seq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                failCurrent('IMAP command timeout');
            }, 12000);
            current = { tag, lines: [], resolve, reject, timer };
            socket.write(`${tag} ${command}\r\n`);
        });
    };
    try {
        await run(`LOGIN "${imapEscape(imapCfg.user)}" "${imapEscape(imapCfg.pass)}"`);
        const selectLines = await run(`SELECT "${imapEscape(imapCfg.mailbox)}"`);
        let exists = 0;
        let recent = 0;
        let unseen = 0;
        for (const line of selectLines) {
            const existsMatch = /^\*\s+(\d+)\s+EXISTS/i.exec(line);
            if (existsMatch)
                exists = Number(existsMatch[1] || 0);
            const recentMatch = /^\*\s+(\d+)\s+RECENT/i.exec(line);
            if (recentMatch)
                recent = Number(recentMatch[1] || 0);
            const unseenMatch = /^\*\s+OK\s+\[UNSEEN\s+(\d+)\]/i.exec(line);
            if (unseenMatch)
                unseen = Number(unseenMatch[1] || 0);
        }
        await run('LOGOUT');
        cleanup();
        return {
            ok: true,
            mailbox: imapCfg.mailbox,
            exists,
            recent,
            unseen,
        };
    }
    catch (error) {
        cleanup();
        throw error;
    }
}
async function verifyImap(override) {
    const cfg = mergeConfig(override).imap;
    return testImapSession(cfg);
}
exports.verifyImap = verifyImap;
