"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.refresh = exports.changePassword = exports.resetPassword = exports.forgotPassword = exports.verifyMfa = exports.loginWithGoogle = exports.login = void 0;
const crypto_1 = require("crypto");
const db_1 = require("../../db");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mail_integration_1 = require("../../services/mail.integration");
const google_auth_library_1 = require("google-auth-library");
const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m';
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7);
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret';
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_HOSTED_DOMAIN = String(process.env.GOOGLE_HOSTED_DOMAIN || '').trim().toLowerCase();
const RESET_TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MIN || 30);
const MFA_CODE_TTL_MIN = Number(process.env.MFA_CODE_TTL_MIN || 10);
const MFA_REQUIRED_FOR_GOOGLE = String(process.env.MFA_REQUIRED_FOR_GOOGLE || 'false').toLowerCase() === 'true';
const TOKEN_PEPPER = process.env.AUTH_TOKEN_PEPPER || ACCESS_SECRET;
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const googleClient = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID || undefined);
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
function randomNumericCode(length = 6) {
    const max = 10 ** length;
    const n = Math.floor(Math.random() * max);
    return String(n).padStart(length, '0');
}
async function ensureAuthSchema() {
    if (!authSchemaInit) {
        authSchemaInit = (async () => {
            await (0, db_1.query)('CREATE EXTENSION IF NOT EXISTS pgcrypto');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN DEFAULT FALSE');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleSub" VARCHAR(255)');
            await (0, db_1.query)('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT');
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
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_mfa_challenge_user_id ON "MfaChallenge"("userId")');
            await (0, db_1.query)('CREATE INDEX IF NOT EXISTS idx_user_google_sub ON "User"("googleSub")');
        })();
    }
    await authSchemaInit;
}
async function getPrimaryRole(user) {
    try {
        const roleRows = await (0, db_1.query)('SELECT r.role_name FROM roles r INNER JOIN user_roles ur ON r.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.role_id ASC', [user.id]);
        if (roleRows.length > 0)
            return String(roleRows[0].role_name || 'USER');
    }
    catch {
        // Legacy RBAC tables may not exist in some environments.
    }
    return String(user.role || 'USER');
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
async function issueTokens(user) {
    const role = await getPrimaryRole(user);
    const name = safeDisplayName(user);
    const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, name, role }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
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
async function createMfaChallenge(user) {
    const code = randomNumericCode(6);
    const codeHash = hashOpaqueToken(code);
    const expiresAt = nowPlusMinutes(MFA_CODE_TTL_MIN);
    const row = await (0, db_1.queryOne)('INSERT INTO "MfaChallenge" ("userId", "codeHash", "expiresAt") VALUES ($1, $2, $3) RETURNING "id"', [user.id, codeHash, expiresAt]);
    if (!row)
        throw new Error('Unable to create MFA challenge');
    let delivery = 'email';
    try {
        await (0, mail_integration_1.sendSmtpMail)({
            to: user.email,
            subject: 'ITSM Login Verification Code',
            text: `Your ITSM verification code is ${code}. It expires in ${MFA_CODE_TTL_MIN} minutes.`,
        });
    }
    catch (err) {
        if (String(process.env.NODE_ENV || '').toLowerCase() === 'production')
            throw err;
        delivery = 'dev-fallback';
    }
    const challengeToken = jsonwebtoken_1.default.sign({ type: 'mfa', sub: user.id, cid: row.id, email: user.email }, ACCESS_SECRET, { expiresIn: `${MFA_CODE_TTL_MIN}m` });
    return {
        mfaRequired: true,
        challengeToken,
        mfaCodePreview: delivery === 'dev-fallback' ? code : undefined,
        delivery,
        user: {
            id: user.id,
            email: user.email,
            name: safeDisplayName(user),
            avatarUrl: user.avatarUrl || null,
        },
    };
}
async function findActiveUserByEmail(email) {
    return (0, db_1.queryOne)(`SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub"
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
    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken,
            audience: GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    }
    catch {
        throw new Error('Invalid Google token');
    }
    if (!payload)
        throw new Error('Invalid Google token');
    const email = normalizeEmail(payload.email || '');
    if (!email || payload.email_verified !== true)
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
async function createGoogleBackedUser(info) {
    const randomPassword = (0, crypto_1.randomBytes)(32).toString('hex');
    const passwordHash = await bcrypt_1.default.hash(randomPassword, 12);
    const fullName = `${info.givenName || ''} ${info.familyName || ''}`.trim() || info.email;
    const created = await (0, db_1.queryOne)(`INSERT INTO "User" ("email", "password", "name", "status", "role", "googleSub", "avatarUrl", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', 'USER', $4, $5, NOW(), NOW())
     RETURNING "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub"`, [info.email, passwordHash, fullName, info.sub, info.picture || null]);
    if (!created)
        throw new Error('Unable to create account');
    await ensureDefaultUserRole(created.id);
    return created;
}
async function login(email, password) {
    await ensureAuthSchema();
    const user = await findActiveUserByEmail(email);
    if (!user || !user.password)
        throw new Error('Invalid credentials');
    const ok = await bcrypt_1.default.compare(String(password || ''), user.password);
    if (!ok)
        throw new Error('Invalid credentials');
    if (user.mfaEnabled)
        return createMfaChallenge(user);
    return issueTokens(user);
}
exports.login = login;
async function loginWithGoogle(idToken) {
    await ensureAuthSchema();
    const google = await verifyGoogleIdToken(idToken);
    let user = await (0, db_1.queryOne)(`SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE (LOWER(u."email") = LOWER($1) OR u."googleSub" = $2)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(sa."enabled", TRUE) = TRUE
     ORDER BY u."id" ASC
     LIMIT 1`, [google.email, google.sub]);
    if (!user) {
        user = await createGoogleBackedUser(google);
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
    if (user.mfaEnabled || MFA_REQUIRED_FOR_GOOGLE)
        return createMfaChallenge(user);
    return issueTokens(user);
}
exports.loginWithGoogle = loginWithGoogle;
async function verifyMfa(challengeToken, code) {
    await ensureAuthSchema();
    let payload;
    try {
        payload = jsonwebtoken_1.default.verify(challengeToken, ACCESS_SECRET);
    }
    catch (_err) {
        throw new Error('Invalid or expired MFA challenge');
    }
    if (!payload || payload.type !== 'mfa' || !payload.sub || !payload.cid)
        throw new Error('Invalid MFA challenge');
    const row = await (0, db_1.queryOne)('SELECT "id", "userId", "codeHash", "expiresAt", "consumed" FROM "MfaChallenge" WHERE "id" = $1 AND "userId" = $2', [payload.cid, payload.sub]);
    if (!row || row.consumed || new Date(row.expiresAt).getTime() < Date.now())
        throw new Error('MFA challenge expired');
    if (hashOpaqueToken(String(code || '')) !== row.codeHash)
        throw new Error('Invalid verification code');
    await (0, db_1.query)('UPDATE "MfaChallenge" SET "consumed" = TRUE WHERE "id" = $1', [row.id]);
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub"
     FROM "User" WHERE "id" = $1`, [payload.sub]);
    if (!user)
        throw new Error('User not found');
    return issueTokens(user);
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
    const appBase = String(FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const resetUrl = `${appBase}/reset-password?token=${encodeURIComponent(rawToken)}`;
    let delivery = 'email';
    try {
        await (0, mail_integration_1.sendSmtpMail)({
            to: user.email,
            subject: 'ITSM Password Reset',
            text: `Use this link to reset your password (valid for ${RESET_TOKEN_TTL_MIN} minutes): ${resetUrl}`,
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
    const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub"
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
        const user = await (0, db_1.queryOne)(`SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub"
       FROM "User" WHERE "id" = $1`, [record.userId]);
        if (!user)
            throw new Error('User not found');
        const role = await getPrimaryRole(user);
        const name = safeDisplayName(user);
        const accessToken = jsonwebtoken_1.default.sign({ sub: user.id, email: user.email, name, role }, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES });
        return { accessToken };
    }
    catch (_err) {
        throw new Error('Invalid refresh token');
    }
}
exports.refresh = refresh;
