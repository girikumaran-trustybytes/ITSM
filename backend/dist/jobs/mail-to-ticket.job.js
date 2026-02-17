"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startMailToTicketJob = void 0;
const net_1 = __importDefault(require("net"));
const tls_1 = __importDefault(require("tls"));
const ticket_service_1 = require("../modules/tickets/ticket.service");
const mail_integration_1 = require("../services/mail.integration");
const db_1 = require("../db");
const logger_1 = __importDefault(require("../common/logger/logger"));
const MAILBOX_LOCK = {
    running: false,
};
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
function imapEscape(input) {
    return String(input || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
function extractHeaderValue(lines, name) {
    const prefix = `${name.toLowerCase()}:`;
    const line = lines.find((l) => l.toLowerCase().startsWith(prefix));
    if (!line)
        return '';
    return line.slice(prefix.length).trim();
}
function extractEmailAddress(raw) {
    const angleMatch = /<([^>]+)>/.exec(raw);
    if (angleMatch?.[1])
        return angleMatch[1].trim().toLowerCase();
    const plainMatch = /([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.exec(raw);
    return plainMatch?.[1]?.trim().toLowerCase() || '';
}
async function ensureIngestTable() {
    await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS mail_ticket_ingest_log (
      id SERIAL PRIMARY KEY,
      mailbox TEXT NOT NULL,
      uid TEXT NOT NULL,
      message_id TEXT,
      from_email TEXT,
      subject TEXT,
      ticket_id INTEGER REFERENCES "Ticket"("id") ON DELETE SET NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (mailbox, uid)
    )`);
}
async function connectImap(host, port, secure, timeoutMs) {
    return new Promise((resolve, reject) => {
        const onError = (error) => reject(new Error(error?.message || 'IMAP connection failed'));
        const onConnect = (sock) => {
            sock.setTimeout(timeoutMs, () => {
                try {
                    sock.destroy();
                }
                catch { }
                reject(new Error('IMAP connection timeout'));
            });
            resolve(sock);
        };
        if (secure) {
            const tlsSocket = tls_1.default.connect({ host, port, servername: host }, () => onConnect(tlsSocket));
            tlsSocket.once('error', onError);
            return;
        }
        const plainSocket = net_1.default.connect({ host, port }, () => onConnect(plainSocket));
        plainSocket.once('error', onError);
    });
}
async function createImapSession(socket) {
    let seq = 0;
    let buffer = '';
    let greetingSeen = false;
    let current = null;
    const failCurrent = (message) => {
        if (!current)
            return;
        const pending = current;
        current = null;
        clearTimeout(pending.timer);
        pending.reject(new Error(message));
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
            throw new Error(`IMAP greeting failed: ${trimmed}`);
        }
        if (!current)
            return;
        const match = new RegExp(`^${current.tag}\\s+(OK|NO|BAD)\\b`, 'i').exec(trimmed);
        if (match) {
            const status = String(match[1] || 'BAD').toUpperCase();
            const done = current;
            current = null;
            clearTimeout(done.timer);
            done.resolve({ status, lines: done.lines.slice() });
            return;
        }
        current.lines.push(line);
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
        const wait = () => {
            if (greetingSeen)
                return resolve();
            if (Date.now() - started > 10000)
                return reject(new Error('IMAP greeting timeout'));
            setTimeout(wait, 40);
        };
        wait();
    });
    const run = (command) => {
        if (current)
            return Promise.reject(new Error('IMAP command overlap'));
        seq += 1;
        const tag = `A${seq}`;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                failCurrent('IMAP command timeout');
            }, 15000);
            current = { tag, lines: [], resolve, reject, timer };
            socket.write(`${tag} ${command}\r\n`);
        });
    };
    const close = () => {
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
    return { run, close };
}
function parseSearchResult(lines) {
    const line = lines.find((l) => l.trim().toUpperCase().startsWith('* SEARCH'));
    if (!line)
        return [];
    return line
        .replace(/^\*\s+SEARCH\s*/i, '')
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
}
function parseFetchedHeaders(lines) {
    const uidLine = lines.find((l) => /\bUID\s+\d+\b/i.test(l)) || '';
    const uidMatch = /\bUID\s+(\d+)\b/i.exec(uidLine);
    const uid = uidMatch?.[1] || '';
    const messageId = extractHeaderValue(lines, 'message-id');
    const inReplyTo = extractHeaderValue(lines, 'in-reply-to');
    const references = extractHeaderValue(lines, 'references');
    const fromRaw = extractHeaderValue(lines, 'from');
    const toRaw = extractHeaderValue(lines, 'to');
    const subject = extractHeaderValue(lines, 'subject');
    const dateRaw = extractHeaderValue(lines, 'date');
    const fromEmail = extractEmailAddress(fromRaw);
    return {
        uid,
        messageId,
        inReplyTo,
        references,
        fromRaw,
        fromEmail,
        toRaw,
        subject,
        dateRaw,
    };
}
function extractTicketRefFromSubject(subject) {
    const s = String(subject || '');
    const tb = s.match(/\bTB#\d{1,10}\b/i);
    if (tb?.[0])
        return tb[0].toUpperCase();
    const adx = s.match(/\bADX#\d{1,10}\b/i);
    if (adx?.[0])
        return adx[0].toUpperCase();
    return null;
}
function extractMessageIds(raw) {
    const matches = String(raw || '').match(/<[^>]+>/g) || [];
    return matches.map((m) => m.trim()).filter(Boolean);
}
async function findTicketDbIdByTicketRef(ticketRef) {
    if (!ticketRef)
        return null;
    const row = await (0, db_1.queryOne)('SELECT "id" FROM "Ticket" WHERE UPPER("ticketId") = UPPER($1)', [ticketRef]);
    return Number(row?.id || 0) || null;
}
async function findTicketDbIdByMessageThread(mail) {
    const ids = [
        ...extractMessageIds(mail.inReplyTo),
        ...extractMessageIds(mail.references),
    ];
    if (ids.length === 0)
        return null;
    const row = await (0, db_1.queryOne)(`SELECT ticket_id
     FROM mail_ticket_ingest_log
     WHERE message_id = ANY($1::text[])
       AND ticket_id IS NOT NULL
     ORDER BY id DESC
     LIMIT 1`, [ids]);
    return Number(row?.ticket_id || 0) || null;
}
async function appendInboundReplyToTicket(ticketDbId, mailbox, mail) {
    const ticket = await (0, db_1.queryOne)('SELECT "id", "ticketId" FROM "Ticket" WHERE "id" = $1', [ticketDbId]);
    if (!ticket?.id)
        return null;
    const message = [
        `Inbound email reply received.`,
        `Mailbox: ${mailbox}`,
        mail.fromEmail ? `From: ${mail.fromEmail}` : '',
        mail.subject ? `Subject: ${mail.subject}` : '',
        mail.messageId ? `Message-Id: ${mail.messageId}` : '',
        mail.dateRaw ? `Date: ${mail.dateRaw}` : '',
    ].filter(Boolean).join('\n');
    await (0, ticket_service_1.addResponse)(String(ticket.id), {
        message,
        user: 'mail_ingest',
        sendEmail: false,
    });
    return ticket;
}
async function alreadyProcessed(mailbox, uid) {
    const row = await (0, db_1.queryOne)('SELECT id FROM mail_ticket_ingest_log WHERE mailbox = $1 AND uid = $2', [mailbox, uid]);
    return Boolean(row);
}
async function markProcessed(payload) {
    await (0, db_1.query)(`INSERT INTO mail_ticket_ingest_log (mailbox, uid, message_id, from_email, subject, ticket_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (mailbox, uid) DO NOTHING`, [
        payload.mailbox,
        payload.uid,
        payload.messageId || null,
        payload.fromEmail || null,
        payload.subject || null,
        payload.ticketDbId,
    ]);
}
async function findRequesterIdByEmail(email) {
    if (!email)
        return undefined;
    const row = await (0, db_1.queryOne)('SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1)', [email]);
    return row?.id;
}
async function createTicketFromMail(mailbox, mail) {
    const requesterId = await findRequesterIdByEmail(mail.fromEmail);
    const safeSubject = (mail.subject || '').trim() || `Email to ${mailbox}`;
    const description = [
        'Auto-created from inbound email.',
        `Mailbox: ${mailbox}`,
        mail.messageId ? `Message-Id: ${mail.messageId}` : '',
        mail.fromEmail ? `From: ${mail.fromEmail}` : '',
        mail.dateRaw ? `Date: ${mail.dateRaw}` : '',
    ].filter(Boolean).join('\n');
    const created = await (0, ticket_service_1.createTicket)({
        subject: safeSubject,
        type: 'Incident',
        status: 'New',
        category: 'Helpdesk',
        subcategory: 'Email',
        description,
        requesterId,
    }, 'mail_ingest');
    return created;
}
async function processMailboxOnce() {
    const cfg = (0, mail_integration_1.loadMailConfigFromEnv)();
    const mailbox = String(process.env.MAIL_TICKET_INGEST_ADDRESS || cfg.imap.user || '').trim().toLowerCase();
    const pollEnabled = toBool(process.env.MAIL_TICKET_INGEST_ENABLED, true);
    if (!pollEnabled) {
        logger_1.default.info('mail_ticket_job_skipped', { reason: 'disabled' });
        return;
    }
    if (!cfg.imap.user || !cfg.imap.pass) {
        logger_1.default.warn('mail_ticket_job_skipped', { reason: 'imap_credentials_missing' });
        return;
    }
    if (!mailbox) {
        logger_1.default.warn('mail_ticket_job_skipped', { reason: 'mailbox_not_configured' });
        return;
    }
    await ensureIngestTable();
    const socket = await connectImap(cfg.imap.host, cfg.imap.port, cfg.imap.secure, 15000);
    const session = await createImapSession(socket);
    try {
        const loginResult = await session.run(`LOGIN "${imapEscape(cfg.imap.user)}" "${imapEscape(cfg.imap.pass)}"`);
        if (loginResult.status !== 'OK')
            throw new Error('IMAP login failed');
        const selectResult = await session.run(`SELECT "${imapEscape(cfg.imap.mailbox)}"`);
        if (selectResult.status !== 'OK')
            throw new Error(`Cannot select mailbox ${cfg.imap.mailbox}`);
        const searchResult = await session.run('SEARCH UNSEEN');
        if (searchResult.status !== 'OK')
            throw new Error('IMAP search failed');
        const messageSeqs = parseSearchResult(searchResult.lines);
        for (const seq of messageSeqs) {
            const fetchResult = await session.run(`FETCH ${seq} (UID BODY.PEEK[HEADER.FIELDS (MESSAGE-ID IN-REPLY-TO REFERENCES FROM TO SUBJECT DATE)])`);
            if (fetchResult.status !== 'OK')
                continue;
            const mail = parseFetchedHeaders(fetchResult.lines);
            if (!mail.uid)
                continue;
            if (await alreadyProcessed(cfg.imap.mailbox, mail.uid)) {
                await session.run(`STORE ${seq} +FLAGS (\\Seen)`);
                continue;
            }
            const recipients = `${mail.toRaw}`.toLowerCase();
            if (recipients && !recipients.includes(mailbox)) {
                await markProcessed({
                    mailbox: cfg.imap.mailbox,
                    uid: mail.uid,
                    messageId: mail.messageId,
                    fromEmail: mail.fromEmail,
                    subject: mail.subject,
                    ticketDbId: null,
                });
                await session.run(`STORE ${seq} +FLAGS (\\Seen)`);
                continue;
            }
            const ticketRef = extractTicketRefFromSubject(mail.subject);
            let existingTicketDbId = ticketRef ? await findTicketDbIdByTicketRef(ticketRef) : null;
            if (!existingTicketDbId) {
                existingTicketDbId = await findTicketDbIdByMessageThread(mail);
            }
            let ticket = null;
            if (existingTicketDbId) {
                ticket = await appendInboundReplyToTicket(existingTicketDbId, mailbox, mail);
            }
            else {
                ticket = await createTicketFromMail(mailbox, mail);
            }
            await markProcessed({
                mailbox: cfg.imap.mailbox,
                uid: mail.uid,
                messageId: mail.messageId,
                fromEmail: mail.fromEmail,
                subject: mail.subject,
                ticketDbId: Number(ticket?.id || 0) || null,
            });
            await session.run(`STORE ${seq} +FLAGS (\\Seen)`);
            logger_1.default.info(existingTicketDbId ? 'mail_ticket_updated' : 'mail_ticket_created', {
                mailbox: cfg.imap.mailbox,
                uid: mail.uid,
                from: mail.fromEmail,
                subject: mail.subject,
                ticketId: ticket?.ticketId,
            });
        }
        await session.run('LOGOUT');
    }
    finally {
        session.close();
    }
}
function startMailToTicketJob() {
    const intervalMs = toInt(process.env.MAIL_TICKET_POLL_MS, 30000);
    const run = async () => {
        if (MAILBOX_LOCK.running)
            return;
        MAILBOX_LOCK.running = true;
        try {
            await processMailboxOnce();
        }
        catch (error) {
            logger_1.default.warn('mail_ticket_job_failed', { error: error?.message || String(error) });
        }
        finally {
            MAILBOX_LOCK.running = false;
        }
    };
    void run();
    setInterval(run, intervalMs);
    logger_1.default.info('mail_ticket_job_started', { intervalMs });
}
exports.startMailToTicketJob = startMailToTicketJob;
