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
const GOOGLE_HOSTED_DOMAIN = String(process.env.GOOGLE_HOSTED_DOMAIN || '').trim().toLowerCase()
const GOOGLE_CLIENT_SECRET = String(process.env.GOOGLE_CLIENT_SECRET || '').trim()
const ZOHO_CLIENT_ID = String(process.env.ZOHO_CLIENT_ID || '').trim()
const ZOHO_CLIENT_SECRET = String(process.env.ZOHO_CLIENT_SECRET || '').trim()
const ZOHO_HOSTED_DOMAIN = String(process.env.ZOHO_HOSTED_DOMAIN || '').trim().toLowerCase()
const ZOHO_ACCOUNTS_BASE = String(process.env.ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com').trim().replace(/\/+$/, '')
const MS_CLIENT_ID = String(process.env.MS_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID || '').trim()
const MS_CLIENT_SECRET = String(process.env.MS_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET || '').trim()
const MS_TENANT_ID = String(process.env.MS_TENANT_ID || process.env.MICROSOFT_TENANT_ID || 'common').trim()
const MS_HOSTED_DOMAIN = String(process.env.MS_HOSTED_DOMAIN || process.env.MICROSOFT_HOSTED_DOMAIN || '').trim().toLowerCase()
const BACKEND_PUBLIC_URL = String(process.env.BACKEND_PUBLIC_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')
const SSO_STATE_TTL_MIN = Math.max(5, Number(process.env.SSO_STATE_TTL_MIN || 10))
const RESET_TOKEN_TTL_MIN = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MIN || 30)
const MFA_CODE_TTL_MIN = Number(process.env.MFA_CODE_TTL_MIN || 10)
const MFA_REQUIRED_FOR_GOOGLE = String(process.env.MFA_REQUIRED_FOR_GOOGLE || 'false').toLowerCase() === 'true'
const TOKEN_PEPPER = process.env.AUTH_TOKEN_PEPPER || ACCESS_SECRET
const FRONTEND_URL = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')

type AuthUser = {
  id: number
  email: string
  password: string
  name: string | null
  role: string | null
  status: string | null
  mfaEnabled: boolean | null
  avatarUrl: string | null
  googleSub: string | null
  zohoSub?: string | null
  microsoftSub?: string | null
}

export type SsoProvider = 'google' | 'zoho' | 'outlook'

type SsoConfigItem = {
  provider: SsoProvider
  enabled: boolean
  label: string
  loginUrl?: string
}

type SsoIdentity = {
  provider: SsoProvider
  sub: string
  email: string
  givenName: string
  familyName: string
  picture: string
  emailVerified: boolean
  hostedDomain?: string
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

function safeDisplayName(user: Pick<AuthUser, 'name' | 'email'>) {
  return String(user.name || '').trim() || user.email
}

function hashOpaqueToken(raw: string) {
  return createHash('sha256').update(`${raw}:${TOKEN_PEPPER}`).digest('hex')
}

function normalizeEmail(input: string) {
  return String(input || '').trim().toLowerCase()
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
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "mfaEnabled" BOOLEAN DEFAULT FALSE')
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleSub" VARCHAR(255)')
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zohoSub" VARCHAR(255)')
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "microsoftSub" VARCHAR(255)')
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT')
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN DEFAULT FALSE')
      await query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLogin" TIMESTAMP(3)')
      await query(
        `CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
          "id" BIGSERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "tokenHash" TEXT NOT NULL UNIQUE,
          "expiresAt" TIMESTAMP NOT NULL,
          "consumed" BOOLEAN NOT NULL DEFAULT FALSE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      )
      await query('CREATE INDEX IF NOT EXISTS idx_password_reset_user_id ON "PasswordResetToken"("userId")')
      await query(
        `CREATE TABLE IF NOT EXISTS "MfaChallenge" (
          "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          "codeHash" TEXT NOT NULL,
          "expiresAt" TIMESTAMP NOT NULL,
          "consumed" BOOLEAN NOT NULL DEFAULT FALSE,
          "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
      )
      await query('CREATE INDEX IF NOT EXISTS idx_mfa_challenge_user_id ON "MfaChallenge"("userId")')
      await query('CREATE INDEX IF NOT EXISTS idx_user_google_sub ON "User"("googleSub")')
      await query('CREATE INDEX IF NOT EXISTS idx_user_zoho_sub ON "User"("zohoSub")')
      await query('CREATE INDEX IF NOT EXISTS idx_user_microsoft_sub ON "User"("microsoftSub")')
    })()
  }
  await authSchemaInit
}

