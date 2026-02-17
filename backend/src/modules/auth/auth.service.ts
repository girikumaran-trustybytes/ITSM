import { randomBytes, createHash } from 'crypto'
import { query, queryOne } from '../../db'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { sendSmtpMail } from '../../services/mail.integration'

const ACCESS_EXPIRES = process.env.ACCESS_TOKEN_EXPIRES_IN || '15m'
const REFRESH_EXPIRES_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS || 7)
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'refresh_secret'
const GOOGLE_CLIENT_ID = String(process.env.GOOGLE_CLIENT_ID || '').trim()
const RESET_TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MIN || 30)
const MFA_CODE_TTL_MIN = Number(process.env.MFA_CODE_TTL_MIN || 10)
const MFA_REQUIRED_FOR_GOOGLE = String(process.env.MFA_REQUIRED_FOR_GOOGLE || 'false').toLowerCase() === 'true'
const TOKEN_PEPPER = process.env.AUTH_TOKEN_PEPPER || ACCESS_SECRET
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')

type AppUser = {
  user_id: number
  username: string
  email: string
  password_hash: string
  first_name: string | null
  last_name: string | null
  status: string | null
  mfa_enabled: boolean | null
  avatar_url: string | null
  google_sub: string | null
}

type TokenResponse = {
  accessToken: string
  refreshToken: string
  user: {
    id: number
    email: string
    name: string
    role: string
    avatarUrl: string | null
  }
}

let authSchemaInit: Promise<void> | null = null

function nowPlusMinutes(minutes: number) {
  return new Date(Date.now() + Math.max(1, minutes) * 60 * 1000)
}

function safeDisplayName(user: Pick<AppUser, 'first_name' | 'last_name' | 'username' | 'email'>) {
  const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim()
  return fullName || user.username || user.email
}

function hashOpaqueToken(raw: string) {
  return createHash('sha256').update(`${raw}:${TOKEN_PEPPER}`).digest('hex')
}

function normalizeEmail(input: string) {
  return String(input || '').trim().toLowerCase()
}

function normalizeUsername(email: string) {
  return normalizeEmail(email).split('@')[0].replace(/[^a-z0-9_.-]/gi, '').slice(0, 40) || 'user'
}

function randomNumericCode(length = 6) {
  const max = 10 ** length
  const n = Math.floor(Math.random() * max)
  return String(n).padStart(length, '0')
}

async function ensureAuthSchema() {
  if (!authSchemaInit) {
    authSchemaInit = (async () => {
      await query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
      await query('ALTER TABLE app_user ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE')
      await query('ALTER TABLE app_user ADD COLUMN IF NOT EXISTS mfa_channel VARCHAR(20) DEFAULT \'email\'')
      await query('ALTER TABLE app_user ADD COLUMN IF NOT EXISTS google_sub VARCHAR(255)')
      await query('ALTER TABLE app_user ADD COLUMN IF NOT EXISTS avatar_url TEXT')
      await query('ALTER TABLE app_user ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE')
      await query(
        `CREATE TABLE IF NOT EXISTS password_reset_token (
          token_id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          consumed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      )
      await query('CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_token(user_id)')
      await query(
        `CREATE TABLE IF NOT EXISTS mfa_challenge (
          challenge_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id BIGINT NOT NULL REFERENCES app_user(user_id) ON DELETE CASCADE,
          code_hash TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          consumed BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      )
      await query('CREATE INDEX IF NOT EXISTS idx_mfa_challenge_user ON mfa_challenge(user_id)')
      await query('CREATE INDEX IF NOT EXISTS idx_app_user_google_sub ON app_user(google_sub)')
    })()
  }
  await authSchemaInit
}

async function getPrimaryRole(userId: number) {
  const roleRows = await query<any>(
    'SELECT r.role_name FROM roles r INNER JOIN user_roles ur ON r.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.role_id ASC',
    [userId]
  )
  return roleRows.length > 0 ? String(roleRows[0].role_name || 'USER') : 'USER'
}

async function ensureDefaultUserRole(userId: number) {
  await query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, r.role_id
     FROM roles r
     WHERE r.role_name = 'USER'
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [userId]
  )
}

