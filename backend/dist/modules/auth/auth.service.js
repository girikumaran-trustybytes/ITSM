"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeSsoCallback = exports.loginWithSsoCode = exports.refresh = exports.changePassword = exports.resetPassword = exports.forgotPassword = exports.verifyMfa = exports.loginWithGoogle = exports.login = exports.resetAuthenticator = exports.verifyAuthenticatorSetup = exports.setupAuthenticator = exports.requestMfaChallenge = exports.setUserMfaEnabled = exports.getUserMfaState = exports.updateMfaPolicy = exports.getMfaPolicy = exports.getSsoStartUrl = exports.getSsoConfig = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../../db");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mail_integration_1 = require("../../services/mail.integration");
const policy_1 = require("../../common/authz/policy");
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7);
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_HOSTED_DOMAIN = String(process.env.GOOGLE_HOSTED_DOMAIN || '').trim().toLowerCase();
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim();
const ZOHO_CLIENT_ID = String(process.env.ZOHO_CLIENT_ID || '').trim();
const ZOHO_CLIENT_SECRET = String(process.env.ZOHO_CLIENT_SECRET || '').trim();
const ZOHO_HOSTED_DOMAIN = String(process.env.ZOHO_HOSTED_DOMAIN || '').trim().toLowerCase();
const ZOHO_ACCOUNTS_BASE = String(process.env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com').trim().replace(/\/+$/, '');
const MS_CLIENT_ID = String(process.env.MS_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '').trim();
const MS_CLIENT_SECRET = String(process.env.MS_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '').trim();
const MS_TENANT_ID = String(process.env.MS_TENANT_ID || process.env.MICROSOFT_TENANT_ID || 'common').trim();
const MS_HOSTED_DOMAIN = String(process.env.MS_HOSTED_DOMAIN || process.env.MICROSOFT_HOSTED_DOMAIN || '').trim().toLowerCase();
const BACKEND_PUBLIC_URL = String(process.env.BACKEND_PUBLIC_URL || 'http://localhost:5000').trim().replace(/\/+$/, '');
const SSO_STATE_TTL_MIN = Math.max(5, Number(process.env.SSO_STATE_TTL_MIN || 10));
const RESET_TOKEN_TTL_MIN = 30;
const MFA_CODE_TTL_MIN = Number(process.env.MFA_CODE_TTL_MIN || 10);
const MFA_REQUIRED_FOR_GOOGLE = String(process.env.MFA_REQUIRED_FOR_GOOGLE || 'false').toLowerCase() === 'true';
const TOKEN_PEPPER = process.env.AUTH_TOKEN_PEPPER || ACCESS_SECRET;
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const MFA_TRUSTED_DAYS = Math.max(1, Number(process.env.MFA_TRUSTED_DEVICE_DAYS || 30));
const MFA_ISSUER = String(process.env.MFA_ISSUER || 'TB ITSM').trim() || 'TB ITSM';
function htmlEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
function formatIstDate(date) {
    const day = new Intl.DateTimeFormat('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'Asia/Kolkata',
    }).format(date);
    const time = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata',
    }).format(date);
    return `${day} at ${time} IST`;
}
function passwordResetMailContext() {
    const appName = String(process.env.APPLICATION_NAME || process.env.APP_NAME || 'TB ITSM').trim() || 'TB ITSM';
    const supportTeamName = String(process.env.RESET_SENDER_NAME || `${appName} Support Team`).trim() || `${appName} Support Team`;
    const supportEmail = String(process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || '').trim();
    const from = String(process.env.APPLICATION_BASE_MAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@itsm.local').trim();
    return { appName, supportTeamName, supportEmail, from };
}
function toGreetingName(name) {
    const trimmed = String(name || '').trim();
    if (!trimmed)
        return 'User';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
let authSchemaInit = null;
function nowPlusMinutes(minutes) {
    return new Date(Date.now() + Math.max(1, minutes) * 60 * 1000);
}
function safeDisplayName(user) {
    return String(user.name || '').trim() || user.email;
}
function hashOpaqueToken(raw) {
    return (0, crypto_1.createHash)('sha256').update(`${raw}:${TOKEN_PEPPER}`).digest('hex');
}
function normalizeEmail(input) {
    return String(input || '').trim().toLowerCase();
}
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
function normalizeMfaMethod(input) {
    const normalized = String(input || '').trim().toLowerCase();
    if (normalized === 'fido2 key' || normalized === 'fido2')
        return 'FIDO2 Key';
    if (normalized === 'sms otp' || normalized === 'sms')
        return 'SMS OTP';
    return 'Authenticator App';
}
function normalizeGraceDays(input) {
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0)
        return 0;
    return Math.floor(parsed);
}
function randomNumericCode(length = 6) {
    const max = 10 ** length;
    const n = Math.floor(Math.random() * max);
    return String(n).padStart(length, '0');
}
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function bytesToBase32(input) {
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of input) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0)
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    return output;
}
function base32ToBytes(value) {
    const clean = String(value || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
    let bits = 0;
    let acc = 0;
    const out = [];
    for (const ch of clean) {
        const idx = BASE32_ALPHABET.indexOf(ch);
        if (idx < 0)
            continue;
        acc = (acc << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((acc >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}
function randomBase32Secret(bytes = 20) {
    return bytesToBase32((0, crypto_1.randomBytes)(bytes));
}
function computeTotp(secretBase32, timeMs = Date.now(), stepSec = 30, digits = 6) {
    const secret = base32ToBytes(secretBase32);
    if (!secret.length)
        return '';
    const counter = Math.floor(timeMs / 1000 / stepSec);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
    counterBuf.writeUInt32BE(counter >>> 0, 4);
    const digest = (0, crypto_1.createHmac)('sha1', secret).update(counterBuf).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const code = (((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)) % (10 ** digits);
    return String(code).padStart(digits, '0');
}
function verifyTotpCode(secretBase32, code, windowSteps = 1) {
    const normalized = String(code || '').trim();
    if (!/^\d{6}$/.test(normalized))
        return false;
    for (let offset = -windowSteps; offset <= windowSteps; offset += 1) {
        const t = Date.now() + offset * 30 * 1000;
        if (computeTotp(secretBase32, t) === normalized)
            return true;
    }
    return false;
}
function maskEmail(email) {
    const safe = String(email || '').trim().toLowerCase();
    const [local, domain] = safe.split('@');
    if (!local || !domain)
        return safe;
    const visible = local.slice(0, Math.min(2, local.length));
    const masked = '*'.repeat(Math.max(3, local.length - visible.length));
    return `${visible}${masked}@${domain}`;
}
async function ensureAuthSchema() {
    if (!authSchemaInit) {
        authSchemaInit = (async () => {
            await (0, db_1.query)('CREATE EXTENSION IF NOT EXISTS pgcrypto');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN DEFAULT FALSE');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleSub" VARCHAR(255)');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zohoSub" VARCHAR(255)');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "microsoftSub" VARCHAR(255)');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaTotpSecret" TEXT');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaTotpTempSecret" TEXT');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaTotpEnabled" BOOLEAN DEFAULT FALSE');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT FALSE');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3)');
            await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
          "id" BIGSERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "tokenHash" TEXT NOT NULL UNIQUE,
          "expiresAt" TIMESTAMP NOT NULL,
          "consumed" BOOLEAN NOT NULL DEFAULT FALSE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON "PasswordResetToken"("userId")');
            await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS "MfaChallenge" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "codeHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMP NOT NULL,
          "consumed" BOOLEAN NOT NULL DEFAULT FALSE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
            await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS "MfaPolicy" (
          "id" INTEGER PRIMARY KEY CHECK ("id" = 1),
          "mfaRequiredForPrivilegedRoles" BOOLEAN NOT NULL DEFAULT FALSE,
          "primaryMfaMethod" TEXT NOT NULL DEFAULT 'Authenticator App',
          "enrollmentGracePeriodDays" INTEGER NOT NULL DEFAULT 0,
          "allowEmergencyBypass" BOOLEAN NOT NULL DEFAULT FALSE,
          "isConfigured" BOOLEAN NOT NULL DEFAULT FALSE,
          "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
            await (0, db_1.query)('ALTER TABLE "MfaPolicy" ADD COLUMN IF NOT EXISTS "isConfigured" BOOLEAN NOT NULL DEFAULT FALSE');
            await (0, db_1.query)(`INSERT INTO "MfaPolicy" (
          "id",
          "mfaRequiredForPrivilegedRoles",
          "primaryMfaMethod",
          "enrollmentGracePeriodDays",
          "allowEmergencyBypass",
          "isConfigured"
        )
        VALUES (1, FALSE, 'Authenticator App', 0, FALSE, FALSE)
        ON CONFLICT ("id") DO NOTHING`);
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_mfa_challenge_user_id ON "MfaChallenge"("userId")');
            await (0, db_1.query)(`CREATE TABLE IF NOT EXISTS "MfaTrustedDevice" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "tokenHash" TEXT NOT NULL UNIQUE,
          "label" TEXT,
          "expiresAt" TIMESTAMP NOT NULL,
          "lastUsedAt" TIMESTAMP,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_mfa_trusted_device_user_id ON "MfaTrustedDevice"("userId")');
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_user_google_sub ON "User"("googleSub")');
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_user_zoho_sub ON "User"("zohoSub")');
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_user_microsoft_sub ON "User"("microsoftSub")');
        })();
    }
    await authSchemaInit;
}
function ssoRedirectUri(provider) {
    const envKey = provider === 'google' ? 'GOOGLE_REDIRECT_URI' : provider === 'zoho' ? 'ZOHO_REDIRECT_URI' : 'MS_REDIRECT_URI';
    const fromEnv = String(process.env[envKey] || '').trim();
    if (fromEnv)
        return fromEnv;
    return `${BACKEND_PUBLIC_URL}/api/auth/sso/${provider}/callback`;
}
function isSsoProviderEnabled(provider) {
    if (provider === 'google')
        return Boolean(GOOGLE_CLIENT_ID);
    if (provider === 'zoho')
        return Boolean(ZOHO_CLIENT_ID);
    return Boolean(MS_CLIENT_ID);
}
function signSsoState(provider, rememberMe) {
    return jsonwebtoken_1.default.sign({ type: 'sso-state', provider, rememberMe: Boolean(rememberMe) }, ACCESS_SECRET, { expiresIn: `${SSO_STATE_TTL_MIN}m` });
}
function verifySsoState(state) {
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(state, ACCESS_SECRET);
    }
    catch (_err) {
        throw new Error('Invalid or expired SSO state');
    }
    const provider = String(payload?.provider || '');
    if (!payload || payload.type !== 'sso-state' || !['google', 'zoho', 'outlook'].includes(provider)) {
        throw new Error('Invalid SSO state');
    }
    return { provider, rememberMe: Boolean(payload.rememberMe) };
}
function decodeJwtPayload(token) {
    const parts = String(token || '').split('.');
    if (parts.length < 2)
        return {};
    try {
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    }
    catch {
        return {};
    }
}
async function postForm(url, body) {
    const encoded = new URLSearchParams(body);
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: encoded.toString(),
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `SSO token exchange failed (${res.status})`);
    }
    return res.json();
}
async function getJson(url, bearerToken) {
    const res = await fetch(url, {
        headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `SSO profile fetch failed (${res.status})`);
    }
    return res.json();
}
function assertHostedDomain(provider, hd) {
    const value = String(hd || '').trim().toLowerCase();
    if (provider === 'google' && GOOGLE_HOSTED_DOMAIN && value !== GOOGLE_HOSTED_DOMAIN) {
        throw new Error(`Google account must belong to ${GOOGLE_HOSTED_DOMAIN}`);
    }
    if (provider === 'zoho' && ZOHO_HOSTED_DOMAIN && value !== ZOHO_HOSTED_DOMAIN) {
        throw new Error(`Zoho account must belong to ${ZOHO_HOSTED_DOMAIN}`);
    }
    if (provider === 'outlook' && MS_HOSTED_DOMAIN && value !== MS_HOSTED_DOMAIN) {
        throw new Error(`Outlook account must belong to ${MS_HOSTED_DOMAIN}`);
    }
}
async function exchangeCodeForIdentity(provider, code) {
    const redirectUri = ssoRedirectUri(provider);
    if (provider === 'google') {
        if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET)
            throw new Error('Google SSO is not configured');
        const token = await postForm('https://oauth2.googleapis.com/token', {
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        });
        const profile = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token.access_token);
        const email = normalizeEmail(profile.email || '');
        if (!email)
            throw new Error('Google account email is missing');
        if (String(profile.email_verified || '').toLowerCase() !== 'true')
            throw new Error('Google account email is not verified');
        assertHostedDomain('google', profile.hd);
        return {
            provider: 'google',
            sub: String(profile.sub || ''),
            email,
            givenName: String(profile.given_name || ''),
            familyName: String(profile.family_name || ''),
            picture: String(profile.picture || ''),
            emailVerified: true,
            hostedDomain: String(profile.hd || ''),
        };
    }
    if (provider === 'zoho') {
        if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET)
            throw new Error('Zoho SSO is not configured');
        const token = await postForm(`${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`, {
            code,
            client_id: ZOHO_CLIENT_ID,
            client_secret: ZOHO_CLIENT_SECRET,
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        });
        let profile = {};
        try {
            profile = await getJson(`${ZOHO_ACCOUNTS_BASE}/oauth/user/info`, token.access_token);
        }
        catch {
            profile = decodeJwtPayload(String(token.id_token || ''));
        }
        const email = normalizeEmail(profile.Email || profile.email || '');
        if (!email)
            throw new Error('Zoho account email is missing');
        const domain = email.includes('@') ? email.split('@')[1] : '';
        assertHostedDomain('zoho', domain);
        return {
            provider: 'zoho',
            sub: String(profile.ZUID || profile.sub || email),
            email,
            givenName: String(profile.First_Name || profile.given_name || ''),
            familyName: String(profile.Last_Name || profile.family_name || ''),
            picture: String(profile.picture || ''),
            emailVerified: true,
            hostedDomain: domain,
        };
    }
    if (!MS_CLIENT_ID || !MS_CLIENT_SECRET)
        throw new Error('Outlook SSO is not configured');
    const token = await postForm(`https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/token`, {
        code,
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
    });
    let profile = {};
    try {
        profile = await getJson('https://graph.microsoft.com/oidc/userinfo', token.access_token);
    }
    catch {
        profile = decodeJwtPayload(String(token.id_token || ''));
    }
    const email = normalizeEmail(profile.email || profile.preferred_username || profile.upn || '');
    if (!email)
        throw new Error('Outlook account email is missing');
    const domain = email.includes('@') ? email.split('@')[1] : '';
    assertHostedDomain('outlook', profile.hd || profile.tid || domain);
    return {
        provider: 'outlook',
        sub: String(profile.sub || profile.oid || email),
        email,
        givenName: String(profile.given_name || ''),
        familyName: String(profile.family_name || ''),
        picture: String(profile.picture || ''),
        emailVerified: true,
        hostedDomain: domain,
    };
}
function buildSsoAuthorizationUrl(provider, rememberMe) {
    if (!isSsoProviderEnabled(provider))
        throw new Error(`${provider} SSO is not configured`);
    const redirectUri = ssoRedirectUri(provider);
    const state = signSsoState(provider, rememberMe);
    if (provider === 'google') {
        const params = new URLSearchParams({
            client_id: GOOGLE_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state,
            prompt: 'select_account',
        });
        if (GOOGLE_HOSTED_DOMAIN)
            params.set('hd', GOOGLE_HOSTED_DOMAIN);
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }
    if (provider === 'zoho') {
        const params = new URLSearchParams({
            client_id: ZOHO_CLIENT_ID,
            redirect_uri: redirectUri,
            response_type: 'code',
            scope: 'openid profile email',
            access_type: 'offline',
            state,
            prompt: 'consent',
        });
        return `${ZOHO_ACCOUNTS_BASE}/oauth/v2/auth?${params.toString()}`;
    }
    const params = new URLSearchParams({
        client_id: MS_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope: 'openid profile email User.Read',
        state,
        prompt: 'select_account',
    });
    return `https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/authorize?${params.toString()}`;
}
function getSsoConfig() {
    const providers = [
        { provider: 'google', enabled: isSsoProviderEnabled('google'), label: 'Google' },
        { provider: 'zoho', enabled: isSsoProviderEnabled('zoho'), label: 'Zoho' },
        { provider: 'outlook', enabled: isSsoProviderEnabled('outlook'), label: 'Outlook' },
    ];
    return {
        providers: providers.map((p) => ({
            ...p,
            loginUrl: p.enabled ? `/api/auth/sso/${p.provider}/start` : undefined,
        })),
    };
}
exports.getSsoConfig = getSsoConfig;
function getSsoStartUrl(provider, rememberMe = true) {
    return buildSsoAuthorizationUrl(provider, rememberMe);
}
exports.getSsoStartUrl = getSsoStartUrl;
function resolvePrimaryRole(roles, fallbackRole) {
    const normalizedRoles = roles
        .map((role) => String(role || '').trim().toUpperCase())
        .filter((role) => role.length > 0);
    const fallback = String(fallbackRole || '').trim().toUpperCase();
    const allCandidates = fallback ? Array.from(new Set([...normalizedRoles, fallback])) : normalizedRoles;
    if (allCandidates.includes('ADMIN'))
        return 'ADMIN';
    if (allCandidates.includes('AGENT'))
        return 'AGENT';
    if (allCandidates.includes('USER'))
        return 'USER';
    return allCandidates[0] || 'USER';
}
async function getAssignedRoles(user) {
    const mergedRoles = [];
    try {
        const roleRows = await (0, db_1.query)('SELECT r.role_name FROM roles r INNER JOIN user_roles ur ON r.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.role_id ASC', [user.id]);
        if (roleRows.length > 0) {
            mergedRoles.push(...roleRows
                .map((row) => String(row?.role_name || '').trim().toUpperCase())
                .filter((role) => role.length > 0));
        }
    }
    catch {
        // Legacy RBAC tables may not exist in some environments.
    }
    try {
        const serviceAccount = await (0, db_1.queryOne)('SELECT "enabled" FROM "ServiceAccounts" WHERE "userId" = $1 LIMIT 1', [user.id]);
        if (serviceAccount?.enabled)
            mergedRoles.push('AGENT');
    }
    catch {
        // Ignore when ServiceAccounts table is unavailable.
    }
    const fallback = String(user.role || '').trim().toUpperCase();
    if (fallback)
        mergedRoles.push(fallback);
    const deduped = Array.from(new Set(mergedRoles));
    return deduped.length > 0 ? deduped : ['USER'];
}
async function getEffectivePermissions(userId, role, roles) {
    const fallback = (0, policy_1.getRolePermissions)({ role, roles }).map((permission) => String(permission || '').trim()).filter((permission) => permission.length > 0);
    try {
        const roleNames = roles.length > 0 ? roles : [role];
        const roleRows = await (0, db_1.query)(`SELECT DISTINCT r.role_id
       FROM roles r
       WHERE UPPER(r.role_name) = ANY($1::text[])`, [roleNames.map((name) => String(name || '').trim().toUpperCase()).filter((name) => name.length > 0)]);
        const roleIds = roleRows.map((row) => Number(row.role_id)).filter((id) => Number.isFinite(id) && id > 0);
        if (roleIds.length === 0)
            return fallback;
        const rows = await (0, db_1.query)(`SELECT
         p.permission_key,
         BOOL_OR(rp.allowed) AS role_allowed,
         MAX(uo.allowed::int)::boolean AS override_allowed
       FROM permissions p
       LEFT JOIN role_permissions rp
         ON rp.permission_id = p.permission_id
        AND rp.role_id = ANY($1::int[])
       LEFT JOIN user_permissions_override uo
         ON uo.permission_id = p.permission_id
        AND uo.user_id = $2
       GROUP BY p.permission_id, p.permission_key`, [roleIds, userId]);
        const resolved = rows
            .filter((row) => (row.override_allowed !== null ? Boolean(row.override_allowed) : Boolean(row.role_allowed)))
            .map((row) => String(row.permission_key || '').trim())
            .filter((permission) => permission.length > 0);
        if (resolved.length === 0)
            return fallback;
        return Array.from(new Set(resolved));
    }
    catch {
        return fallback;
    }
}
async function ensureDefaultUserRole(userId) {
    try {
        await (0, db_1.query)(`INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.role_id
       FROM roles r
       WHERE r.role_name = 'USER'
       ON CONFLICT (user_id, role_id) DO NOTHING`, [userId]);
    }
    catch {
        // Ignore when RBAC tables are not installed.
    }
}
function shouldRequireMfa(user, _policy) {
    return Boolean(user.mfaEnabled);
}
function normalizeMfaPolicyRow(row) {
    const configured = toBool(row?.isConfigured, false);
    return {
        mfaRequiredForPrivilegedRoles: configured ? toBool(row?.mfaRequiredForPrivilegedRoles, false) : false,
        primaryMfaMethod: normalizeMfaMethod(row?.primaryMfaMethod),
        enrollmentGracePeriodDays: normalizeGraceDays(row?.enrollmentGracePeriodDays),
        allowEmergencyBypass: toBool(row?.allowEmergencyBypass, false),
        isConfigured: configured,
    };
}
async function getMfaPolicy() {
    await ensureAuthSchema();
    const row = await (0, db_1.queryOne)(`SELECT
      "mfaRequiredForPrivilegedRoles",
      "primaryMfaMethod",
      "enrollmentGracePeriodDays",
      "allowEmergencyBypass",
      "isConfigured"
     FROM "MfaPolicy"
     WHERE "id" = 1`);
    return normalizeMfaPolicyRow(row || {});
}
exports.getMfaPolicy = getMfaPolicy;
async function updateMfaPolicy(input) {
    await ensureAuthSchema();
    const current = await getMfaPolicy();
    const next = {
        mfaRequiredForPrivilegedRoles: input?.mfaRequiredForPrivilegedRoles === undefined
            ? current.mfaRequiredForPrivilegedRoles
            : toBool(input?.mfaRequiredForPrivilegedRoles, current.mfaRequiredForPrivilegedRoles),
        primaryMfaMethod: input?.primaryMfaMethod === undefined
            ? current.primaryMfaMethod
            : normalizeMfaMethod(input?.primaryMfaMethod),
        enrollmentGracePeriodDays: input?.enrollmentGracePeriodDays === undefined
            ? current.enrollmentGracePeriodDays
            : normalizeGraceDays(input?.enrollmentGracePeriodDays),
        allowEmergencyBypass: input?.allowEmergencyBypass === undefined
            ? current.allowEmergencyBypass
            : toBool(input?.allowEmergencyBypass, current.allowEmergencyBypass),
    };
    await (0, db_1.query)(`UPDATE "MfaPolicy"
     SET
       "mfaRequiredForPrivilegedRoles" = $1,
       "primaryMfaMethod" = $2,
       "enrollmentGracePeriodDays" = $3,
       "allowEmergencyBypass" = $4,
       "isConfigured" = TRUE,
       "updatedAt" = NOW()
     WHERE "id" = 1`, [
        next.mfaRequiredForPrivilegedRoles,
        next.primaryMfaMethod,
        next.enrollmentGracePeriodDays,
        next.allowEmergencyBypass,
    ]);
    return next;
}
exports.updateMfaPolicy = updateMfaPolicy;
async function getUserMfaState(userId) {
    await ensureAuthSchema();
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "name", "role", COALESCE("mfaEnabled", FALSE) AS "mfaEnabled", COALESCE("mfaTotpEnabled", FALSE) AS "mfaTotpEnabled"
     FROM "User"
     WHERE "id" = $1`, [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    const policy = await getMfaPolicy();
    return {
        userId: Number(user.id),
        email: String(user.email || ''),
        name: String(user.name || ''),
        role: String(user.role || ''),
        mfaEnabled: Boolean(user.mfaEnabled),
        authenticatorConfigured: Boolean(user.mfaTotpEnabled),
        mfaRequiredByPolicy: false,
        effectiveMfaRequired: shouldRequireMfa(user, policy),
    };
}
exports.getUserMfaState = getUserMfaState;
async function setUserMfaEnabled(userId, enabled) {
    await ensureAuthSchema();
    const user = await (0, db_1.queryOne)(`SELECT "id", "role" FROM "User" WHERE "id" = $1`, [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    const policy = await getMfaPolicy();
    const updated = await (0, db_1.queryOne)(`UPDATE "User"
     SET "mfaEnabled" = $1, "updatedAt" = NOW()
     WHERE "id" = $2
     RETURNING "id", "email", "name", "role", COALESCE("mfaEnabled", FALSE) AS "mfaEnabled", COALESCE("mfaTotpEnabled", FALSE) AS "mfaTotpEnabled"`, [Boolean(enabled), userId]);
    return {
        userId: Number(updated?.id || userId),
        email: String(updated?.email || ''),
        name: String(updated?.name || ''),
        role: String(updated?.role || ''),
        mfaEnabled: Boolean(updated?.mfaEnabled),
        authenticatorConfigured: Boolean(updated?.mfaTotpEnabled),
        mfaRequiredByPolicy: false,
        effectiveMfaRequired: shouldRequireMfa({ mfaEnabled: Boolean(updated?.mfaEnabled), role: String(updated?.role || '') }, policy),
    };
}
exports.setUserMfaEnabled = setUserMfaEnabled;
async function requestMfaChallenge(challengeToken, method) {
    await ensureAuthSchema();
    const parsed = await parseMfaPreToken(challengeToken);
    if (method === 'authenticator')
        return createAuthenticatorMfaChallenge(parsed.user, parsed.rememberMe);
    return createEmailMfaChallenge(parsed.user, parsed.rememberMe);
}
exports.requestMfaChallenge = requestMfaChallenge;
async function setupAuthenticator(userId) {
    await ensureAuthSchema();
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "name" FROM "User" WHERE "id" = $1`, [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    const secret = randomBase32Secret(20);
    await (0, db_1.query)(`UPDATE "User"
     SET "mfaTotpTempSecret" = $1, "updatedAt" = NOW()
     WHERE "id" = $2`, [secret, userId]);
    const label = `${MFA_ISSUER}:${user.email}`;
    const otpauthUrl = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(MFA_ISSUER)}&algorithm=SHA1&digits=6&period=30`;
    return {
        secret,
        otpauthUrl,
        manualEntryKey: secret,
        issuer: MFA_ISSUER,
        accountName: user.email,
    };
}
exports.setupAuthenticator = setupAuthenticator;
async function verifyAuthenticatorSetup(userId, code) {
    await ensureAuthSchema();
    const user = await (0, db_1.queryOne)(`SELECT "id", "mfaTotpTempSecret" FROM "User" WHERE "id" = $1`, [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    const tempSecret = String(user.mfaTotpTempSecret || '').trim();
    if (!tempSecret)
        throw { status: 400, message: 'Authenticator setup is not initialized.' };
    if (!verifyTotpCode(tempSecret, code, 1))
        throw { status: 400, message: 'Invalid authenticator code.' };
    await (0, db_1.query)(`UPDATE "User"
     SET
       "mfaTotpSecret" = $1,
       "mfaTotpTempSecret" = NULL,
       "mfaTotpEnabled" = TRUE,
       "mfaEnabled" = TRUE,
       "updatedAt" = NOW()
     WHERE "id" = $2`, [tempSecret, userId]);
    return { ok: true, authenticatorConfigured: true };
}
exports.verifyAuthenticatorSetup = verifyAuthenticatorSetup;
async function resetAuthenticator(userId) {
    await ensureAuthSchema();
    const user = await (0, db_1.queryOne)(`SELECT "id" FROM "User" WHERE "id" = $1`, [userId]);
    if (!user)
        throw { status: 404, message: 'User not found' };
    await (0, db_1.query)(`UPDATE "User"
     SET
       "mfaTotpSecret" = NULL,
       "mfaTotpTempSecret" = NULL,
       "mfaTotpEnabled" = FALSE,
       "updatedAt" = NOW()
     WHERE "id" = $1`, [userId]);
    return { ok: true, authenticatorConfigured: false };
}
exports.resetAuthenticator = resetAuthenticator;
async function issueTokens(user, rememberMe = false) {
    const roles = await getAssignedRoles(user);
    const role = resolvePrimaryRole(roles, user.role);
    const permissions = await getEffectivePermissions(user.id, role, roles);
    const name = safeDisplayName(user);
    const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, name, role, roles, permissions }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
    const refreshToken = jsonwebtoken_1.default.sign({ sub: user.id }, REFRESH_SECRET, { expiresIn: `${REFRESH_EXPIRES_DAYS}d` });
    const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
    await (0, db_1.query)('INSERT INTO "RefreshToken" ("token", "userId", "expiresAt", "createdAt") VALUES ($1, $2, $3, NOW())', [refreshToken, user.id, expiresAt]);
    await (0, db_1.query)('UPDATE "User" SET "lastLogin" = NOW(), "updatedAt" = NOW() WHERE "id" = $1', [user.id]);
    return {
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name, role, avatarUrl: user.avatarUrl || null },
    };
}
function signMfaPreToken(user, rememberMe = false) {
    return jsonwebtoken_1.default.sign({ type: 'mfa-pre', sub: user.id, email: user.email, rememberMe: Boolean(rememberMe) }, ACCESS_SECRET, { expiresIn: `${MFA_CODE_TTL_MIN}m` });
}
function getMfaMethodsForUser(user, policy) {
    const methods = [];
    const hasAuthenticator = Boolean(user.mfaTotpEnabled && String(user.mfaTotpSecret || '').trim());
    if (policy.primaryMfaMethod === 'Authenticator App' && hasAuthenticator)
        methods.push('authenticator');
    if (policy.primaryMfaMethod === 'Authenticator App')
        methods.push('email');
    else
        methods.push('email');
    if (hasAuthenticator && !methods.includes('authenticator'))
        methods.unshift('authenticator');
    return Array.from(new Set(methods));
}
function buildMfaPrompt(user, policy, rememberMe = false) {
    const methods = getMfaMethodsForUser(user, policy);
    return {
        mfaRequired: true,
        challengeToken: signMfaPreToken(user, rememberMe),
        availableMethods: methods,
        defaultMethod: methods[0] || 'email',
        maskedEmail: maskEmail(user.email),
        user: {
            id: user.id,
            email: user.email,
            name: safeDisplayName(user),
            avatarUrl: user.avatarUrl || null,
        },
    };
}
function getMfaMailTemplate(user, code) {
    const displayName = toGreetingName(safeDisplayName(user));
    const text = [
        'Your TB ITSM Verification Code',
        '',
        `Hello ${displayName},`,
        '',
        'To complete your sign-in process to TB ITSM, please use the verification code below:',
        '',
        `**${code}**`,
        '',
        'If you did not request this code, please disregard this email or contact our support team for assistance.',
        '',
        'Kind regards,',
        'TB Support Team',
    ].join('\n');
    const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;background:#ffffff;color:#111827;line-height:1.5">
      <p style="margin:0 0 16px 0">Hello ${htmlEscape(displayName)},</p>
      <p style="margin:0 0 12px 0">To complete your sign-in process to <strong>TB ITSM</strong>, please use the verification code below:</p>
      <p style="margin:0 0 16px 0;font-size:24px;font-weight:700;letter-spacing:3px">${htmlEscape(code)}</p>
      <p style="margin:0 0 16px 0;color:#4b5563">If you did not request this code, please disregard this email or contact our support team for assistance.</p>
      <p style="margin:0">Kind regards,<br/>TB Support Team</p>
    </div>
  `;
    return { subject: 'Your TB ITSM Verification Code', text, html };
}
async function createEmailMfaChallenge(user, rememberMe = false) {
    const code = randomNumericCode(6);
    const codeHash = hashOpaqueToken(code);
    const expiresAt = nowPlusMinutes(MFA_CODE_TTL_MIN);
    const row = await (0, db_1.queryOne)('INSERT INTO "MfaChallenge" ("userId", "codeHash", "expiresAt") VALUES ($1, $2, $3) RETURNING "id"', [user.id, codeHash, expiresAt]);
    if (!row)
        throw new Error('Unable to create 2FA challenge');
    let delivery = 'email';
    try {
        const mail = getMfaMailTemplate(user, code);
        await (0, mail_integration_1.sendSmtpMail)({
            to: user.email,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
        });
    }
    catch (err) {
        if (String(process.env.NODE_ENV || '').toLowerCase() === 'production')
            throw err;
        delivery = 'dev-fallback';
    }
    const challengeToken = jsonwebtoken_1.default.sign({ type: 'mfa', method: 'email', sub: user.id, cid: row.id, email: user.email, rememberMe: Boolean(rememberMe) }, ACCESS_SECRET, { expiresIn: `${MFA_CODE_TTL_MIN}m` });
    return {
        mfaRequired: true,
        challengeToken,
        mfaCodePreview: delivery === 'dev-fallback' ? code : undefined,
        delivery,
        method: 'email',
        destination: maskEmail(user.email),
        user: {
            id: user.id,
            email: user.email,
            name: safeDisplayName(user),
            avatarUrl: user.avatarUrl || null,
        },
    };
}
async function createAuthenticatorMfaChallenge(user, rememberMe = false) {
    const secret = String(user.mfaTotpSecret || '').trim();
    if (!secret || !Boolean(user.mfaTotpEnabled))
        throw new Error('Authenticator app is not configured for this account');
    const challengeToken = jsonwebtoken_1.default.sign({ type: 'mfa', method: 'authenticator', sub: user.id, email: user.email, rememberMe: Boolean(rememberMe) }, ACCESS_SECRET, { expiresIn: `${MFA_CODE_TTL_MIN}m` });
    return {
        mfaRequired: true,
        challengeToken,
        method: 'authenticator',
        user: {
            id: user.id,
            email: user.email,
            name: safeDisplayName(user),
            avatarUrl: user.avatarUrl || null,
        },
    };
}
async function issueTrustedDeviceToken(userId, label = 'browser') {
    const raw = (0, crypto_1.randomBytes)(32).toString('hex');
    const tokenHash = hashOpaqueToken(raw);
    const expiresAt = new Date(Date.now() + MFA_TRUSTED_DAYS * 24 * 60 * 60 * 1000);
    await (0, db_1.query)(`INSERT INTO "MfaTrustedDevice" ("userId", "tokenHash", "label", "expiresAt", "lastUsedAt")
     VALUES ($1, $2, $3, $4, NOW())`, [userId, tokenHash, String(label || 'browser').trim() || 'browser', expiresAt]);
    return raw;
}
async function isTrustedDeviceForUser(userId, trustedDeviceToken) {
    const token = String(trustedDeviceToken || '').trim();
    if (!token)
        return false;
    const tokenHash = hashOpaqueToken(token);
    const row = await (0, db_1.queryOne)(`SELECT "id"
     FROM "MfaTrustedDevice"
     WHERE "userId" = $1
       AND "tokenHash" = $2
       AND "expiresAt" > NOW()
     LIMIT 1`, [userId, tokenHash]);
    if (!row)
        return false;
    await (0, db_1.query)('UPDATE "MfaTrustedDevice" SET "lastUsedAt" = NOW() WHERE "id" = $1', [row.id]);
    return true;
}
async function parseMfaPreToken(challengeToken) {
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(challengeToken, ACCESS_SECRET);
    }
    catch (_err) {
        throw new Error('Invalid or expired 2FA challenge');
    }
    if (!payload || payload.type !== 'mfa-pre' || !payload.sub)
        throw new Error('Invalid 2FA challenge');
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub", "mfaTotpSecret", "mfaTotpTempSecret", "mfaTotpEnabled"
     FROM "User"
     WHERE "id" = $1`, [payload.sub]);
    if (!user)
        throw new Error('User not found');
    return {
        user,
        rememberMe: Boolean(payload?.rememberMe),
    };
}
async function findActiveUserByEmail(email) {
    return (0, db_1.queryOne)(`SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub", u."mfaTotpSecret", u."mfaTotpTempSecret", u."mfaTotpEnabled"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE LOWER(u."email") = LOWER($1)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(u."status", 'ACTIVE') <> 'INACTIVE'
       AND COALESCE(sa."enabled", TRUE) = TRUE`, [normalizeEmail(email)]);
}
async function verifyGoogleIdToken(idToken) {
    if (!idToken)
        throw new Error('Google ID token is required');
    if (!GOOGLE_CLIENT_ID)
        throw new Error('Google SSO is not configured');
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error('Invalid Google token');
    const payload = await res.json();
    const audience = String(payload.aud || '');
    if (audience !== GOOGLE_CLIENT_ID)
        throw new Error('Google client mismatch');
    const email = normalizeEmail(payload.email || '');
    if (!email || String(payload.email_verified || '').toLowerCase() !== 'true')
        throw new Error('Google account email is not verified');
    if (GOOGLE_HOSTED_DOMAIN) {
        const hd = String(payload.hd || '').trim().toLowerCase();
        if (!hd || hd !== GOOGLE_HOSTED_DOMAIN) {
            throw new Error(`Google account must belong to ${GOOGLE_HOSTED_DOMAIN}`);
        }
    }
    return {
        sub: String(payload.sub || ''),
        email,
        givenName: String(payload.given_name || ''),
        familyName: String(payload.family_name || ''),
        picture: String(payload.picture || ''),
    };
}
async function createSsoBackedUser(info) {
    const randomPassword = (0, crypto_1.randomBytes)(32).toString('hex');
    const passwordHash = await bcrypt_1.default.hash(randomPassword, 12);
    const fullName = `${info.givenName || ''} ${info.familyName || ''}`.trim() || info.email;
    const googleSub = info.provider === 'google' ? info.sub : null;
    const zohoSub = info.provider === 'zoho' ? info.sub : null;
    const microsoftSub = info.provider === 'outlook' ? info.sub : null;
    const created = await (0, db_1.queryOne)(`INSERT INTO "User" ("email", "password", "name", "status", "role", "googleSub", "zohoSub", "microsoftSub", "avatarUrl", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', 'USER', $4, $5, $6, $7, NOW(), NOW())
     RETURNING "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub", "mfaTotpSecret", "mfaTotpTempSecret", "mfaTotpEnabled"`, [info.email, passwordHash, fullName, googleSub, zohoSub, microsoftSub, info.picture || null]);
    if (!created)
        throw new Error('Unable to create account');
    await ensureDefaultUserRole(created.id);
    return created;
}
async function login(email, password, trustedDeviceToken, rememberMe = false) {
    await ensureAuthSchema();
    const user = await findActiveUserByEmail(email);
    if (!user || !user.password)
        throw new Error('Invalid credentials');
    const ok = await bcrypt_1.default.compare(String(password || ''), user.password);
    if (!ok)
        throw new Error('Invalid credentials');
    const policy = await getMfaPolicy();
    if (shouldRequireMfa(user, policy)) {
        const trusted = await isTrustedDeviceForUser(user.id, trustedDeviceToken);
        if (!trusted)
            return buildMfaPrompt(user, policy, rememberMe);
    }
    return issueTokens(user, rememberMe);
}
exports.login = login;
async function loginWithGoogle(idToken, trustedDeviceToken, rememberMe = false) {
    await ensureAuthSchema();
    const google = await verifyGoogleIdToken(idToken);
    let user = await (0, db_1.queryOne)(`SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub", u."zohoSub", u."microsoftSub", u."mfaTotpSecret", u."mfaTotpTempSecret", u."mfaTotpEnabled"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE (LOWER(u."email") = LOWER($1) OR u."googleSub" = $2)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(sa."enabled", TRUE) = TRUE
     ORDER BY u."id" ASC
     LIMIT 1`, [google.email, google.sub]);
    if (!user) {
        user = await createSsoBackedUser({ ...google, provider: 'google' });
    }
    else {
        await (0, db_1.query)('UPDATE "User" SET "googleSub" = $1, "avatarUrl" = COALESCE(NULLIF($2, \'\'), "avatarUrl"), "updatedAt" = NOW() WHERE "id" = $3', [
            google.sub,
            google.picture,
            user.id,
        ]);
        user.googleSub = google.sub;
        user.avatarUrl = google.picture || user.avatarUrl;
    }
    const policy = await getMfaPolicy();
    if (shouldRequireMfa(user, policy) || MFA_REQUIRED_FOR_GOOGLE) {
        const trusted = await isTrustedDeviceForUser(user.id, trustedDeviceToken);
        if (!trusted)
            return buildMfaPrompt(user, policy, rememberMe);
    }
    return issueTokens(user, rememberMe);
}
exports.loginWithGoogle = loginWithGoogle;
async function verifyMfa(challengeToken, code, dontAskAgain = false, trustedDeviceLabel = 'browser', rememberMe = false) {
    await ensureAuthSchema();
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(challengeToken, ACCESS_SECRET);
    }
    catch (_err) {
        throw new Error('Invalid or expired 2FA challenge');
    }
    if (!payload || payload.type !== 'mfa' || !payload.sub)
        throw new Error('Invalid 2FA challenge');
    const method = String(payload.method || (payload.cid ? 'email' : '')).trim().toLowerCase();
    if (method === 'email') {
        if (!payload.cid)
            throw new Error('Invalid 2FA challenge');
        const row = await (0, db_1.queryOne)('SELECT "id", "userId", "codeHash", "expiresAt", "consumed" FROM "MfaChallenge" WHERE "id" = $1 AND "userId" = $2', [payload.cid, payload.sub]);
        if (!row || row.consumed || new Date(row.expiresAt).getTime() < Date.now())
            throw new Error('2FA challenge expired');
        if (hashOpaqueToken(String(code || '')) !== row.codeHash)
            throw new Error('Invalid verification code');
        await (0, db_1.query)('UPDATE "MfaChallenge" SET "consumed" = TRUE WHERE "id" = $1', [row.id]);
    }
    else if (method === 'authenticator') {
        const userForTotp = await (0, db_1.queryOne)(`SELECT "id", "mfaTotpSecret", COALESCE("mfaTotpEnabled", FALSE) AS "mfaTotpEnabled"
       FROM "User"
       WHERE "id" = $1`, [payload.sub]);
        if (!userForTotp || !userForTotp.mfaTotpEnabled)
            throw new Error('Authenticator app is not configured for this account');
        if (!verifyTotpCode(String(userForTotp.mfaTotpSecret || ''), code, 1))
            throw new Error('Invalid verification code');
    }
    else {
        throw new Error('Unsupported 2FA method');
    }
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub", "mfaTotpSecret", "mfaTotpTempSecret", "mfaTotpEnabled"
     FROM "User" WHERE "id" = $1`, [payload.sub]);
    if (!user)
        throw new Error('User not found');
    const effectiveRememberMe = payload?.rememberMe !== undefined ? Boolean(payload.rememberMe) : Boolean(rememberMe);
    const auth = await issueTokens(user, effectiveRememberMe);
    if (!dontAskAgain)
        return auth;
    const trustedDeviceToken = await issueTrustedDeviceToken(user.id, trustedDeviceLabel);
    return { ...auth, trustedDeviceToken };
}
exports.verifyMfa = verifyMfa;
async function forgotPassword(email) {
    await ensureAuthSchema();
    const normalized = normalizeEmail(email);
    if (!normalized)
        throw { status: 400, message: 'Email is required' };
    const user = await findActiveUserByEmail(normalized);
    if (!user)
        throw { status: 401, message: 'Mail unauthorized user' };
    const rawToken = (0, crypto_1.randomBytes)(32).toString('hex');
    const tokenHash = hashOpaqueToken(rawToken);
    const expiresAt = nowPlusMinutes(RESET_TOKEN_TTL_MIN);
    await (0, db_1.query)('INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3)', [
        user.id,
        tokenHash,
        expiresAt,
    ]);
    const resetBase = String(process.env.PASSWORD_RESET_BASE_URL || process.env.RESET_PASSWORD_BASE_URL || 'http://localhost:3000').trim();
    const appBase = String(resetBase || FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const resetUrl = `${appBase}/#/reset-password?token=${encodeURIComponent(rawToken)}&email=${encodeURIComponent(user.email)}`;
    const displayName = toGreetingName(safeDisplayName(user));
    const expiresTextIst = formatIstDate(expiresAt);
    const mailCtx = passwordResetMailContext();
    const subject = `${mailCtx.appName} Password Reset Request`;
    const supportLine = mailCtx.supportEmail
        ? `If you did not request a password reset, please ignore this email and report it to ${mailCtx.supportEmail}.`
        : `If you did not request a password reset, please ignore this email.`;
    const text = [
        `Dear ${displayName},`,
        ``,
        `We received a request to reset the password for your ${mailCtx.appName} account.`,
        ``,
        `To set a new password and regain access to your account, please click the Reset Password button below:`,
        ``,
        `Reset Password`,
        ``,
        `${resetUrl}`,
        ``,
        `Please note that this password reset link will expire on ${expiresTextIst}. We recommend completing the reset process before this time.`,
        ``,
        supportLine,
        ``,
        `Best regards,`,
        `${mailCtx.supportTeamName}`,
    ].join('\n');
    const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;max-width:620px;margin:0 auto;padding:20px;background:#ffffff;color:#111827;line-height:1.5">
      <p style="margin:0 0 16px 0">Dear ${htmlEscape(displayName)},</p>
      <p style="margin:0 0 16px 0">We received a request to reset the password for your <strong>${htmlEscape(mailCtx.appName)}</strong> account.</p>
      <p style="margin:0 0 12px 0">To set a new password and regain access to your account, please click the <strong>Reset Password</strong> button below:</p>
      <p style="margin:0 0 18px 0">
        <a href="${htmlEscape(resetUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:700">Reset Password</a>
      </p>
      <p style="margin:0 0 16px 0;color:#4b5563">Please note that this password reset link will expire on ${htmlEscape(expiresTextIst)}. We recommend completing the reset process before this time.</p>
      <p style="margin:0 0 18px 0;color:#4b5563">${htmlEscape(supportLine)}</p>
      <p style="margin:0">Best regards,<br/>${htmlEscape(mailCtx.supportTeamName)}</p>
    </div>
  `;
    let delivery = 'email';
    try {
        await (0, mail_integration_1.sendSmtpMail)({
            to: user.email,
            from: mailCtx.from,
            subject,
            text,
            html,
        });
    }
    catch (err) {
        if (String(process.env.NODE_ENV || '').toLowerCase() === 'production')
            throw err;
        delivery = 'dev-fallback';
    }
    return {
        ok: true,
        delivery,
        ...(delivery === 'dev-fallback' ? { resetUrlPreview: resetUrl } : {}),
    };
}
exports.forgotPassword = forgotPassword;
async function resetPassword(token, newPassword) {
    await ensureAuthSchema();
    if (!token)
        throw new Error('Reset token is required');
    if (String(newPassword || '').length < 8)
        throw new Error('Password must be at least 8 characters');
    const tokenHash = hashOpaqueToken(token);
    const resetRow = await (0, db_1.queryOne)(`SELECT "id", "userId", "expiresAt", "consumed"
     FROM "PasswordResetToken"
     WHERE "tokenHash" = $1
     ORDER BY "id" DESC
     LIMIT 1`, [tokenHash]);
    if (!resetRow || resetRow.consumed || new Date(resetRow.expiresAt).getTime() < Date.now())
        throw new Error('Reset token is invalid or expired');
    const hashed = await bcrypt_1.default.hash(newPassword, 12);
    await (0, db_1.query)('UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2', [hashed, resetRow.userId]);
    await (0, db_1.query)('UPDATE "PasswordResetToken" SET "consumed" = TRUE WHERE "id" = $1', [resetRow.id]);
    await (0, db_1.query)('UPDATE "RefreshToken" SET "revoked" = TRUE WHERE "userId" = $1', [resetRow.userId]);
    return { ok: true };
}
exports.resetPassword = resetPassword;
async function changePassword(userId, currentPassword, newPassword) {
    await ensureAuthSchema();
    if (!Number.isFinite(userId) || userId <= 0)
        throw new Error('Invalid user');
    if (String(currentPassword || '').length < 1)
        throw new Error('Current password is required');
    if (String(newPassword || '').length < 8)
        throw new Error('Password must be at least 8 characters');
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub", "mfaTotpSecret", "mfaTotpTempSecret", "mfaTotpEnabled"
     FROM "User"
     WHERE "id" = $1`, [userId]);
    if (!user)
        throw new Error('User not found');
    if (!user.password)
        throw new Error('Password change is not available for this account');
    const ok = await bcrypt_1.default.compare(currentPassword, user.password);
    if (!ok)
        throw new Error('Current password is incorrect');
    const hashed = await bcrypt_1.default.hash(newPassword, 12);
    await (0, db_1.query)('UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2', [hashed, userId]);
    await (0, db_1.query)('UPDATE "RefreshToken" SET "revoked" = TRUE WHERE "userId" = $1', [userId]);
    return { ok: true };
}
exports.changePassword = changePassword;
async function refresh(refreshToken) {
    await ensureAuthSchema();
    try {
        ;
        jsonwebtoken_1.default.verify(refreshToken, REFRESH_SECRET);
        const record = await (0, db_1.queryOne)('SELECT * FROM "RefreshToken" WHERE "token" = $1 AND "revoked" = FALSE AND "expiresAt" > NOW()', [refreshToken]);
        if (!record)
            throw new Error('Invalid refresh token');
        const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub", "mfaTotpSecret", "mfaTotpTempSecret", "mfaTotpEnabled"
       FROM "User" WHERE "id" = $1`, [record.userId]);
        if (!user)
            throw new Error('User not found');
        const roles = await getAssignedRoles(user);
        const role = resolvePrimaryRole(roles, user.role);
        const permissions = await getEffectivePermissions(user.id, role, roles);
        const name = safeDisplayName(user);
        const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, name, role, roles, permissions }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
        return { accessToken };
    }
    catch (_err) {
        throw new Error('Invalid refresh token');
    }
}
exports.refresh = refresh;
async function loginWithSsoCode(provider, code, rememberMe = false) {
    await ensureAuthSchema();
    const identity = await exchangeCodeForIdentity(provider, code);
    const subField = provider === 'google' ? 'u."googleSub"' : provider === 'zoho' ? 'u."zohoSub"' : 'u."microsoftSub"';
    let user = await (0, db_1.queryOne)(`SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub", u."zohoSub", u."microsoftSub", u."mfaTotpSecret", u."mfaTotpTempSecret", u."mfaTotpEnabled"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE (LOWER(u."email") = LOWER($1) OR ${subField} = $2)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(sa."enabled", TRUE) = TRUE
     ORDER BY u."id" ASC
     LIMIT 1`, [identity.email, identity.sub]);
    if (!user) {
        user = await createSsoBackedUser(identity);
    }
    else {
        const googleSub = provider === 'google' ? identity.sub : user.googleSub;
        const zohoSub = provider === 'zoho' ? identity.sub : (user.zohoSub || null);
        const microsoftSub = provider === 'outlook' ? identity.sub : (user.microsoftSub || null);
        await (0, db_1.query)('UPDATE "User" SET "googleSub" = $1, "zohoSub" = $2, "microsoftSub" = $3, "avatarUrl" = COALESCE(NULLIF($4, \'\'), "avatarUrl"), "updatedAt" = NOW() WHERE "id" = $5', [googleSub || null, zohoSub || null, microsoftSub || null, identity.picture, user.id]);
        user.googleSub = googleSub || null;
        user.zohoSub = zohoSub || null;
        user.microsoftSub = microsoftSub || null;
        user.avatarUrl = identity.picture || user.avatarUrl;
    }
    const policy = await getMfaPolicy();
    if (shouldRequireMfa(user, policy) || (provider === 'google' && MFA_REQUIRED_FOR_GOOGLE))
        return buildMfaPrompt(user, policy, rememberMe);
    return issueTokens(user, rememberMe);
}
exports.loginWithSsoCode = loginWithSsoCode;
async function completeSsoCallback(provider, code, state) {
    const statePayload = verifySsoState(state);
    if (statePayload.provider !== provider)
        throw new Error('SSO provider mismatch');
    const auth = await loginWithSsoCode(provider, code, statePayload.rememberMe);
    return { rememberMe: statePayload.rememberMe, auth };
}
exports.completeSsoCallback = completeSsoCallback;