function ssoRedirectUri(provider: SsoProvider) {
  const envKey = provider === 'google' ? 'GOOGLE_REDIRECT_URI' : provider === 'zoho' ? 'ZOHO_REDIRECT_URI' : 'MS_REDIRECT_URI'
  const fromEnv = String(process.env[envKey] || '').trim()
  if (fromEnv) return fromEnv
  return `${BACKEND_PUBLIC_URL}/api/auth/sso/${provider}/callback`
}

function isSsoProviderEnabled(provider: SsoProvider): boolean {
  if (provider === 'google') return Boolean(GOOGLE_CLIENT_ID)
  if (provider === 'zoho') return Boolean(ZOHO_CLIENT_ID)
  return Boolean(MS_CLIENT_ID)
}

function signSsoState(provider: SsoProvider, rememberMe: boolean) {
  return (jwt as any).sign(
    { type: 'sso-state', provider, rememberMe: Boolean(rememberMe) },
    ACCESS_SECRET as any,
    { expiresIn: `${SSO_STATE_TTL_MIN}m` }
  )
}

function verifySsoState(state: string): { provider: SsoProvider; rememberMe: boolean } {
  let payload: any
  try {
    payload = (jwt as any).verify(state, ACCESS_SECRET)
  } catch (_err) {
    throw new Error('Invalid or expired SSO state')
  }
  const provider = String(payload?.provider || '') as SsoProvider
  if (!payload || payload.type !== 'sso-state' || !['google', 'zoho', 'outlook'].includes(provider)) {
    throw new Error('Invalid SSO state')
  }
  return { provider, rememberMe: Boolean(payload.rememberMe) }
}

function decodeJwtPayload(token: string): any {
  const parts = String(token || '').split('.')
  if (parts.length < 2) return {}
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  } catch {
    return {}
  }
}

