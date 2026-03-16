"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateConfig = exports.updateInboundRouting = exports.sendTestMail = exports.testImap = exports.startOAuth = exports.testSmtp = exports.getConfig = void 0;
const mail_integration_1 = require("../../services/mail.integration");
const db_1 = require("../../db");
function isEmailLike(value) {
    const text = String(value || '').trim();
    if (!text)
        return '';
    return text.includes('@') ? text : '';
}
function normalizeMailboxProvider(value, smtpHost, imapHost) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'gmail' || raw === 'google' || raw === 'google-workspace')
        return 'gmail';
    if (raw === 'outlook' || raw === 'microsoft-workspace' || raw === 'office365' || raw === 'microsoft-365')
        return 'outlook';
    if (raw === 'zoho')
        return 'zoho';
    if (raw === 'custom')
        return 'custom';
    const hostBlob = `${smtpHost || ''} ${imapHost || ''}`.toLowerCase();
    if (hostBlob.includes('gmail'))
        return 'gmail';
    if (hostBlob.includes('zoho'))
        return 'zoho';
    if (hostBlob.includes('outlook') || hostBlob.includes('office365'))
        return 'outlook';
    return 'custom';
}
function buildRoutingFromMailboxes(mailboxes, fallbackQueue) {
    const inboundRoutes = [];
    const outboundRoutes = [];
    const seenOutbound = new Set();
    for (const row of mailboxes) {
        const email = String(row?.email || '').trim().toLowerCase();
        const queue = String(row?.queue || '').trim();
        if (!email || !queue)
            continue;
        inboundRoutes.push({ email, queue });
        const queueKey = queue.toLowerCase();
        if (!seenOutbound.has(queueKey)) {
            outboundRoutes.push({ queue, from: email });
            seenOutbound.add(queueKey);
        }
    }
    const defaultQueue = String(fallbackQueue || '').trim() || 'Support Team';
    return { defaultQueue, inboundRoutes, outboundRoutes };
}
function logMailMigration(event, details) {
    const payload = details ? ` ${JSON.stringify(details)}` : '';
    console.info(`[mail-settings] ${event}${payload}`);
}
function buildOauthStartUrl(provider, mailboxId) {
    const safeMailboxId = String(mailboxId || '').trim();
    if (!safeMailboxId)
        throw { status: 400, message: 'mailboxId is required' };
    if (provider === 'gmail') {
        const clientId = String(process.env.MAIL_GOOGLE_CLIENT_ID || '').trim();
        const redirectUri = String(process.env.MAIL_GOOGLE_REDIRECT_URI || '').trim();
        const scope = String(process.env.MAIL_GOOGLE_SCOPES || 'https://mail.google.com/').trim();
        if (!clientId || !redirectUri)
            throw { status: 400, message: 'Google OAuth is not configured' };
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            access_type: 'offline',
            prompt: 'consent',
            scope,
            state: safeMailboxId,
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    if (provider === 'outlook') {
        const tenant = String(process.env.MAIL_OUTLOOK_TENANT || 'common').trim();
        const clientId = String(process.env.MAIL_OUTLOOK_CLIENT_ID || '').trim();
        const redirectUri = String(process.env.MAIL_OUTLOOK_REDIRECT_URI || '').trim();
        const scope = String(process.env.MAIL_OUTLOOK_SCOPES
            || 'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access').trim();
        if (!clientId || !redirectUri)
            throw { status: 400, message: 'Outlook OAuth is not configured' };
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            response_mode: 'query',
            scope,
            state: safeMailboxId,
        });
        return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
    }
    if (provider === 'zoho') {
        const clientId = String(process.env.MAIL_ZOHO_CLIENT_ID || '').trim();
        const redirectUri = String(process.env.MAIL_ZOHO_REDIRECT_URI || '').trim();
        const scope = String(process.env.MAIL_ZOHO_SCOPES || 'ZohoMail.accounts.READ,ZohoMail.messages.ALL').trim();
        const accountsBase = String(process.env.MAIL_ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com')
            .trim()
            .replace(/\/+$/, '');
        if (!clientId || !redirectUri)
            throw { status: 400, message: 'Zoho OAuth is not configured' };
        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'code',
            access_type: 'offline',
            prompt: 'consent',
            scope,
            state: safeMailboxId,
        });
        return `${accountsBase}/oauth/v2/auth?${params.toString()}`;
    }
    throw { status: 400, message: 'Unsupported OAuth provider' };
}
function buildLegacyMailbox(normalized, envSupport) {
    const smtp = normalized.smtp || {};
    const imap = normalized.imap || {};
    const hasLegacyConfig = Boolean(smtp.host || smtp.user || smtp.pass || imap.host || imap.user || imap.pass);
    if (!hasLegacyConfig)
        return null;
    const fallbackQueue = String(normalized.inbound?.defaultQueue || 'Support Team').trim() || 'Support Team';
    const candidates = [
        envSupport,
        normalized.settings?.supportMail,
        normalized.settings?.inboundEmailAddress,
        smtp.from,
        smtp.user,
        imap.user,
        normalized.inbound?.inboundRoutes?.find((row) => String(row?.queue || '').trim().toLowerCase() === fallbackQueue.toLowerCase())?.email,
        normalized.inbound?.inboundRoutes?.[0]?.email,
    ];
    const email = candidates.map(isEmailLike).find(Boolean);
    if (!email)
        return null;
    const provider = normalizeMailboxProvider(normalized.provider, smtp.host, imap.host);
    const hasPass = Boolean(smtp.pass || imap.pass);
    const connectionMode = provider === 'custom'
        ? 'manual-credentials'
        : (hasPass ? 'app-password' : 'oauth2');
    const smtpUser = isEmailLike(smtp.user) || email;
    const imapUser = isEmailLike(imap.user) || smtpUser;
    const from = isEmailLike(smtp.from) || smtpUser;
    return {
        id: `mb-legacy-${Date.now()}`,
        email: email.toLowerCase(),
        queue: fallbackQueue,
        provider,
        connectionMode,
        smtp: {
            host: String(smtp.host || '').trim(),
            port: smtp.port ?? undefined,
            secure: Boolean(smtp.secure),
            user: smtpUser,
            pass: String(smtp.pass || '').trim(),
            from,
        },
        imap: {
            host: String(imap.host || '').trim(),
            port: imap.port ?? undefined,
            secure: Boolean(imap.secure),
            user: imapUser,
            pass: String(imap.pass || '').trim(),
            mailbox: String(imap.mailbox || 'INBOX').trim() || 'INBOX',
        },
        oauthConnected: false,
        oauthTokenExpiry: '',
        oauth: { refreshToken: '', accessToken: '', expiresAt: '', tokenType: '', scope: '' },
    };
}
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
    const mailboxesRaw = Array.isArray(raw.mailboxes)
        ? raw.mailboxes
        : (Array.isArray(settings.mailboxes) ? settings.mailboxes : []);
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
    const mailboxes = Array.isArray(mailboxesRaw)
        ? mailboxesRaw
            .map((row) => {
            const providerRaw = String(row?.provider || '').trim().toLowerCase();
            const provider = providerRaw === 'gmail' ? 'gmail'
                : providerRaw === 'outlook' ? 'outlook'
                    : providerRaw === 'zoho' ? 'zoho'
                        : providerRaw === 'custom' ? 'custom'
                            : 'custom';
            const connectionModeRaw = String(row?.connectionMode || '').trim().toLowerCase();
            const connectionMode = connectionModeRaw === 'oauth2' ? 'oauth2'
                : connectionModeRaw === 'app-password' ? 'app-password'
                    : connectionModeRaw === 'manual-credentials' ? 'manual-credentials'
                        : (provider === 'custom' ? 'manual-credentials' : 'oauth2');
            const smtpCfg = row?.smtp && typeof row.smtp === 'object' ? row.smtp : {};
            const imapCfg = row?.imap && typeof row.imap === 'object' ? row.imap : {};
            const oauthCfg = row?.oauth && typeof row.oauth === 'object' ? row.oauth : {};
            return {
                id: String(row?.id || '').trim() || undefined,
                email: String(row?.email || '').trim().toLowerCase(),
                queue: String(row?.queue || '').trim(),
                provider,
                connectionMode,
                oauth: {
                    refreshToken: String(oauthCfg.refreshToken || '').trim(),
                    accessToken: String(oauthCfg.accessToken || '').trim(),
                    expiresAt: String(oauthCfg.expiresAt || '').trim(),
                    tokenType: String(oauthCfg.tokenType || '').trim(),
                    scope: String(oauthCfg.scope || '').trim(),
                },
                smtp: {
                    host: String(smtpCfg.host || '').trim(),
                    port: smtpCfg.port ?? undefined,
                    secure: Boolean(smtpCfg.secure),
                    user: String(smtpCfg.user || '').trim(),
                    pass: String(smtpCfg.pass || '').trim(),
                    from: String(smtpCfg.from || '').trim(),
                },
                imap: {
                    host: String(imapCfg.host || '').trim(),
                    port: imapCfg.port ?? undefined,
                    secure: Boolean(imapCfg.secure),
                    user: String(imapCfg.user || '').trim(),
                    pass: String(imapCfg.pass || '').trim(),
                    mailbox: String(imapCfg.mailbox || '').trim(),
                },
                oauthConnected: Boolean(row?.oauthConnected) || Boolean(oauthCfg.refreshToken || oauthCfg.accessToken),
                oauthTokenExpiry: String(row?.oauthTokenExpiry || oauthCfg.expiresAt || '').trim(),
            };
        })
            .filter((row) => row.email && row.queue)
        : [];
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
        mailboxes,
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
function assertUniqueMailboxes(mailboxes) {
    const seen = new Set();
    const duplicates = new Set();
    for (const row of mailboxes) {
        const email = String(row?.email || '').trim().toLowerCase();
        if (!email)
            continue;
        if (seen.has(email))
            duplicates.add(email);
        seen.add(email);
    }
    if (duplicates.size) {
        throw { status: 400, message: `Duplicate mailbox email(s) are not allowed: ${Array.from(duplicates).join(', ')}` };
    }
}
function dedupeMailboxes(mailboxes) {
    const byEmail = new Map();
    const order = [];
    const pickString = (a, b) => (String(a || '').trim() ? a : b);
    const pickBool = (a, b) => (typeof a === 'boolean' ? a : (typeof b === 'boolean' ? b : undefined));
    const mergeMailbox = (base, extra) => {
        const mergedOauth = {
            ...(base?.oauth || {}),
            ...(extra?.oauth || {}),
            refreshToken: pickString(base?.oauth?.refreshToken, extra?.oauth?.refreshToken),
            accessToken: pickString(base?.oauth?.accessToken, extra?.oauth?.accessToken),
            expiresAt: pickString(base?.oauth?.expiresAt, extra?.oauth?.expiresAt),
            tokenType: pickString(base?.oauth?.tokenType, extra?.oauth?.tokenType),
            scope: pickString(base?.oauth?.scope, extra?.oauth?.scope),
        };
        return {
            ...base,
            ...extra,
            id: pickString(base?.id, extra?.id),
            email: pickString(base?.email, extra?.email),
            queue: pickString(base?.queue, extra?.queue),
            provider: pickString(base?.provider, extra?.provider),
            connectionMode: pickString(base?.connectionMode, extra?.connectionMode),
            oauthConnected: Boolean(base?.oauthConnected
                || extra?.oauthConnected
                || mergedOauth.refreshToken
                || mergedOauth.accessToken),
            oauthTokenExpiry: pickString(base?.oauthTokenExpiry, extra?.oauthTokenExpiry) || pickString(base?.oauth?.expiresAt, extra?.oauth?.expiresAt),
            oauth: mergedOauth,
            smtp: {
                ...(base?.smtp || {}),
                ...(extra?.smtp || {}),
                host: pickString(base?.smtp?.host, extra?.smtp?.host),
                port: base?.smtp?.port ?? extra?.smtp?.port,
                secure: pickBool(base?.smtp?.secure, extra?.smtp?.secure),
                user: pickString(base?.smtp?.user, extra?.smtp?.user),
                pass: pickString(base?.smtp?.pass, extra?.smtp?.pass),
                from: pickString(base?.smtp?.from, extra?.smtp?.from),
            },
            imap: {
                ...(base?.imap || {}),
                ...(extra?.imap || {}),
                host: pickString(base?.imap?.host, extra?.imap?.host),
                port: base?.imap?.port ?? extra?.imap?.port,
                secure: pickBool(base?.imap?.secure, extra?.imap?.secure),
                user: pickString(base?.imap?.user, extra?.imap?.user),
                pass: pickString(base?.imap?.pass, extra?.imap?.pass),
                mailbox: pickString(base?.imap?.mailbox, extra?.imap?.mailbox),
            },
        };
    };
    for (const row of mailboxes) {
        const email = String(row?.email || '').trim().toLowerCase();
        if (!email)
            continue;
        if (!byEmail.has(email)) {
            byEmail.set(email, row);
            order.push(email);
        }
        else {
            byEmail.set(email, mergeMailbox(byEmail.get(email), row));
        }
    }
    const deduped = order.map((email) => byEmail.get(email));
    return { deduped, hadDuplicates: deduped.length !== mailboxes.length };
}
async function getConfig(_req, res) {
    try {
        const stored = await loadStoredMailSettings();
        const envSmtpUser = String(process.env.SMTP_USER || '').trim();
        const envImapUser = String(process.env.IMAP_USER || envSmtpUser || '').trim();
        const envFrom = String(process.env.SMTP_FROM || envSmtpUser || envImapUser || '').trim();
        const envSupport = String(process.env.MAIL_TICKET_INGEST_ADDRESS
            || envFrom
            || envSmtpUser
            || envImapUser
            || '').trim();
        if (stored) {
            const normalized = normalizeStoredMailSettings(stored);
            if (envSmtpUser)
                normalized.smtp = { ...normalized.smtp, user: envSmtpUser };
            if (envImapUser)
                normalized.imap = { ...normalized.imap, user: envImapUser };
            if (envFrom)
                normalized.smtp = { ...normalized.smtp, from: envFrom };
            let migratedLegacyMailbox = false;
            let supportMailboxAdded = false;
            if (Array.isArray(normalized.mailboxes) && normalized.mailboxes.length === 0) {
                const legacyMailbox = buildLegacyMailbox(normalized, envSupport);
                if (legacyMailbox) {
                    normalized.mailboxes = [legacyMailbox];
                    normalized.settings = { ...(normalized.settings || {}), mailboxes: normalized.mailboxes };
                    migratedLegacyMailbox = true;
                    logMailMigration('legacy-mailbox-migrated', { mailbox: legacyMailbox.email });
                }
            }
            if (envSupport && Array.isArray(normalized.mailboxes)) {
                const supportLower = envSupport.toLowerCase();
                const hasSupport = normalized.mailboxes.some((row) => String(row.email || '').trim().toLowerCase() === supportLower);
                if (!hasSupport) {
                    normalized.mailboxes.push({
                        id: `mb-env-${Date.now()}`,
                        email: supportLower,
                        queue: String(normalized.inbound?.defaultQueue || 'Support Team').trim() || 'Support Team',
                        provider: normalized.provider || 'custom',
                        connectionMode: (normalized.provider === 'custom' ? 'manual-credentials' : 'oauth2'),
                        smtp: {
                            host: normalized.smtp?.host || '',
                            port: normalized.smtp?.port,
                            secure: Boolean(normalized.smtp?.secure),
                            user: envSmtpUser || envSupport,
                            pass: String(normalized.smtp?.pass || '').trim(),
                            from: envFrom || envSupport,
                        },
                        imap: {
                            host: normalized.imap?.host || '',
                            port: normalized.imap?.port,
                            secure: Boolean(normalized.imap?.secure),
                            user: envImapUser || envSupport,
                            pass: String(normalized.imap?.pass || '').trim(),
                            mailbox: String(normalized.imap?.mailbox || 'INBOX'),
                        },
                        oauthConnected: false,
                        oauthTokenExpiry: '',
                        oauth: { refreshToken: '', accessToken: '', expiresAt: '', tokenType: '', scope: '' },
                    });
                    normalized.settings = { ...(normalized.settings || {}), mailboxes: normalized.mailboxes };
                    supportMailboxAdded = true;
                    logMailMigration('support-mailbox-added', { mailbox: supportLower });
                }
            }
            if (envSupport) {
                normalized.settings = {
                    ...(normalized.settings || {}),
                    supportMail: envSupport,
                    inboundEmailAddress: envSupport,
                };
                const supportLower = envSupport.toLowerCase();
                const inboundRoutes = Array.isArray(normalized.inbound?.inboundRoutes) ? normalized.inbound.inboundRoutes.slice() : [];
                const outboundRoutes = Array.isArray(normalized.inbound?.outboundRoutes) ? normalized.inbound.outboundRoutes.slice() : [];
                const hasSupportEmailInbound = inboundRoutes.some((row) => String(row.email || '').trim().toLowerCase() === supportLower);
                const hasSupportEmailOutbound = outboundRoutes.some((row) => String(row.from || '').trim().toLowerCase() === supportLower);
                const nextInbound = hasSupportEmailInbound
                    ? inboundRoutes
                    : inboundRoutes.map((row) => (String(row.queue || '').trim().toLowerCase() === 'support team'
                        ? { ...row, email: supportLower }
                        : row));
                const nextOutbound = hasSupportEmailOutbound
                    ? outboundRoutes
                    : outboundRoutes.map((row) => (String(row.queue || '').trim().toLowerCase() === 'support team'
                        ? { ...row, from: supportLower }
                        : row));
                const hasSupportQueueInbound = nextInbound.some((row) => String(row.queue || '').trim().toLowerCase() === 'support team');
                const hasSupportQueueOutbound = nextOutbound.some((row) => String(row.queue || '').trim().toLowerCase() === 'support team');
                if (!hasSupportEmailInbound && !hasSupportQueueInbound)
                    nextInbound.push({ email: supportLower, queue: 'Support Team' });
                if (!hasSupportEmailOutbound && !hasSupportQueueOutbound)
                    nextOutbound.push({ queue: 'Support Team', from: supportLower });
                normalized.inbound = {
                    ...(normalized.inbound || {}),
                    inboundRoutes: nextInbound,
                    outboundRoutes: nextOutbound,
                };
            }
            if ((migratedLegacyMailbox || supportMailboxAdded) && Array.isArray(normalized.mailboxes) && normalized.mailboxes.length) {
                const fallbackQueue = String(normalized.inbound?.defaultQueue || 'Support Team').trim() || 'Support Team';
                normalized.inbound = buildRoutingFromMailboxes(normalized.mailboxes, fallbackQueue);
                logMailMigration('routing-rebuilt', { reason: migratedLegacyMailbox ? 'legacy-migration' : 'support-mailbox-added' });
            }
            if (migratedLegacyMailbox || supportMailboxAdded) {
                await ensureSystemSettingsTable();
                await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (key)
           DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['mail.settings', normalized]);
            }
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
            if (Array.isArray(normalized.mailboxes)) {
                const { deduped, hadDuplicates } = dedupeMailboxes(normalized.mailboxes);
                if (hadDuplicates) {
                    normalized.mailboxes = deduped;
                    normalized.settings = { ...(normalized.settings || {}), mailboxes: deduped };
                    logMailMigration('mailbox-deduped', { count: deduped.length });
                    await ensureSystemSettingsTable();
                    await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
             VALUES ($1, $2, NOW())
             ON CONFLICT (key)
             DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['mail.settings', normalized]);
                }
                (0, mail_integration_1.setMailboxConfigs)(normalized.mailboxes);
            }
            const cfg = (0, mail_integration_1.getPublicMailConfig)();
            const sanitizedMailboxes = Array.isArray(normalized.mailboxes)
                ? normalized.mailboxes.map((row) => ({
                    id: row.id,
                    email: row.email,
                    queue: row.queue,
                    provider: row.provider,
                    connectionMode: row.connectionMode,
                    oauthConnected: Boolean(row?.oauth?.refreshToken || row?.oauth?.accessToken || row?.oauthConnected),
                    oauthTokenExpiry: String(row?.oauth?.expiresAt || row?.oauthTokenExpiry || ''),
                    smtp: {
                        host: row.smtp?.host || '',
                        port: row.smtp?.port,
                        secure: Boolean(row.smtp?.secure),
                        user: row.smtp?.user || '',
                        from: row.smtp?.from || '',
                        hasPassword: Boolean(row.smtp?.pass),
                    },
                    imap: {
                        host: row.imap?.host || '',
                        port: row.imap?.port,
                        secure: Boolean(row.imap?.secure),
                        user: row.imap?.user || '',
                        mailbox: row.imap?.mailbox || 'INBOX',
                        hasPassword: Boolean(row.imap?.pass),
                    },
                }))
                : [];
            return res.json({ ...cfg, mailboxes: sanitizedMailboxes, settings: { ...(normalized.settings || {}), mailboxes: sanitizedMailboxes } });
        }
        return res.json((0, mail_integration_1.getPublicMailConfig)());
    }
    catch (err) {
        console.error('mail_config_load_failed', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed to load mail configuration' });
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
async function startOAuth(req, res) {
    try {
        const providerRaw = String(req.params?.provider || '').trim().toLowerCase();
        const provider = providerRaw === 'gmail' || providerRaw === 'outlook' || providerRaw === 'zoho'
            ? providerRaw
            : '';
        if (!provider)
            return res.status(400).json({ error: 'Unsupported OAuth provider' });
        const mailboxId = String(req.query?.mailboxId || '').trim();
        const url = buildOauthStartUrl(provider, mailboxId);
        return res.json({ url });
    }
    catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'Failed to start OAuth flow' });
    }
}
exports.startOAuth = startOAuth;
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
        const stored = await loadStoredMailSettings();
        const storedNormalized = stored ? normalizeStoredMailSettings(stored) : null;
        let migratedLegacyMailbox = false;
        let supportMailboxAdded = false;
        if (Array.isArray(incoming.mailboxes) && incoming.mailboxes.length === 0) {
            const existingMailboxes = Array.isArray(storedNormalized?.mailboxes) ? storedNormalized.mailboxes : [];
            if (existingMailboxes.length) {
                incoming.mailboxes = existingMailboxes;
                incoming.settings = { ...(incoming.settings || {}), mailboxes: existingMailboxes };
            }
            else {
                const envSupport = String(process.env.MAIL_TICKET_INGEST_ADDRESS
                    || process.env.SMTP_FROM
                    || process.env.SMTP_USER
                    || process.env.IMAP_USER
                    || '').trim();
                const mergedLegacy = {
                    ...storedNormalized,
                    ...incoming,
                    smtp: { ...(storedNormalized?.smtp || {}), ...(incoming.smtp || {}) },
                    imap: { ...(storedNormalized?.imap || {}), ...(incoming.imap || {}) },
                    inbound: { ...(storedNormalized?.inbound || {}), ...(incoming.inbound || {}) },
                    settings: { ...(storedNormalized?.settings || {}), ...(incoming.settings || {}) },
                };
                const legacyMailbox = buildLegacyMailbox(mergedLegacy, envSupport);
                if (legacyMailbox) {
                    incoming.mailboxes = [legacyMailbox];
                    incoming.settings = { ...(incoming.settings || {}), mailboxes: incoming.mailboxes };
                    migratedLegacyMailbox = true;
                    logMailMigration('legacy-mailbox-migrated', { mailbox: legacyMailbox.email });
                }
            }
        }
        if (!migratedLegacyMailbox && Array.isArray(incoming.mailboxes) && incoming.mailboxes.length) {
            const supportCandidate = String(incoming.settings?.supportMail
                || incoming.settings?.inboundEmailAddress
                || process.env.MAIL_TICKET_INGEST_ADDRESS
                || process.env.SMTP_FROM
                || process.env.SMTP_USER
                || process.env.IMAP_USER
                || '').trim().toLowerCase();
            if (supportCandidate) {
                const hasSupportIncoming = incoming.mailboxes.some((row) => String(row?.email || '').trim().toLowerCase() === supportCandidate);
                const hasSupportStored = Array.isArray(storedNormalized?.mailboxes)
                    ? storedNormalized.mailboxes.some((row) => String(row?.email || '').trim().toLowerCase() === supportCandidate)
                    : false;
                if (hasSupportIncoming && !hasSupportStored) {
                    supportMailboxAdded = true;
                    logMailMigration('support-mailbox-added', { mailbox: supportCandidate });
                }
            }
        }
        if ((migratedLegacyMailbox || supportMailboxAdded) && Array.isArray(incoming.mailboxes) && incoming.mailboxes.length) {
            const fallbackQueue = String(incoming.inbound?.defaultQueue || incoming.mailboxes[0]?.queue || 'Support Team').trim() || 'Support Team';
            incoming.inbound = buildRoutingFromMailboxes(incoming.mailboxes, fallbackQueue);
            logMailMigration('routing-rebuilt', { reason: migratedLegacyMailbox ? 'legacy-migration' : 'support-mailbox-added' });
        }
        if (Array.isArray(incoming.mailboxes)) {
            assertUniqueMailboxes(incoming.mailboxes);
            const storedMailboxes = Array.isArray(storedNormalized?.mailboxes) ? storedNormalized.mailboxes : [];
            const findStored = (row) => {
                const id = String(row?.id || '').trim();
                if (id)
                    return storedMailboxes.find((s) => String(s?.id || '').trim() === id);
                const email = String(row?.email || '').trim().toLowerCase();
                if (!email)
                    return undefined;
                return storedMailboxes.find((s) => String(s?.email || '').trim().toLowerCase() === email);
            };
            const mergedMailboxes = incoming.mailboxes.map((row) => {
                const prev = findStored(row) || {};
                const mergedSmtp = {
                    ...prev.smtp,
                    ...row.smtp,
                    pass: String(row?.smtp?.pass || '').trim() || String(prev?.smtp?.pass || '').trim(),
                };
                const mergedImap = {
                    ...prev.imap,
                    ...row.imap,
                    pass: String(row?.imap?.pass || '').trim() || String(prev?.imap?.pass || '').trim(),
                };
                const mergedOauth = {
                    ...prev.oauth,
                    ...row.oauth,
                    refreshToken: String(row?.oauth?.refreshToken || '').trim() || String(prev?.oauth?.refreshToken || '').trim(),
                    accessToken: String(row?.oauth?.accessToken || '').trim() || String(prev?.oauth?.accessToken || '').trim(),
                    expiresAt: String(row?.oauth?.expiresAt || '').trim() || String(prev?.oauth?.expiresAt || '').trim(),
                    tokenType: String(row?.oauth?.tokenType || '').trim() || String(prev?.oauth?.tokenType || '').trim(),
                    scope: String(row?.oauth?.scope || '').trim() || String(prev?.oauth?.scope || '').trim(),
                };
                return {
                    ...prev,
                    ...row,
                    smtp: mergedSmtp,
                    imap: mergedImap,
                    oauth: mergedOauth,
                };
            });
            incoming.mailboxes = mergedMailboxes;
            incoming.settings = { ...(incoming.settings || {}), mailboxes: mergedMailboxes };
            (0, mail_integration_1.setMailboxConfigs)(mergedMailboxes);
        }
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
        const sanitizedMailboxes = Array.isArray(incoming.mailboxes)
            ? incoming.mailboxes.map((row) => ({
                id: row.id,
                email: row.email,
                queue: row.queue,
                provider: row.provider,
                connectionMode: row.connectionMode,
                oauthConnected: Boolean(row?.oauth?.refreshToken || row?.oauth?.accessToken || row?.oauthConnected),
                oauthTokenExpiry: String(row?.oauth?.expiresAt || row?.oauthTokenExpiry || ''),
                smtp: {
                    host: row.smtp?.host || '',
                    port: row.smtp?.port,
                    secure: Boolean(row.smtp?.secure),
                    user: row.smtp?.user || '',
                    from: row.smtp?.from || '',
                    hasPassword: Boolean(row.smtp?.pass),
                },
                imap: {
                    host: row.imap?.host || '',
                    port: row.imap?.port,
                    secure: Boolean(row.imap?.secure),
                    user: row.imap?.user || '',
                    mailbox: row.imap?.mailbox || 'INBOX',
                    hasPassword: Boolean(row.imap?.pass),
                },
            }))
            : [];
        return res.json({ ...cfg, mailboxes: sanitizedMailboxes, settings: { ...(incoming.settings || {}), mailboxes: sanitizedMailboxes } });
    }
    catch (err) {
        console.error('mail_config_update_failed', err);
        return res.status(err.status || 500).json({ error: err.message || 'Failed to update mail configuration' });
    }
}
exports.updateConfig = updateConfig;