async function issueTokens(user: AppUser): Promise<TokenResponse> {
  const role = await getPrimaryRole(user.user_id)
  const name = safeDisplayName(user)
  const accessToken = (jwt as any).sign(
    { sub: user.user_id, email: user.email, name, role },
    ACCESS_SECRET as any,
    { expiresIn: ACCESS_EXPIRES }
  )
  const refreshToken = (jwt as any).sign(
    { sub: user.user_id },
    REFRESH_SECRET as any,
    { expiresIn: `${REFRESH_EXPIRES_DAYS}d` }
  )

  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)
  await query('INSERT INTO refresh_token (token, user_id, expires_at) VALUES ($1, $2, $3)', [refreshToken, user.user_id, expiresAt])
  await query('UPDATE app_user SET last_login = NOW() WHERE user_id = $1', [user.user_id])

  return {
    accessToken,
    refreshToken,
    user: { id: user.user_id, email: user.email, name, role, avatarUrl: user.avatar_url || null },
  }
}

async function createMfaChallenge(user: AppUser) {
  const code = randomNumericCode(6)
  const codeHash = hashOpaqueToken(code)
  const expiresAt = nowPlusMinutes(MFA_CODE_TTL_MIN)
  const row = await queryOne<{ challenge_id: string }>(
    'INSERT INTO mfa_challenge (user_id, code_hash, expires_at) VALUES ($1, $2, $3) RETURNING challenge_id',
    [user.user_id, codeHash, expiresAt]
  )
  if (!row) throw new Error('Unable to create MFA challenge')

  let delivery = 'email'
  try {
    await sendSmtpMail({
      to: user.email,
      subject: 'ITSM Login Verification Code',
      text: `Your ITSM verification code is ${code}. It expires in ${MFA_CODE_TTL_MIN} minutes.`,
    })
  } catch (err: any) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') throw err
    delivery = 'dev-fallback'
  }

  const challengeToken = (jwt as any).sign(
    { type: 'mfa', sub: user.user_id, cid: row.challenge_id, email: user.email },
    ACCESS_SECRET as any,
    { expiresIn: `${MFA_CODE_TTL_MIN}m` }
  )

  return {
    mfaRequired: true as const,
    challengeToken,
    mfaCodePreview: delivery === 'dev-fallback' ? code : undefined,
    delivery,
    user: {
      id: user.user_id,
      email: user.email,
      name: safeDisplayName(user),
      avatarUrl: user.avatar_url || null,
    },
  }
}

async function findActiveUserByEmail(email: string) {
  return queryOne<AppUser>(
    `SELECT user_id, username, email, password_hash, first_name, last_name, status, mfa_enabled, avatar_url, google_sub
     FROM app_user
     WHERE email = $1
       AND COALESCE(is_deleted, FALSE) = FALSE
       AND COALESCE(status, 'ACTIVE') <> 'INACTIVE'`,
    [normalizeEmail(email)]
  )
}

async function verifyGoogleIdToken(idToken: string) {
  if (!idToken) throw new Error('Google ID token is required')
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Invalid Google token')
  const payload = await res.json() as any

  const audience = String(payload.aud || '')
  const email = normalizeEmail(payload.email || '')
  if (!email || String(payload.email_verified || '').toLowerCase() !== 'true') throw new Error('Google account email is not verified')
  if (GOOGLE_CLIENT_ID && audience !== GOOGLE_CLIENT_ID) throw new Error('Google client mismatch')

  return {
    sub: String(payload.sub || ''),
    email,
    givenName: String(payload.given_name || ''),
    familyName: String(payload.family_name || ''),
    picture: String(payload.picture || ''),
  }
}