async function postForm<T = any>(url: string, body: Record<string, string>) {
  const encoded = new URLSearchParams(body)
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: encoded.toString(),
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `SSO token exchange failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

async function getJson<T = any>(url: string, bearerToken?: string) {
  const res = await fetch(url, {
    headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
  })
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(txt || `SSO profile fetch failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

function assertHostedDomain(provider: SsoProvider, hd: string | undefined) {
  const value = String(hd || '').trim().toLowerCase()
  if (provider === 'google' && GOOGLE_HOSTED_DOMAIN && value !== GOOGLE_HOSTED_DOMAIN) {
    throw new Error(`Google account must belong to ${GOOGLE_HOSTED_DOMAIN}`)
  }
  if (provider === 'zoho' && ZOHO_HOSTED_DOMAIN && value !== ZOHO_HOSTED_DOMAIN) {
    throw new Error(`Zoho account must belong to ${ZOHO_HOSTED_DOMAIN}`)
  }
  if (provider === 'outlook' && MS_HOSTED_DOMAIN && value !== MS_HOSTED_DOMAIN) {
    throw new Error(`Outlook account must belong to ${MS_HOSTED_DOMAIN}`)
  }
}

async function exchangeCodeForIdentity(provider: SsoProvider, code: string): Promise<SsoIdentity> {
  const redirectUri = ssoRedirectUri(provider)

  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google SSO is not configured')
    const token: any = await postForm('https://oauth2.googleapis.com/token', {
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    const profile: any = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token.access_token)
    const email = normalizeEmail(profile.email || '')
    if (!email) throw new Error('Google account email is missing')
    if (String(profile.email_verified || '').toLowerCase() !== 'true') throw new Error('Google account email is not verified')
    assertHostedDomain('google', profile.hd)
    return {
      provider: 'google',
      sub: String(profile.sub || ''),
      email,
      givenName: String(profile.given_name || ''),
      familyName: String(profile.family_name || ''),
      picture: String(profile.picture || ''),
      emailVerified: true,
      hostedDomain: String(profile.hd || ''),
    }
  }

  if (provider === 'zoho') {
    if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET) throw new Error('Zoho SSO is not configured')
    const token: any = await postForm(`${ZOHO_ACCOUNTS_BASE}/oauth/v2/token`, {
      code,
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    })
    let profile: any = {}
    try {
      profile = await getJson(`${ZOHO_ACCOUNTS_BASE}/oauth/user/info`, token.access_token)
    } catch {
      profile = decodeJwtPayload(String(token.id_token || ''))
    }
    const email = normalizeEmail(profile.Email || profile.email || '')
    if (!email) throw new Error('Zoho account email is missing')
    const domain = email.includes('@') ? email.split('@')[1] : ''
    assertHostedDomain('zoho', domain)
    return {
      provider: 'zoho',
      sub: String(profile.ZUID || profile.sub || email),
      email,
      givenName: String(profile.First_Name || profile.given_name || ''),
      familyName: String(profile.Last_Name || profile.family_name || ''),
      picture: String(profile.picture || ''),
      emailVerified: true,
      hostedDomain: domain,
    }
  }

  if (!MS_CLIENT_ID || !MS_CLIENT_SECRET) throw new Error('Outlook SSO is not configured')
  const token: any = await postForm(`https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/token`, {
    code,
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })
  let profile: any = {}
  try {
    profile = await getJson('https://graph.microsoft.com/oidc/userinfo', token.access_token)
  } catch {
    profile = decodeJwtPayload(String(token.id_token || ''))
  }
  const email = normalizeEmail(profile.email || profile.preferred_username || profile.upn || '')
  if (!email) throw new Error('Outlook account email is missing')
  const domain = email.includes('@') ? email.split('@')[1] : ''
  assertHostedDomain('outlook', profile.hd || profile.tid || domain)
  return {
    provider: 'outlook',
    sub: String(profile.sub || profile.oid || email),
    email,
    givenName: String(profile.given_name || ''),
    familyName: String(profile.family_name || ''),
    picture: String(profile.picture || ''),
    emailVerified: true,
    hostedDomain: domain,
  }
}

function buildSsoAuthorizationUrl(provider: SsoProvider, rememberMe: boolean) {
  if (!isSsoProviderEnabled(provider)) throw new Error(`${provider} SSO is not configured`)
  const redirectUri = ssoRedirectUri(provider)
  const state = signSsoState(provider, rememberMe)

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    if (GOOGLE_HOSTED_DOMAIN) params.set('hd', GOOGLE_HOSTED_DOMAIN)
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
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
    })
    return `${ZOHO_ACCOUNTS_BASE}/oauth/v2/auth?${params.toString()}`
  }

  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    state,
    prompt: 'select_account',
  })
  return `https://login.microsoftonline.com/${encodeURIComponent(MS_TENANT_ID)}/oauth2/v2.0/authorize?${params.toString()}`
}

export function getSsoConfig() {
  const providers: SsoConfigItem[] = [
    { provider: 'google', enabled: isSsoProviderEnabled('google'), label: 'Google' },
    { provider: 'zoho', enabled: isSsoProviderEnabled('zoho'), label: 'Zoho' },
    { provider: 'outlook', enabled: isSsoProviderEnabled('outlook'), label: 'Outlook' },
  ]
  return {
    providers: providers.map((p) => ({
      ...p,
      loginUrl: p.enabled ? `/api/auth/sso/${p.provider}/start` : undefined,
    })),
  }
}

export function getSsoStartUrl(provider: SsoProvider, rememberMe = true) {
  return buildSsoAuthorizationUrl(provider, rememberMe)
}

async function getPrimaryRole(user: AuthUser) {
  try {
    const roleRows = await query<any>(
      'SELECT r.role_name FROM roles r INNER JOIN user_roles ur ON r.role_id = ur.role_id WHERE ur.user_id = $1 ORDER BY r.role_id ASC',
      [user.id]
    )
    if (roleRows.length > 0) return String(roleRows[0].role_name || 'USER')
  } catch {
    // Legacy RBAC tables may not exist in some environments.
  }
  return String(user.role || 'USER')
}

