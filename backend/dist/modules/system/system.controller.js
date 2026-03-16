"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAssetTypesSettings = exports.getAssetTypesSettings = exports.cancelAccount = exports.exportAccountData = exports.updateAccountSettings = exports.getAccountSettings = exports.updateSecuritySettings = exports.getSecuritySettings = exports.testDatabaseConfig = exports.getDatabaseConfig = void 0;
const pg_1 = require("pg");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("../../db");
const DEFAULT_SECURITY_SETTINGS = {
    loginMethods: {
        password: true,
        passwordless: false,
        googleSso: false,
        sso: false,
    },
    ipRangeRestriction: {
        enabled: false,
        ranges: [],
    },
    sessionTimeoutMinutes: 60,
    requireAuthForPublicUrls: true,
    ticketSharing: {
        publicLinks: true,
        shareOutsideGroup: false,
        allowRequesterShare: true,
        requesterShareScope: 'any',
    },
    adminNotifications: {
        adminUserId: null,
    },
    attachmentFileTypes: {
        mode: 'all',
        types: [],
    },
};
const resolveAppVersion = () => {
    const envVersion = String(process.env.APP_VERSION || process.env.npm_package_version || '').trim();
    if (envVersion)
        return envVersion;
    const tryPaths = [
        path_1.default.resolve(process.cwd(), 'package.json'),
        path_1.default.resolve(process.cwd(), '..', 'package.json'),
    ];
    for (const candidate of tryPaths) {
        try {
            if (!fs_1.default.existsSync(candidate))
                continue;
            const parsed = JSON.parse(fs_1.default.readFileSync(candidate, 'utf8'));
            const version = String(parsed?.version || '').trim();
            if (version)
                return version;
        }
        catch {
            // ignore and continue
        }
    }
    return '1.0.0';
};
const DEFAULT_ACCOUNT_SETTINGS = {
    accountName: 'ITSM Workspace',
    currentPlan: 'Standard',
    activeSince: '',
    assetsCount: 0,
    agentsCount: 0,
    dataCenter: 'US-East',
    version: resolveAppVersion(),
    contact: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        invoiceEmail: '',
        invoiceCc: '',
    },
};
const DEFAULT_ASSET_TYPES_SETTINGS = {
    types: [],
};
function toBool(value, fallback = false) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
function parseDbConfigFromUrl(connectionString) {
    try {
        const url = new URL(connectionString);
        const database = String(url.pathname || '').replace(/^\/+/, '');
        const sslMode = String(url.searchParams.get('sslmode') || '').trim().toLowerCase();
        return {
            connectionString,
            host: String(url.hostname || '').trim(),
            port: Number(url.port || 5432),
            database,
            user: decodeURIComponent(String(url.username || '').trim()),
            ssl: ['require', 'verify-ca', 'verify-full'].includes(sslMode),
            hasPassword: Boolean(String(url.password || '').trim()),
        };
    }
    catch {
        return {
            connectionString,
            host: '',
            port: 5432,
            database: '',
            user: '',
            ssl: false,
            hasPassword: false,
        };
    }
}
function buildDbConnectionString(input) {
    const raw = String(input?.connectionString || '').trim();
    if (raw)
        return raw;
    const host = String(input?.host || '').trim();
    const port = Number(input?.port || 5432) || 5432;
    const database = String(input?.database || '').trim();
    const user = String(input?.user || '').trim();
    const password = String(input?.password || '').trim();
    const ssl = toBool(input?.ssl, false);
    if (!host)
        throw { status: 400, message: 'Database host is required' };
    if (!database)
        throw { status: 400, message: 'Database name is required' };
    if (!user)
        throw { status: 400, message: 'Database user is required' };
    const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
    const sslSuffix = ssl ? '?sslmode=require' : '';
    return `postgresql://${auth}@${host}:${port}/${database}${sslSuffix}`;
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
function normalizeList(value) {
    if (Array.isArray(value)) {
        return value.map((v) => String(v || '').trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(/[\n,]+/g)
            .map((v) => v.trim())
            .filter(Boolean);
    }
    return [];
}
function normalizeSecuritySettings(input) {
    const raw = input || {};
    const loginRaw = raw.loginMethods || {};
    const loginMethods = {
        password: toBool(loginRaw.password, true),
        passwordless: toBool(loginRaw.passwordless, false),
        googleSso: toBool(loginRaw.googleSso, false),
        sso: toBool(loginRaw.sso, false),
    };
    if (!loginMethods.password && !loginMethods.passwordless && !loginMethods.googleSso && !loginMethods.sso) {
        loginMethods.password = true;
    }
    const ipRanges = normalizeList(raw.ipRangeRestriction?.ranges);
    const sessionTimeoutMinutes = Math.max(5, Math.min(1440, Number(raw.sessionTimeoutMinutes || 60) || 60));
    const requesterShareScope = String(raw.ticketSharing?.requesterShareScope || 'any').toLowerCase() === 'department'
        ? 'department'
        : 'any';
    const attachmentMode = String(raw.attachmentFileTypes?.mode || 'all') === 'specific' ? 'specific' : 'all';
    const attachmentTypes = attachmentMode === 'specific' ? normalizeList(raw.attachmentFileTypes?.types) : [];
    return {
        loginMethods,
        ipRangeRestriction: {
            enabled: toBool(raw.ipRangeRestriction?.enabled, false),
            ranges: ipRanges,
        },
        sessionTimeoutMinutes,
        requireAuthForPublicUrls: toBool(raw.requireAuthForPublicUrls, true),
        ticketSharing: {
            publicLinks: toBool(raw.ticketSharing?.publicLinks, true),
            shareOutsideGroup: toBool(raw.ticketSharing?.shareOutsideGroup, false),
            allowRequesterShare: toBool(raw.ticketSharing?.allowRequesterShare, true),
            requesterShareScope,
        },
        adminNotifications: {
            adminUserId: raw.adminNotifications?.adminUserId
                ? String(raw.adminNotifications.adminUserId || '').trim() || null
                : null,
        },
        attachmentFileTypes: {
            mode: attachmentMode,
            types: attachmentTypes,
        },
    };
}
function normalizeAccountSettings(input) {
    const raw = input || {};
    const contact = raw.contact || {};
    return {
        accountName: String(raw.accountName || DEFAULT_ACCOUNT_SETTINGS.accountName).trim(),
        currentPlan: String(raw.currentPlan || DEFAULT_ACCOUNT_SETTINGS.currentPlan).trim(),
        activeSince: String(raw.activeSince || '').trim(),
        assetsCount: Number(raw.assetsCount || 0) || 0,
        agentsCount: Number(raw.agentsCount || 0) || 0,
        dataCenter: String(raw.dataCenter || DEFAULT_ACCOUNT_SETTINGS.dataCenter).trim(),
        version: resolveAppVersion(),
        contact: {
            firstName: String(contact.firstName || '').trim(),
            lastName: String(contact.lastName || '').trim(),
            email: String(contact.email || '').trim(),
            phone: String(contact.phone || '').trim(),
            invoiceEmail: String(contact.invoiceEmail || '').trim(),
            invoiceCc: String(contact.invoiceCc || '').trim(),
        },
    };
}
const ASSET_FIELD_TYPES = new Set(['text', 'number', 'date', 'select', 'textarea', 'boolean']);
function slugifyKey(value) {
    const normalized = String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    return normalized || `field_${Date.now()}`;
}
function normalizeAssetField(raw, fallbackId) {
    const label = String(raw?.label || raw?.name || '').trim();
    if (!label)
        return null;
    const type = ASSET_FIELD_TYPES.has(String(raw?.type || '').toLowerCase())
        ? String(raw.type).toLowerCase()
        : 'text';
    const options = type === 'select'
        ? normalizeList(raw?.options)
        : [];
    const key = slugifyKey(raw?.key || label);
    return {
        id: String(raw?.id || fallbackId || `af-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        label,
        key,
        type: type,
        required: toBool(raw?.required, false),
        options,
    };
}
function normalizeAssetType(raw) {
    const label = String(raw?.label || raw?.name || '').trim();
    if (!label)
        return null;
    const fieldsRaw = Array.isArray(raw?.fields) ? raw.fields : [];
    const fields = [];
    const seenKeys = new Set();
    for (const field of fieldsRaw) {
        const normalized = normalizeAssetField(field);
        if (!normalized)
            continue;
        let key = normalized.key;
        if (seenKeys.has(key)) {
            key = `${key}_${fields.length + 1}`;
        }
        seenKeys.add(key);
        fields.push({ ...normalized, key });
    }
    return {
        id: String(raw?.id || `at-${Date.now()}-${Math.random().toString(16).slice(2)}`),
        label,
        description: String(raw?.description || '').trim(),
        parentId: raw?.parentId ? String(raw.parentId).trim() : null,
        icon: String(raw?.icon || '').trim(),
        fields,
    };
}
function normalizeAssetTypesSettings(input) {
    const rawTypes = Array.isArray(input?.types) ? input.types : [];
    const normalized = [];
    const seenLabels = new Set();
    for (const raw of rawTypes) {
        const type = normalizeAssetType(raw);
        if (!type)
            continue;
        const key = type.label.toLowerCase();
        if (seenLabels.has(key))
            continue;
        seenLabels.add(key);
        normalized.push(type);
    }
    return {
        types: normalized,
    };
}
async function getSystemSetting(key) {
    await ensureSystemSettingsTable();
    const rows = await (0, db_1.query)('SELECT value FROM system_settings WHERE key = $1', [key]);
    return rows[0]?.value ?? null;
}
async function saveSystemSetting(key, value) {
    await ensureSystemSettingsTable();
    await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, value]);
}
async function getDatabaseConfig(_req, res) {
    const fromEnv = String(process.env.DATABASE_URL || '').trim();
    const cfg = parseDbConfigFromUrl(fromEnv);
    return res.json({
        host: cfg.host,
        port: cfg.port,
        database: cfg.database,
        user: cfg.user,
        ssl: cfg.ssl,
        hasPassword: cfg.hasPassword,
        hasConnectionString: Boolean(cfg.connectionString),
    });
}
exports.getDatabaseConfig = getDatabaseConfig;
async function testDatabaseConfig(req, res) {
    let pool = null;
    try {
        const rawConnectionString = String(req.body?.connectionString || '').trim();
        const manualPassword = typeof req.body?.password === 'string' ? req.body.password : '';
        const connectionString = buildDbConnectionString(req.body || {});
        const parsed = parseDbConfigFromUrl(connectionString);
        if (rawConnectionString && !parsed.hasPassword && !manualPassword) {
            throw {
                status: 400,
                message: 'Connection string password is missing. Add password in the URL or use the Password field.',
            };
        }
        const started = Date.now();
        const poolOptions = {
            connectionString,
            max: 1,
            connectionTimeoutMillis: 6000,
            idleTimeoutMillis: 1000,
            ssl: parsed.ssl ? { rejectUnauthorized: false } : undefined,
        };
        // Ensure password is always a string in manual mode; optionally allow overriding URL password.
        if (!rawConnectionString || manualPassword) {
            poolOptions.password = manualPassword;
        }
        pool = new pg_1.Pool(poolOptions);
        const rows = await pool.query('SELECT NOW()::text AS now');
        const latencyMs = Date.now() - started;
        return res.json({
            ok: true,
            host: parsed.host,
            port: parsed.port,
            database: parsed.database,
            user: parsed.user,
            ssl: parsed.ssl,
            latencyMs,
            serverTime: rows.rows?.[0]?.now || null,
        });
    }
    catch (err) {
        return res.status(err.status || 500).json({ error: err.message || 'Database connection test failed' });
    }
    finally {
        if (pool) {
            try {
                await pool.end();
            }
            catch { }
        }
    }
}
exports.testDatabaseConfig = testDatabaseConfig;
async function getSecuritySettings(_req, res) {
    try {
        await ensureSystemSettingsTable();
        const rows = await (0, db_1.query)('SELECT value FROM system_settings WHERE key = $1', ['security.settings']);
        const stored = rows[0]?.value;
        const normalized = stored ? normalizeSecuritySettings(stored) : DEFAULT_SECURITY_SETTINGS;
        return res.json(normalized);
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to load security settings' });
    }
}
exports.getSecuritySettings = getSecuritySettings;
async function updateSecuritySettings(req, res) {
    try {
        await ensureSystemSettingsTable();
        const next = normalizeSecuritySettings(req.body || {});
        await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['security.settings', next]);
        return res.json(next);
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to update security settings' });
    }
}
exports.updateSecuritySettings = updateSecuritySettings;
async function getAccountSettings(_req, res) {
    try {
        await ensureSystemSettingsTable();
        const rows = await (0, db_1.query)('SELECT value FROM system_settings WHERE key = $1', ['account.settings']);
        const stored = rows[0]?.value;
        const normalized = stored ? normalizeAccountSettings(stored) : DEFAULT_ACCOUNT_SETTINGS;
        return res.json(normalized);
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to load account settings' });
    }
}
exports.getAccountSettings = getAccountSettings;
async function updateAccountSettings(req, res) {
    try {
        await ensureSystemSettingsTable();
        const next = normalizeAccountSettings(req.body || {});
        await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['account.settings', next]);
        return res.json(next);
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to update account settings' });
    }
}
exports.updateAccountSettings = updateAccountSettings;
async function exportAccountData(_req, res) {
    try {
        await ensureSystemSettingsTable();
        await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['account.export', { requestedAt: new Date().toISOString() }]);
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to request export' });
    }
}
exports.exportAccountData = exportAccountData;
async function cancelAccount(_req, res) {
    try {
        await ensureSystemSettingsTable();
        await (0, db_1.query)(`INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, ['account.cancel', { requestedAt: new Date().toISOString() }]);
        return res.json({ ok: true });
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to request cancellation' });
    }
}
exports.cancelAccount = cancelAccount;
async function getAssetTypesSettings(_req, res) {
    try {
        const stored = await getSystemSetting('asset.types');
        const normalized = stored ? normalizeAssetTypesSettings(stored) : DEFAULT_ASSET_TYPES_SETTINGS;
        return res.json(normalized);
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to load asset types' });
    }
}
exports.getAssetTypesSettings = getAssetTypesSettings;
async function updateAssetTypesSettings(req, res) {
    try {
        const next = normalizeAssetTypesSettings(req.body || {});
        await saveSystemSetting('asset.types', next);
        return res.json(next);
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Failed to update asset types' });
    }
}
exports.updateAssetTypesSettings = updateAssetTypesSettings;