async function createGoogleBackedUser(info: { email: string; givenName: string; familyName: string; sub: string; picture: string }) {
  const randomPassword = randomBytes(32).toString('hex')
  const passwordHash = await bcrypt.hash(randomPassword, 12)
  const usernameBase = normalizeUsername(info.email)
  const username = `${usernameBase}_${Date.now().toString().slice(-6)}`
  const created = await queryOne<AppUser>(
    `INSERT INTO app_user (username, email, password_hash, first_name, last_name, status, google_sub, avatar_url)
     VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, $7)
     RETURNING user_id, username, email, password_hash, first_name, last_name, status, mfa_enabled, avatar_url, google_sub`,
    [username, info.email, passwordHash, info.givenName || null, info.familyName || null, info.sub, info.picture || null]
  )
  if (!created) throw new Error('Unable to create account')
  await ensureDefaultUserRole(created.user_id)
  return created
}

export async function login(email: string, password: string) {
  await ensureAuthSchema()
  const user = await findActiveUserByEmail(email)
  if (!user || !user.password_hash) throw new Error('Invalid credentials')

  const ok = await bcrypt.compare(String(password || ''), user.password_hash)
  if (!ok) throw new Error('Invalid credentials')

  if (user.mfa_enabled) return createMfaChallenge(user)
  return issueTokens(user)
}

export async function loginWithGoogle(idToken: string) {
  await ensureAuthSchema()
  const google = await verifyGoogleIdToken(idToken)

  let user = await queryOne<AppUser>(
    `SELECT user_id, username, email, password_hash, first_name, last_name, status, mfa_enabled, avatar_url, google_sub
     FROM app_user
     WHERE (email = $1 OR google_sub = $2)
       AND COALESCE(is_deleted, FALSE) = FALSE
     ORDER BY user_id ASC
     LIMIT 1`,
    [google.email, google.sub]
  )

  if (!user) {
    user = await createGoogleBackedUser(google)
  } else {
    await query('UPDATE app_user SET google_sub = $1, avatar_url = COALESCE(NULLIF($2, \'\'), avatar_url) WHERE user_id = $3', [
      google.sub,
      google.picture,
      user.user_id,
    ])
    user.google_sub = google.sub
    user.avatar_url = google.picture || user.avatar_url
  }

  if (user.mfa_enabled || MFA_REQUIRED_FOR_GOOGLE) return createMfaChallenge(user)
  return issueTokens(user)
}

export async function verifyMfa(challengeToken: string, code: string) {
  await ensureAuthSchema()
  let payload: any
  try {
    payload = (jwt as any).verify(challengeToken, ACCESS_SECRET)
  } catch (_err) {
    throw new Error('Invalid or expired MFA challenge')
  }
  if (!payload || payload.type !== 'mfa' || !payload.sub || !payload.cid) throw new Error('Invalid MFA challenge')

  const row = await queryOne<any>(
    'SELECT challenge_id, user_id, code_hash, expires_at, consumed FROM mfa_challenge WHERE challenge_id = $1 AND user_id = $2',
    [payload.cid, payload.sub]
  )
  if (!row || row.consumed || new Date(row.expires_at).getTime() < Date.now()) throw new Error('MFA challenge expired')
  if (hashOpaqueToken(String(code || '')) !== row.code_hash) throw new Error('Invalid verification code')

  await query('UPDATE mfa_challenge SET consumed = TRUE WHERE challenge_id = $1', [row.challenge_id])
  const user = await queryOne<AppUser>(
    `SELECT user_id, username, email, password_hash, first_name, last_name, status, mfa_enabled, avatar_url, google_sub
     FROM app_user WHERE user_id = $1`,
    [payload.sub]
  )
  if (!user) throw new Error('User not found')

  return issueTokens(user)
}