async function ensureDefaultUserRole(userId: number) {
  try {
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, r.role_id
       FROM roles r
       WHERE r.role_name = 'USER'
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId]
    )
  } catch {
    // Ignore when RBAC tables are not installed.
  }
}

async function issueTokens(user: AuthUser): Promise<TokenResponse> {
  const role = await getPrimaryRole(user)
  const name = safeDisplayName(user)
  const accessToken = (jwt as any).sign(
    { sub: user.id, email: user.email, name, role },
    ACCESS_SECRET as any,
    { expiresIn: ACCESS_EXPIRES }
  )
  const refreshToken = (jwt as any).sign(
    { sub: user.id },
    REFRESH_SECRET as any,
    { expiresIn: `${REFRESH_EXPIRES_DAYS}d` }
  )

  const expiresAt = new Date(Date.now() + REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)
  await query(
    'INSERT INTO "RefreshToken" ("token", "userId", "expiresAt", "createdAt") VALUES ($1, $2, $3, NOW())',
    [refreshToken, user.id, expiresAt]
  )
  await query('UPDATE "User" SET "lastLogin" = NOW(), "updatedAt" = NOW() WHERE "id" = $1', [user.id])

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, email: user.email, name, role, avatarUrl: user.avatarUrl || null },
  }
}

async function createMfaChallenge(user: AuthUser) {
  const code = randomNumericCode(6)
  const codeHash = hashOpaqueToken(code)
  const expiresAt = nowPlusMinutes(MFA_CODE_TTL_MIN)
  const row = await queryOne<{ id: string }>(
    'INSERT INTO "MfaChallenge" ("userId", "codeHash", "expiresAt") VALUES ($1, $2, $3) RETURNING "id"',
    [user.id, codeHash, expiresAt]
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
    { type: 'mfa', sub: user.id, cid: row.id, email: user.email },
    ACCESS_SECRET as any,
    { expiresIn: `${MFA_CODE_TTL_MIN}m` }
  )

  return {
    mfaRequired: true as const,
    challengeToken,
    mfaCodePreview: delivery === 'dev-fallback' ? code : undefined,
    delivery,
    user: {
      id: user.id,
      email: user.email,
      name: safeDisplayName(user),
      avatarUrl: user.avatarUrl || null,
    },
  }
}

async function findActiveUserByEmail(email: string) {
  return queryOne<AuthUser>(
    `SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE LOWER(u."email") = LOWER($1)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(u."status", 'ACTIVE') <> 'INACTIVE'
       AND COALESCE(sa."enabled", TRUE) = TRUE`,
    [normalizeEmail(email)]
  )
}

async function verifyGoogleIdToken(idToken: string) {
  if (!idToken) throw new Error('Google ID token is required')
  if (!GOOGLE_CLIENT_ID) throw new Error('Google SSO is not configured')
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Invalid Google token')
  const payload = await res.json() as any

  const audience = String(payload.aud || '')
  if (audience !== GOOGLE_CLIENT_ID) throw new Error('Google client mismatch')
  const email = normalizeEmail(payload.email || '')
  if (!email || String(payload.email_verified || '').toLowerCase() !== 'true') throw new Error('Google account email is not verified')

  if (GOOGLE_HOSTED_DOMAIN) {
    const hd = String(payload.hd || '').trim().toLowerCase()
    if (!hd || hd !== GOOGLE_HOSTED_DOMAIN) {
      throw new Error(`Google account must belong to ${GOOGLE_HOSTED_DOMAIN}`)
    }
  }

  return {
    sub: String(payload.sub || ''),
    email,
    givenName: String(payload.given_name || ''),
    familyName: String(payload.family_name || ''),
    picture: String(payload.picture || ''),
  }
}

