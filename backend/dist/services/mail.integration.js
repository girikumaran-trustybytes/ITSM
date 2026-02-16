"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyImap = exports.sendSmtpMail = exports.verifySmtp = exports.getPublicMailConfig = exports.loadMailConfigFromEnv = void 0;
const net_1 = __importDefault(require("net"));
const tls_1 = __importDefault(require("tls"));
const nodemailer_1 = __importDefault(require("nodemailer"));
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
function loadMailConfigFromEnv() {
    const providerRaw = String(process.env.MAIL_PROVIDER || 'gmail').trim().toLowerCase();
    const provider = providerRaw === 'google-workspace' ? 'google-workspace' :
        providerRaw === 'custom' ? 'custom' :
            'gmail';
    return {
        provider,
        smtp: {
            host: String(process.env.SMTP_HOST || 'smtp.gmail.com').trim(),
            port: toInt(process.env.SMTP_PORT, 465),
            secure: toBool(process.env.SMTP_SECURE, true),
            user: String(process.env.SMTP_USER || '').trim(),
            pass: String(process.env.SMTP_PASS || '').trim(),
            from: String(process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@itsm.local').trim(),
        },
        imap: {
            host: String(process.env.IMAP_HOST || 'imap.gmail.com').trim(),
            port: toInt(process.env.IMAP_PORT, 993),
            secure: toBool(process.env.IMAP_SECURE, true),
            user: String(process.env.IMAP_USER || process.env.SMTP_USER || '').trim(),
            pass: String(process.env.IMAP_PASS || process.env.SMTP_PASS || '').trim(),
            mailbox: String(process.env.IMAP_MAILBOX || 'INBOX').trim() || 'INBOX',
        },
    };
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
    };
}
exports.getPublicMailConfig = getPublicMailConfig;
function mergeConfig(override) {
    const base = loadMailConfigFromEnv();
    return {
        provider: override?.provider || base.provider,
        smtp: {
            ...base.smtp,
            ...(override?.smtp || {}),
            port: toInt(override?.smtp?.port, base.smtp.port),
            secure: toBool(override?.smtp?.secure, base.smtp.secure),
        },
        imap: {
            ...base.imap,
            ...(override?.imap || {}),
            port: toInt(override?.imap?.port, base.imap.port),
            secure: toBool(override?.imap?.secure, base.imap.secure),
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
async function verifySmtp(override) {
    const cfg = mergeConfig(override).smtp;
    assertSmtpConfigured(cfg);
    const transport = nodemailer_1.default.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
    });
    await transport.verify();
    return {
        ok: true,
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        user: cfg.user,
    };
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
    const transport = nodemailer_1.default.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
    });
    const info = await transport.sendMail({
        from: payload.from || cfg.from,
        to,
        cc: cc.length ? cc : undefined,
        bcc: bcc.length ? bcc : undefined,
        subject,
        text: payload.text,
        html: payload.html,
    });
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