export async function forgotPassword(email: string) {
  await ensureAuthSchema()
  const normalized = normalizeEmail(email)
  if (!normalized) throw { status: 400, message: 'Email is required' }

  const user = await findActiveUserByEmail(normalized)
  if (!user) throw { status: 401, message: 'Mail unauthorized user' }

  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashOpaqueToken(rawToken)
  const expiresAt = nowPlusMinutes(RESET_TOKEN_TTL_MIN)

  await query('INSERT INTO password_reset_token (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    user.user_id,
    tokenHash,
    expiresAt,
  ])

  const appBase = String(FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')
  const resetUrl = `${appBase}/reset-password?token=${encodeURIComponent(rawToken)}`
  let delivery = 'email'
  try {
    await sendSmtpMail({
      to: user.email,
      subject: 'ITSM Password Reset',
      text: `Use this link to reset your password (valid for ${RESET_TOKEN_TTL_MIN} minutes): ${resetUrl}`,
    })
  } catch (err: any) {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') throw err
    delivery = 'dev-fallback'
  }

  return {
    ok: true,
    delivery,
    ...(delivery === 'dev-fallback' ? { resetUrlPreview: resetUrl } : {}),
  }
}

export async function resetPassword(token: string, newPassword: string) {
  await ensureAuthSchema()
  if (!token) throw new Error('Reset token is required')
  if (String(newPassword || '').length < 8) throw new Error('Password must be at least 8 characters')

  const tokenHash = hashOpaqueToken(token)
  const resetRow = await queryOne<any>(
    `SELECT token_id, user_id, expires_at, consumed
     FROM password_reset_token
     WHERE token_hash = $1
     ORDER BY token_id DESC
     LIMIT 1`,
    [tokenHash]
  )
  if (!resetRow || resetRow.consumed || new Date(resetRow.expires_at).getTime() < Date.now()) throw new Error('Reset token is invalid or expired')

  const hashed = await bcrypt.hash(newPassword, 12)
  await query('UPDATE app_user SET password_hash = $1, updated_at = NOW() WHERE user_id = $2', [hashed, resetRow.user_id])
  await query('UPDATE password_reset_token SET consumed = TRUE WHERE token_id = $1', [resetRow.token_id])
  await query('UPDATE refresh_token SET revoked = TRUE WHERE user_id = $1', [resetRow.user_id])

  return { ok: true }
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  await ensureAuthSchema()
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid user')
  if (String(currentPassword || '').length < 1) throw new Error('Current password is required')
  if (String(newPassword || '').length < 8) throw new Error('Password must be at least 8 characters')

  const user = await queryOne<AppUser>(
    `SELECT user_id, email, password_hash
     FROM app_user
     WHERE user_id = $1`,
    [userId]
  )
  if (!user) throw new Error('User not found')
  if (!user.password_hash) throw new Error('Password change is not available for this account')

  const ok = await bcrypt.compare(currentPassword, user.password_hash)
  if (!ok) throw new Error('Current password is incorrect')

  const hashed = await bcrypt.hash(newPassword, 12)
  await query('UPDATE app_user SET password_hash = $1, updated_at = NOW() WHERE user_id = $2', [hashed, userId])
  await query('UPDATE refresh_token SET revoked = TRUE WHERE user_id = $1', [userId])
  return { ok: true }
}

export async function refresh(refreshToken: string) {
  await ensureAuthSchema()
  try {
    ;(jwt as any).verify(refreshToken, REFRESH_SECRET)
    const record = await queryOne<any>(
      'SELECT * FROM refresh_token WHERE token = $1 AND revoked = FALSE AND expires_at > NOW()',
      [refreshToken]
    )
    if (!record) throw new Error('Invalid refresh token')

    const user = await queryOne<AppUser>(
      `SELECT user_id, username, email, password_hash, first_name, last_name, status, mfa_enabled, avatar_url, google_sub
       FROM app_user WHERE user_id = $1`,
      [record.user_id]
    )
    if (!user) throw new Error('User not found')

    const role = await getPrimaryRole(user.user_id)
    const name = safeDisplayName(user)
    const accessToken = (jwt as any).sign(
      { sub: user.user_id, email: user.email, name, role },
      ACCESS_SECRET as any,
      { expiresIn: ACCESS_EXPIRES }
    )
    return { accessToken }
  } catch (_err) {
    throw new Error('Invalid refresh token')
  }
}