async function createSsoBackedUser(info: { provider: SsoProvider; email: string; givenName: string; familyName: string; sub: string; picture: string }) {
  const randomPassword = randomBytes(32).toString('hex')
  const passwordHash = await bcrypt.hash(randomPassword, 12)
  const fullName = `${info.givenName || ''} ${info.familyName || ''}`.trim() || info.email
  const googleSub = info.provider === 'google' ? info.sub : null
  const zohoSub = info.provider === 'zoho' ? info.sub : null
  const microsoftSub = info.provider === 'outlook' ? info.sub : null
  const created = await queryOne<AuthUser>(
    `INSERT INTO "User" ("email", "password", "name", "status", "role", "googleSub", "zohoSub", "microsoftSub", "avatarUrl", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ACTIVE', 'USER', $4, $5, $6, $7, NOW(), NOW())
     RETURNING "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub"`,
    [info.email, passwordHash, fullName, googleSub, zohoSub, microsoftSub, info.picture || null]
  )
  if (!created) throw new Error('Unable to create account')
  await ensureDefaultUserRole(created.id)
  return created
}

export async function login(email: string, password: string) {
  await ensureAuthSchema()
  const user = await findActiveUserByEmail(email)
  if (!user || !user.password) throw new Error('Invalid credentials')

  const ok = await bcrypt.compare(String(password || ''), user.password)
  if (!ok) throw new Error('Invalid credentials')

  if (user.mfaEnabled) return createMfaChallenge(user)
  return issueTokens(user)
}

export async function loginWithGoogle(idToken: string) {
  await ensureAuthSchema()
  const google = await verifyGoogleIdToken(idToken)

  let user = await queryOne<AuthUser>(
    `SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub", u."zohoSub", u."microsoftSub"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE (LOWER(u."email") = LOWER($1) OR u."googleSub" = $2)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(sa."enabled", TRUE) = TRUE
     ORDER BY u."id" ASC
     LIMIT 1`,
    [google.email, google.sub]
  )

  if (!user) {
    user = await createSsoBackedUser({ ...google, provider: 'google' })
  } else {
    await query('UPDATE "User" SET "googleSub" = $1, "avatarUrl" = COALESCE(NULLIF($2, \'\'), "avatarUrl"), "updatedAt" = NOW() WHERE "id" = $3', [
      google.sub,
      google.picture,
      user.id,
    ])
    user.googleSub = google.sub
    user.avatarUrl = google.picture || user.avatarUrl
  }

  if (user.mfaEnabled || MFA_REQUIRED_FOR_GOOGLE) return createMfaChallenge(user)
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
    'SELECT "id", "userId", "codeHash", "expiresAt", "consumed" FROM "MfaChallenge" WHERE "id" = $1 AND "userId" = $2',
    [payload.cid, payload.sub]
  )
  if (!row || row.consumed || new Date(row.expiresAt).getTime() < Date.now()) throw new Error('MFA challenge expired')
  if (hashOpaqueToken(String(code || '')) !== row.codeHash) throw new Error('Invalid verification code')

  await query('UPDATE "MfaChallenge" SET "consumed" = TRUE WHERE "id" = $1', [row.id])
  const user = await queryOne<AuthUser>(
    `SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub"
     FROM "User" WHERE "id" = $1`,
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

  await query('INSERT INTO "PasswordResetToken" ("userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3)', [
    user.id,
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
    `SELECT "id", "userId", "expiresAt", "consumed"
     FROM "PasswordResetToken"
     WHERE "tokenHash" = $1
     ORDER BY "id" DESC
     LIMIT 1`,
    [tokenHash]
  )
  if (!resetRow || resetRow.consumed || new Date(resetRow.expiresAt).getTime() < Date.now()) throw new Error('Reset token is invalid or expired')

  const hashed = await bcrypt.hash(newPassword, 12)
  await query('UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2', [hashed, resetRow.userId])
  await query('UPDATE "PasswordResetToken" SET "consumed" = TRUE WHERE "id" = $1', [resetRow.id])
  await query('UPDATE "RefreshToken" SET "revoked" = TRUE WHERE "userId" = $1', [resetRow.userId])

  return { ok: true }
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  await ensureAuthSchema()
  if (!Number.isFinite(userId) || userId <= 0) throw new Error('Invalid user')
  if (String(currentPassword || '').length < 1) throw new Error('Current password is required')
  if (String(newPassword || '').length < 8) throw new Error('Password must be at least 8 characters')

  const user = await queryOne<AuthUser>(
    `SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub"
     FROM "User"
     WHERE "id" = $1`,
    [userId]
  )
  if (!user) throw new Error('User not found')
  if (!user.password) throw new Error('Password change is not available for this account')

  const ok = await bcrypt.compare(currentPassword, user.password)
  if (!ok) throw new Error('Current password is incorrect')

  const hashed = await bcrypt.hash(newPassword, 12)
  await query('UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2', [hashed, userId])
  await query('UPDATE "RefreshToken" SET "revoked" = TRUE WHERE "userId" = $1', [userId])
  return { ok: true }
}

export async function refresh(refreshToken: string) {
  await ensureAuthSchema()
  try {
    ;(jwt as any).verify(refreshToken, REFRESH_SECRET)
    const record = await queryOne<any>(
      'SELECT * FROM "RefreshToken" WHERE "token" = $1 AND "revoked" = FALSE AND "expiresAt" > NOW()',
      [refreshToken]
    )
    if (!record) throw new Error('Invalid refresh token')

    const user = await queryOne<AuthUser>(
      `SELECT "id", "email", "password", "name", "role", "status", "mfaEnabled", "avatarUrl", "googleSub", "zohoSub", "microsoftSub"
       FROM "User" WHERE "id" = $1`,
      [record.userId]
    )
    if (!user) throw new Error('User not found')

    const role = await getPrimaryRole(user)
    const name = safeDisplayName(user)
    const accessToken = (jwt as any).sign(
      { sub: user.id, email: user.email, name, role },
      ACCESS_SECRET as any,
      { expiresIn: ACCESS_EXPIRES }
    )
    return { accessToken }
  } catch (_err) {
    throw new Error('Invalid refresh token')
  }
}

export async function loginWithSsoCode(provider: SsoProvider, code: string) {
  await ensureAuthSchema()
  const identity = await exchangeCodeForIdentity(provider, code)
  const subField = provider === 'google' ? 'u."googleSub"' : provider === 'zoho' ? 'u."zohoSub"' : 'u."microsoftSub"'

  let user = await queryOne<AuthUser>(
    `SELECT
       u."id", u."email", u."password", u."name", u."role", u."status",
       u."mfaEnabled", u."avatarUrl", u."googleSub", u."zohoSub", u."microsoftSub"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE (LOWER(u."email") = LOWER($1) OR ${subField} = $2)
       AND COALESCE(u."is_deleted", FALSE) = FALSE
       AND COALESCE(sa."enabled", TRUE) = TRUE
     ORDER BY u."id" ASC
     LIMIT 1`,
    [identity.email, identity.sub]
  )

  if (!user) {
    user = await createSsoBackedUser(identity)
  } else {
    const googleSub = provider === 'google' ? identity.sub : user.googleSub
    const zohoSub = provider === 'zoho' ? identity.sub : (user.zohoSub || null)
    const microsoftSub = provider === 'outlook' ? identity.sub : (user.microsoftSub || null)
    await query(
      'UPDATE "User" SET "googleSub" = $1, "zohoSub" = $2, "microsoftSub" = $3, "avatarUrl" = COALESCE(NULLIF($4, \'\'), "avatarUrl"), "updatedAt" = NOW() WHERE "id" = $5',
      [googleSub || null, zohoSub || null, microsoftSub || null, identity.picture, user.id]
    )
    user.googleSub = googleSub || null
    user.zohoSub = zohoSub || null
    user.microsoftSub = microsoftSub || null
    user.avatarUrl = identity.picture || user.avatarUrl
  }

  if (user.mfaEnabled || (provider === 'google' && MFA_REQUIRED_FOR_GOOGLE)) return createMfaChallenge(user)
  return issueTokens(user)
}

export async function completeSsoCallback(
  provider: SsoProvider,
  code: string,
  state: string
): Promise<{ rememberMe: boolean; auth: any }> {
  const statePayload = verifySsoState(state)
  if (statePayload.provider !== provider) throw new Error('SSO provider mismatch')
  const auth = await loginWithSsoCode(provider, code)
  return { rememberMe: statePayload.rememberMe, auth }
}
