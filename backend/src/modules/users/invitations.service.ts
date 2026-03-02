import crypto from 'crypto'
import bcrypt from 'bcrypt'
import { query, queryOne, withClient } from '../../db'
import { auditLog } from '../../common/logger/logger'
import { sendSmtpMail } from '../../services/mail.integration'
import { ensureRbacSeeded } from './rbac.service'
import { enforceProtectedAdminBaseline, isProtectedAdminEmail } from './protected-admin'

type InvitationMode = 'invite' | 'reinvite'

type RoleRow = {
  role_id: number
  role_name: string
}

type ActorContext = {
  userId: number
  tenantId: number
  name: string | null
  email: string | null
  roles: string[]
  permissions: Set<string>
}

type InviteMeta = {
  ipAddress?: string | null
}

const INVITE_TOKEN_TTL_HOURS = 8
const INVITE_RESEND_MAX = Math.max(1, Number(process.env.INVITE_RESEND_MAX || 100))
const INVITE_CREATE_RATE_LIMIT = Math.max(5, Number(process.env.INVITE_CREATE_RATE_LIMIT || 30))
const INVITE_RESEND_RATE_LIMIT = Math.max(3, Number(process.env.INVITE_RESEND_RATE_LIMIT || 10))
const INVITE_RATE_WINDOW_MS = Math.max(60_000, Number(process.env.INVITE_RATE_WINDOW_MS || 15 * 60 * 1000))
const TOKEN_PEPPER = process.env.AUTH_TOKEN_PEPPER || process.env.JWT_ACCESS_SECRET || 'access_secret'
const ROLE_PRIORITY = ['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM'] as const

let invitationSchemaReady: Promise<void> | null = null
const inviteRateState = new Map<string, number[]>()

function normalizeEmail(input: any): string {
  return String(input || '').trim().toLowerCase()
}

function normalizeRoleName(input: any): string {
  return String(input || '').trim().toUpperCase()
}

function normalizeTeamKey(input: any): string {
  return String(input || '').trim().toLowerCase()
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter((value) => value.length > 0)))
}

function parseRoleIds(input: any): number[] {
  if (!Array.isArray(input)) return []
  const numeric = input
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  return Array.from(new Set(numeric))
}

function parseRoleNames(input: any): string[] {
  if (!Array.isArray(input)) return []
  return uniqueStrings(
    input
      .map((value) => normalizeRoleName(value))
      .filter((value) => value.length > 0)
  )
}

function parseTeamKeys(input: any): string[] {
  if (!Array.isArray(input)) return []
  return uniqueStrings(
    input
      .map((value) => normalizeTeamKey(value))
      .filter((value) => value.length > 0)
  )
}

function trimSlash(url: string) {
  return String(url || '').replace(/\/+$/, '')
}

function htmlEscape(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatInviteExpiryIst(date: Date): string {
  const day = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
  const time = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  }).format(date)
  return `${day} at ${time} IST`
}

function hashInviteToken(rawToken: string) {
  return crypto.createHash('sha256').update(`${rawToken}:${TOKEN_PEPPER}`).digest('hex')
}

function choosePrimaryRole(roleNames: string[]): string {
  const normalized = uniqueStrings(roleNames.map((roleName) => normalizeRoleName(roleName)))
  for (const priority of ROLE_PRIORITY) {
    if (normalized.includes(priority)) return priority
  }
  return normalized[0] || 'USER'
}

function invitationContext() {
  const appName = String(
    process.env.APPLICATION_NAME ||
    process.env.APP_NAME ||
    process.env.ORG_NAME ||
    'TB ITSM'
  ).trim()
  const appBaseUrl = trimSlash(
    String(
      process.env.FRONTEND_URL ||
      process.env.APP_URL ||
      process.env.WEB_APP_URL ||
      'http://localhost:5173'
    ).trim()
  )
  const loginUrl = String(process.env.INVITE_LOGIN_URL || 'http://localhost:3000/login').trim()
  const supportEmail = String(
    process.env.SUPPORT_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || ''
  ).trim()
  const senderName = String(process.env.INVITE_SENDER_NAME || 'TB ITSM Support').trim()
  const senderTitle = String(process.env.INVITE_SENDER_TITLE || 'Support Team').trim()
  const companyName = String(process.env.COMPANY_NAME || appName).trim()
  const appBaseMail = String(
    process.env.APPLICATION_BASE_MAIL ||
    process.env.APP_BASE_MAIL ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    'no-reply@itsm.local'
  ).trim()

  return {
    appName,
    appBaseUrl,
    loginUrl,
    supportEmail,
    senderName,
    senderTitle,
    companyName,
    appBaseMail,
  }
}

function assertRateLimit(key: string, maxAttempts: number) {
  const now = Date.now()
  const cutoff = now - INVITE_RATE_WINDOW_MS
  const hits = (inviteRateState.get(key) || []).filter((ts) => ts >= cutoff)
  if (hits.length >= maxAttempts) {
    throw { status: 429, message: 'Rate limit exceeded. Please try again later.' }
  }
  hits.push(now)
  inviteRateState.set(key, hits)
}

async function ensureInvitationSchema() {
  if (!invitationSchemaReady) {
    invitationSchemaReady = (async () => {
      await ensureRbacSeeded()
      await enforceProtectedAdminBaseline()
      await query(`
        CREATE TABLE IF NOT EXISTS tenants (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL DEFAULT 'ACTIVE',
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await query(
        `INSERT INTO tenants (id, name, status)
         VALUES (1, 'Default Tenant', 'ACTIVE')
         ON CONFLICT (id) DO NOTHING`
      )
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER`)
      await query(`UPDATE "User" SET "tenantId" = 1 WHERE "tenantId" IS NULL`)
      await query(`CREATE INDEX IF NOT EXISTS idx_user_tenant_id ON "User"("tenantId")`)

      await query(`
        CREATE TABLE IF NOT EXISTS teams (
          team_id SERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL,
          team_key TEXT NOT NULL,
          team_name TEXT NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(tenant_id, team_key)
        )
      `)
      await query(`
        CREATE TABLE IF NOT EXISTS team_members (
          team_id INTEGER NOT NULL REFERENCES teams(team_id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY(team_id, user_id)
        )
      `)
      await query(`CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)`)

      await query(`
        CREATE TABLE IF NOT EXISTS invitations (
          invitation_id BIGSERIAL PRIMARY KEY,
          tenant_id INTEGER NOT NULL,
          user_id INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
          email TEXT NOT NULL,
          invited_by INTEGER REFERENCES "User"("id") ON DELETE SET NULL,
          token_hash TEXT,
          expires_at TIMESTAMP(3),
          status TEXT NOT NULL DEFAULT 'PENDING',
          resend_count INTEGER NOT NULL DEFAULT 0,
          last_sent_at TIMESTAMP(3),
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          accepted_at TIMESTAMP(3),
          revoked_at TIMESTAMP(3)
        )
      `)
      await query(`
        CREATE TABLE IF NOT EXISTS invitation_roles (
          invitation_id BIGINT NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
          role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
          PRIMARY KEY(invitation_id, role_id)
        )
      `)
      await query(`
        CREATE TABLE IF NOT EXISTS invitation_teams (
          invitation_id BIGINT NOT NULL REFERENCES invitations(invitation_id) ON DELETE CASCADE,
          team_key TEXT NOT NULL,
          PRIMARY KEY(invitation_id, team_key)
        )
      `)
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash_unique ON invitations(token_hash) WHERE token_hash IS NOT NULL`)
      await query(`CREATE INDEX IF NOT EXISTS idx_invitations_tenant_email_created ON invitations(tenant_id, email, created_at DESC)`)
      await query(`CREATE INDEX IF NOT EXISTS idx_invitations_user_created ON invitations(user_id, created_at DESC)`)

      await query(`
        INSERT INTO teams (tenant_id, team_key, team_name)
        SELECT 1, tq.queue_key, tq.queue_label
        FROM ticket_queues tq
        ON CONFLICT (tenant_id, team_key) DO UPDATE
        SET team_name = EXCLUDED.team_name
      `)
    })()
  }
  await invitationSchemaReady
}

async function getUserRoleNames(userId: number, fallbackRole?: string | null): Promise<string[]> {
  try {
    const rows = await query<{ role_name: string }>(
      `SELECT DISTINCT r.role_name
       FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.role_id
       WHERE ur.user_id = $1`,
      [userId]
    )
    const mapped = uniqueStrings(rows.map((row) => normalizeRoleName(row.role_name)))
    if (mapped.length > 0) return mapped
  } catch {
    // Legacy environments may not have user_roles yet.
  }
  const fallback = normalizeRoleName(fallbackRole || 'USER')
  return [fallback || 'USER']
}

async function getUserPermissionSet(userId: number, roleNames: string[]): Promise<Set<string>> {
  const permissions = new Set<string>()
  try {
    const rows = await query<{ permission_key: string; allowed: boolean }>(
      `SELECT
         p.permission_key,
         COALESCE(
           uo.allowed,
           BOOL_OR(CASE WHEN ur.user_id IS NOT NULL THEN rp.allowed ELSE FALSE END),
           FALSE
         ) AS allowed
       FROM permissions p
       LEFT JOIN role_permissions rp ON rp.permission_id = p.permission_id
       LEFT JOIN user_roles ur
         ON ur.role_id = rp.role_id
        AND ur.user_id = $1
       LEFT JOIN user_permissions_override uo
         ON uo.permission_id = p.permission_id
        AND uo.user_id = $1
       GROUP BY p.permission_id, p.permission_key, uo.allowed`,
      [userId]
    )
    for (const row of rows) {
      if (row.allowed) permissions.add(String(row.permission_key || ''))
    }
  } catch {
    // Ignore and fall back to role-based shortcut.
  }
  if (roleNames.includes('ADMIN')) permissions.add('*')
  return permissions
}

async function getActorContext(actorUserId: number): Promise<ActorContext> {
  await ensureInvitationSchema()
  const actor = await queryOne<{
    id: number
    name: string | null
    email: string | null
    tenantId: number | null
    role: string | null
  }>(
    `SELECT "id", "name", "email", "tenantId", "role"
     FROM "User"
     WHERE "id" = $1`,
    [actorUserId]
  )
  if (!actor) throw { status: 401, message: 'Unauthorized' }

  const tenantId = Number(actor.tenantId || 1)
  const roles = await getUserRoleNames(actor.id, actor.role)
  const permissions = await getUserPermissionSet(actor.id, roles)
  return {
    userId: actor.id,
    tenantId,
    name: actor.name,
    email: actor.email,
    roles,
    permissions,
  }
}

async function resolveRoleRows(payload: { roleIds?: any; roleNames?: any }) {
  const roleIdsInput = parseRoleIds(payload.roleIds)
  const roleNamesInput = parseRoleNames(payload.roleNames)

  let rows: RoleRow[] = []
  if (roleIdsInput.length > 0) {
    rows = await query<RoleRow>(
      `SELECT role_id, role_name
       FROM roles
       WHERE role_id = ANY($1::int[])`,
      [roleIdsInput]
    )
  }
  if (rows.length === 0 && roleNamesInput.length > 0) {
    rows = await query<RoleRow>(
      `SELECT role_id, role_name
       FROM roles
       WHERE UPPER(role_name) = ANY($1::text[])`,
      [roleNamesInput]
    )
  }
  if (rows.length === 0) {
    const fallback = await query<RoleRow>(
      `SELECT role_id, role_name
       FROM roles
       WHERE role_name = 'USER'
       LIMIT 1`
    )
    rows = fallback
  }
  if (rows.length === 0) throw { status: 400, message: 'No valid role found for invitation' }
  return rows.map((row) => ({ role_id: Number(row.role_id), role_name: normalizeRoleName(row.role_name) }))
}

async function getRolePermissionKeys(roleIds: number[]): Promise<Set<string>> {
  if (roleIds.length === 0) return new Set()
  try {
    const rows = await query<{ permission_key: string }>(
      `SELECT DISTINCT p.permission_key
       FROM role_permissions rp
       INNER JOIN permissions p ON p.permission_id = rp.permission_id
       WHERE rp.role_id = ANY($1::int[])
         AND rp.allowed = TRUE`,
      [roleIds]
    )
    return new Set(rows.map((row) => String(row.permission_key || '')))
  } catch {
    return new Set()
  }
}

async function assertAssignableByActor(actor: ActorContext, roleIds: number[]) {
  if (actor.permissions.has('*') || actor.roles.includes('ADMIN')) return
  const requestedPermissionKeys = await getRolePermissionKeys(roleIds)
  for (const permissionKey of requestedPermissionKeys) {
    if (!actor.permissions.has(permissionKey)) {
      throw { status: 403, message: 'Cannot assign a role with higher privileges than your account.' }
    }
  }
}

async function getRoleRowsForUser(userId: number): Promise<RoleRow[]> {
  const rows = await query<RoleRow>(
    `SELECT DISTINCT r.role_id, r.role_name
     FROM roles r
     INNER JOIN user_roles ur ON ur.role_id = r.role_id
     WHERE ur.user_id = $1`,
    [userId]
  )
  if (rows.length > 0) {
    return rows.map((row) => ({ role_id: Number(row.role_id), role_name: normalizeRoleName(row.role_name) }))
  }
  const fallback = await queryOne<{ role_id: number; role_name: string }>(
    `SELECT r.role_id, r.role_name
     FROM roles r
     INNER JOIN "User" u ON UPPER(COALESCE(u."role"::text, 'USER')) = r.role_name
     WHERE u."id" = $1
     LIMIT 1`,
    [userId]
  )
  if (fallback) {
    return [{ role_id: Number(fallback.role_id), role_name: normalizeRoleName(fallback.role_name) }]
  }
  const userFallback = await queryOne<RoleRow>(
    `SELECT role_id, role_name
     FROM roles
     WHERE role_name = 'USER'
     LIMIT 1`
  )
  if (!userFallback) throw { status: 500, message: 'RBAC roles are not initialized.' }
  return [{ role_id: Number(userFallback.role_id), role_name: 'USER' }]
}

async function getTeamKeysForUser(userId: number): Promise<string[]> {
  const serviceAccount = await queryOne<{ queueIds: string[] }>(
    `SELECT "queueIds"
     FROM "ServiceAccounts"
     WHERE "userId" = $1
       AND "enabled" = TRUE`,
    [userId]
  )
  if (!serviceAccount) return []
  if (!Array.isArray(serviceAccount.queueIds)) return []
  return uniqueStrings(serviceAccount.queueIds.map((queueId) => normalizeTeamKey(queueId)))
}

async function syncTeamMembershipWithClient(
  client: any,
  userId: number,
  tenantId: number,
  teamKeys: string[]
) {
  const normalizedTeamKeys = uniqueStrings(teamKeys.map((teamKey) => normalizeTeamKey(teamKey)))
  if (normalizedTeamKeys.length === 0) {
    await client.query(
      `DELETE FROM team_members
       WHERE user_id = $1
         AND team_id IN (SELECT team_id FROM teams WHERE tenant_id = $2)`,
      [userId, tenantId]
    )
    return
  }

  for (const teamKey of normalizedTeamKeys) {
    await client.query(
      `INSERT INTO teams (tenant_id, team_key, team_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, team_key) DO UPDATE
       SET team_name = EXCLUDED.team_name`,
      [tenantId, teamKey, teamKey.toUpperCase()]
    )
  }

  const teamRows = await client.query(
    `SELECT team_id, team_key
     FROM teams
     WHERE tenant_id = $1
       AND team_key = ANY($2::text[])`,
    [tenantId, normalizedTeamKeys]
  )

  await client.query(
    `DELETE FROM team_members
     WHERE user_id = $1
       AND team_id IN (SELECT team_id FROM teams WHERE tenant_id = $2)`,
    [userId, tenantId]
  )

  for (const row of (teamRows.rows || []) as Array<{ team_id: number; team_key: string }>) {
    await client.query(
      `INSERT INTO team_members (team_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (team_id, user_id) DO NOTHING`,
      [row.team_id, userId]
    )
  }
}

async function syncUserRolesBestEffort(client: any, userId: number, roleIds: number[]) {
  const runBestEffort = async (sql: string, params: any[], swallowErrorCodes: string[]) => {
    const sp = `sp_user_roles_${Date.now()}_${Math.floor(Math.random() * 10000)}`
    await client.query(`SAVEPOINT ${sp}`)
    try {
      await client.query(sql, params)
      await client.query(`RELEASE SAVEPOINT ${sp}`)
    } catch (error: any) {
      await client.query(`ROLLBACK TO SAVEPOINT ${sp}`)
      await client.query(`RELEASE SAVEPOINT ${sp}`)
      if (swallowErrorCodes.includes(String(error?.code || ''))) return
      throw error
    }
  }

  try {
    await runBestEffort(
      'DELETE FROM user_roles WHERE user_id = $1',
      [userId],
      ['42P01'] // table missing in legacy env
    )
  } catch (error: any) {
    if (error?.code === '42P01') return
    throw error
  }

  for (const roleId of roleIds) {
    await runBestEffort(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId],
      ['23503', '42P01'] // FK mismatch / table missing
    )
  }
}

async function applyRoleAndTeamAssignments(
  userId: number,
  tenantId: number,
  roleRows: RoleRow[],
  teamKeys: string[],
  status: 'INVITED' | 'ACTIVE'
) {
  const userRow = await queryOne<{ email: string | null }>('SELECT "email" FROM "User" WHERE "id" = $1', [userId])
  const protectedAdmin = isProtectedAdminEmail(userRow?.email || '')
  const roleIds = protectedAdmin
    ? []
    : uniqueStrings(roleRows.map((row) => String(row.role_id))).map((value) => Number(value))
  const roleNames = protectedAdmin ? ['ADMIN'] : roleRows.map((row) => normalizeRoleName(row.role_name))
  const primaryRole = protectedAdmin ? 'ADMIN' : choosePrimaryRole(roleNames)
  const hasAgentRole = !protectedAdmin && roleNames.includes('AGENT')
  const queueIds = hasAgentRole
    ? (teamKeys.length > 0 ? teamKeys : ['helpdesk']).map((queueId) => normalizeTeamKey(queueId))
    : []

  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      if (protectedAdmin) {
        try {
          await client.query(
            `INSERT INTO user_roles (user_id, role_id)
             SELECT $1, role_id
             FROM roles
             WHERE role_name = 'ADMIN'
             ON CONFLICT (user_id, role_id) DO NOTHING`,
            [userId]
          )
        } catch {
          // Legacy installs may not have role tables yet.
        }
      } else {
        await syncUserRolesBestEffort(client, userId, roleIds)
      }

      await client.query(
        `UPDATE "User"
         SET "role" = $1,
             "status" = $2,
             "tenantId" = $3,
             "updatedAt" = NOW()
         WHERE "id" = $4`,
        [primaryRole, status, tenantId, userId]
      )

      if (hasAgentRole) {
        await client.query(
          `INSERT INTO "ServiceAccounts" ("userId", "enabled", "autoUpgradeQueues", "queueIds", "createdAt", "updatedAt")
           VALUES ($1, TRUE, FALSE, $2, NOW(), NOW())
           ON CONFLICT ("userId")
           DO UPDATE SET
             "enabled" = TRUE,
             "autoUpgradeQueues" = FALSE,
             "queueIds" = EXCLUDED."queueIds",
             "updatedAt" = NOW()`,
          [userId, queueIds]
        )
        await syncTeamMembershipWithClient(client, userId, tenantId, queueIds)
      } else {
        await client.query(`DELETE FROM "ServiceAccounts" WHERE "userId" = $1`, [userId])
        await syncTeamMembershipWithClient(client, userId, tenantId, [])
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

async function upsertInvitationMappings(invitationId: number, roleRows: RoleRow[], teamKeys: string[]) {
  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      await client.query('DELETE FROM invitation_roles WHERE invitation_id = $1', [invitationId])
      await client.query('DELETE FROM invitation_teams WHERE invitation_id = $1', [invitationId])

      for (const roleRow of roleRows) {
        await client.query(
          `INSERT INTO invitation_roles (invitation_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT (invitation_id, role_id) DO NOTHING`,
          [invitationId, roleRow.role_id]
        )
      }
      for (const teamKey of teamKeys) {
        await client.query(
          `INSERT INTO invitation_teams (invitation_id, team_key)
           VALUES ($1, $2)
           ON CONFLICT (invitation_id, team_key) DO NOTHING`,
          [invitationId, normalizeTeamKey(teamKey)]
        )
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

async function ensureInvitedUser(
  email: string,
  tenantId: number,
  name: string | null,
  primaryRole: string
): Promise<{ id: number; status: string }> {
  const effectivePrimaryRole = isProtectedAdminEmail(email) ? 'ADMIN' : primaryRole
  const existing = await queryOne<{
    id: number
    status: string | null
    tenantId: number | null
    name: string | null
  }>(
    `SELECT "id", "status", "tenantId", "name"
     FROM "User"
     WHERE LOWER("email") = LOWER($1)
     LIMIT 1`,
    [email]
  )

  if (existing) {
    const existingTenantId = Number(existing.tenantId || 1)
    if (existingTenantId !== tenantId) {
      throw { status: 403, message: 'Cross-tenant invitation is not allowed.' }
    }
    const existingStatus = String(existing.status || '').toUpperCase()
    if (existingStatus === 'ACTIVE') {
      throw { status: 409, message: 'User account is already active. Use role update or password reset flow.' }
    }
    if (name && String(existing.name || '').trim().length === 0) {
      await query(`UPDATE "User" SET "name" = $1, "updatedAt" = NOW() WHERE "id" = $2`, [name, existing.id])
    }
    return { id: existing.id, status: existingStatus || 'INVITED' }
  }

  const randomPassword = crypto.randomBytes(32).toString('hex')
  const hashedPassword = await bcrypt.hash(randomPassword, 12)
  const created = await queryOne<{ id: number }>(
    `INSERT INTO "User" (
       "email", "password", "name", "role", "status", "tenantId", "createdAt", "updatedAt"
     )
     VALUES ($1, $2, $3, $4, 'INVITED', $5, NOW(), NOW())
     RETURNING "id"`,
    [email, hashedPassword, name, effectivePrimaryRole, tenantId]
  )
  if (!created) throw { status: 500, message: 'Failed to create invited user.' }
  return { id: created.id, status: 'INVITED' }
}

async function createInvitationRow(input: {
  tenantId: number
  userId: number
  email: string
  invitedBy: number
}) {
  const row = await queryOne<{ invitation_id: number }>(
    `INSERT INTO invitations (tenant_id, user_id, email, invited_by, status, resend_count)
     VALUES ($1, $2, $3, $4, 'PENDING', 0)
     RETURNING invitation_id`,
    [input.tenantId, input.userId, input.email, input.invitedBy]
  )
  if (!row) throw { status: 500, message: 'Failed to create invitation.' }
  return Number(row.invitation_id)
}

async function sendInvitationEmail(
  email: string,
  name: string | null,
  inviteLink: string,
  expiresAt: Date,
  mode: InvitationMode,
  actor: ActorContext
) {
  void actor
  const ctx = invitationContext()
  const person = (String(name || '').trim() || 'User')
  const expiresTextIst = formatInviteExpiryIst(expiresAt)
  const supportEmail = String(ctx.supportEmail || 'girikumaran@trustybytes.in').trim()

  const subject = mode === 'reinvite'
    ? `Account Reactivation Link for ${ctx.appName}`
    : 'Invitation to Activate Your TB ITSM Account'

  const text = mode === 'reinvite'
    ? [
      `Dear ${person},`,
      '',
      `As per your request, we are sending you a new account reactivation link for your ${ctx.appName} account, as your previous credentials were reported as compromised.`,
      '',
      `To secure your account and set a new password, please click the reactivation link below:`,
      '',
      `Reactivate Account`,
      `${inviteLink}`,
      '',
      `For security reasons, this link will expire on ${expiresTextIst}. We strongly recommend completing the reactivation process as soon as possible.`,
      '',
      `If you did not request this reactivation link, please ignore this email and immediately report it to ${supportEmail}.`,
      '',
      `Best regards,`,
      `TB Support Team`,
    ].join('\n')
    : [
      `Dear ${person},`,
      '',
      `You have a pending invitation to join TB ITSM, and your account setup is almost complete.`,
      '',
      `To verify your details and activate your account, please click the Get Started button below.`,
      '',
      `Get Started: ${inviteLink}`,
      '',
      `Once your account has been successfully activated, you may sign in using the following link:`,
      `http://localhost:3000/login`,
      '',
      `Please note that this invitation will expire on ${expiresTextIst}. We kindly recommend completing the activation process before this date to avoid any inconvenience.`,
      '',
      `If you did not expect this invitation or require any assistance, please contact our support team at ${supportEmail}.`,
      '',
      `Thank you,`,
      '',
      'TB Support Team',
    ].join('\n')

  const html = mode === 'reinvite'
    ? `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#111827;background:#f3f4f6;padding:24px">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
        <p style="margin:0 0 12px 0;color:#111827">Dear ${htmlEscape(person)},</p>
        <p style="margin:0 0 16px 0;color:#111827">As per your request, we are sending you a new account reactivation link for your <strong>${htmlEscape(ctx.appName)}</strong> account, as your previous credentials were reported as compromised.</p>
        <p style="margin:0 0 20px 0;color:#111827">To secure your account and set a new password, please click the reactivation link below:</p>
        <p style="margin:0 0 22px 0">
          <a href="${htmlEscape(inviteLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:999px;font-weight:600">
            Reactivate Account
          </a>
        </p>
        <p style="margin:0 0 16px 0;color:#6b7280;font-size:12px">For security reasons, this link will expire on ${htmlEscape(expiresTextIst)}. We strongly recommend completing the reactivation process as soon as possible.</p>
        <p style="margin:0 0 16px 0;color:#111827">If you did not request this reactivation link, please ignore this email and immediately report it to <a href="mailto:${htmlEscape(supportEmail)}">${htmlEscape(supportEmail)}</a>.</p>
        <p style="margin:0;color:#111827">Best regards,<br/>TB Support Team</p>
      </div>
    </div>
  `
    : `
    <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#111827;background:#f3f4f6;padding:24px">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px">
        <p style="margin:0 0 12px 0;color:#111827"><strong>Dear ${htmlEscape(person)},</strong></p>
        <p style="margin:0 0 16px 0;color:#111827">You have a pending invitation to join <strong>TB ITSM</strong>, and your account setup is almost complete.</p>
        <p style="margin:0 0 20px 0;color:#111827">To verify your details and activate your account, please click the Get Started button below.</p>
        <p style="margin:0 0 22px 0">
          <a href="${htmlEscape(inviteLink)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 24px;border-radius:999px;font-weight:600">
            Get Started
          </a>
        </p>
        <p style="margin:0 0 6px 0;color:#374151;font-size:13px">Once your account has been successfully activated, you may sign in using the following link:</p>
        <p style="margin:0 0 14px 0">
          <a href="http://localhost:3000/login">http://localhost:3000/login</a>
        </p>
        <p style="margin:0 0 16px 0;color:#6b7280;font-size:12px">Please note that this invitation will expire on ${htmlEscape(expiresTextIst)}. We kindly recommend completing the activation process before this date to avoid any inconvenience.</p>
        <p style="margin:0 0 16px 0;color:#111827">If you did not expect this invitation or require any assistance, please contact our support team at <a href="mailto:${htmlEscape(supportEmail)}">${htmlEscape(supportEmail)}</a>.</p>
        <p style="margin:0;color:#111827">Thank you,<br/>TB Support Team</p>
      </div>
    </div>
  `

  await sendSmtpMail({
    to: email,
    from: ctx.appBaseMail,
    subject,
    text,
    html,
  })
}

async function sendInviteFromInvitation(
  invitationId: number,
  actor: ActorContext,
  mode: InvitationMode,
  incrementResendCount: boolean,
  meta?: InviteMeta
) {
  const invitation = await queryOne<{
    invitation_id: number
    user_id: number | null
    email: string
    status: string
    resend_count: number
    expires_at: string | null
    user_name: string | null
    tenant_id: number
  }>(
    `SELECT
       i.invitation_id,
       i.user_id,
       i.email,
       i.status,
       i.resend_count,
       i.expires_at,
       i.tenant_id,
       u."name" AS user_name
     FROM invitations i
     LEFT JOIN "User" u ON u."id" = i.user_id
     WHERE i.invitation_id = $1`,
    [invitationId]
  )
  if (!invitation) throw { status: 404, message: 'Invitation not found.' }
  if (Number(invitation.tenant_id) !== actor.tenantId) throw { status: 403, message: 'Cross-tenant invitation access denied.' }

  const currentStatus = String(invitation.status || '').toUpperCase()
  if (currentStatus === 'ACCEPTED') {
    throw { status: 400, message: 'Invitation already accepted. Use password reset.' }
  }
  if (currentStatus === 'REVOKED') {
    throw { status: 400, message: 'Invitation has been revoked. Create a new invitation.' }
  }
  if (incrementResendCount && Number(invitation.resend_count || 0) >= INVITE_RESEND_MAX) {
    throw { status: 429, message: `Re-invite limit reached (${INVITE_RESEND_MAX}).` }
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashInviteToken(rawToken)
  const expiresAt = new Date(Date.now() + INVITE_TOKEN_TTL_HOURS * 60 * 60 * 1000)
  await query(
    `UPDATE invitations
     SET token_hash = $1,
         expires_at = $2,
         status = 'PENDING',
         last_sent_at = NOW(),
         resend_count = CASE WHEN $3::boolean THEN resend_count + 1 ELSE resend_count END
     WHERE invitation_id = $4`,
    [tokenHash, expiresAt, incrementResendCount, invitationId]
  )

  const ctx = invitationContext()
  const activationBase = String(process.env.INVITE_ACTIVATION_BASE_URL || 'http://localhost:3000/#').trim()
  const root = activationBase.includes('#') ? activationBase : `${activationBase}/#`
  const inviteQuery = new URLSearchParams({
    userId: String(Number(invitation.user_id || 0)),
    token: String(rawToken),
    email: String(invitation.email || ''),
  }).toString()
  const inviteLink = `${root.replace(/\/+$/, '')}/auth/Account/ConfirmEmail?${inviteQuery}`
  await sendInvitationEmail(invitation.email, invitation.user_name, inviteLink, expiresAt, mode, actor)

  const updated = await queryOne<{ resend_count: number }>(
    `SELECT resend_count
     FROM invitations
     WHERE invitation_id = $1`,
    [invitationId]
  )

  await auditLog({
    action: mode === 'reinvite' ? 'invite_resent' : 'invite_sent',
    entity: 'invitation',
    entityId: invitationId,
    user: actor.userId,
    meta: {
      tenantId: actor.tenantId,
      email: invitation.email,
      ipAddress: meta?.ipAddress || null,
      expiresAt: expiresAt.toISOString(),
      resendCount: Number(updated?.resend_count || 0),
    },
  })

  return {
    invitationId,
    inviteStatus: 'invited_not_accepted',
    status: 'PENDING',
    expiresAt: expiresAt.toISOString(),
    sentTo: invitation.email,
    sentFrom: invitationContext().appBaseMail,
    resendCount: Number(updated?.resend_count || 0),
  }
}

export async function createInvitationRequest(
  payload: {
    email: string
    name?: string
    roleIds?: number[]
    role_ids?: number[]
    roleNames?: string[]
    teamIds?: string[]
    team_ids?: string[]
    sendNow?: boolean
  },
  actorUserId: number,
  meta?: InviteMeta
) {
  await ensureInvitationSchema()
  if (!Number.isFinite(actorUserId) || actorUserId <= 0) throw { status: 401, message: 'Unauthorized' }

  const actor = await getActorContext(actorUserId)
  assertRateLimit(`invite:create:${actor.userId}`, INVITE_CREATE_RATE_LIMIT)

  const email = normalizeEmail(payload.email)
  if (!email) throw { status: 400, message: 'Email is required.' }

  const roleRows = await resolveRoleRows({
    roleIds: payload.roleIds || payload.role_ids,
    roleNames: payload.roleNames,
  })
  const roleIds = roleRows.map((roleRow) => roleRow.role_id)
  const roleNames = roleRows.map((roleRow) => roleRow.role_name)
  const primaryRole = choosePrimaryRole(roleNames)

  const teamKeys = parseTeamKeys(payload.teamIds || payload.team_ids)
  const hasAgentRole = roleNames.includes('AGENT')
  if (hasAgentRole && teamKeys.length === 0) {
    throw { status: 400, message: 'At least one team must be assigned for Agent role.' }
  }

  await assertAssignableByActor(actor, roleIds)

  const invitedName = String(payload.name || '').trim() || null
  const targetUser = await ensureInvitedUser(email, actor.tenantId, invitedName, primaryRole)
  await applyRoleAndTeamAssignments(targetUser.id, actor.tenantId, roleRows, teamKeys, 'INVITED')

  if (payload.sendNow === false) {
    const existingPending = await queryOne<{ invitation_id: number; last_sent_at: string | null }>(
      `SELECT invitation_id, last_sent_at
       FROM invitations
       WHERE tenant_id = $1
         AND user_id = $2
         AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 1`,
      [actor.tenantId, targetUser.id]
    )
    if (existingPending) {
      return {
        invitationId: Number(existingPending.invitation_id),
        inviteStatus: existingPending.last_sent_at ? 'invited_not_accepted' : 'invite_pending',
        status: 'PENDING',
        sent: Boolean(existingPending.last_sent_at),
        email,
      }
    }
  }

  const latestPending = await queryOne<{ invitation_id: number; last_sent_at: string | null }>(
    `SELECT invitation_id, last_sent_at
     FROM invitations
     WHERE tenant_id = $1
       AND user_id = $2
       AND status = 'PENDING'
     ORDER BY created_at DESC
     LIMIT 1`,
    [actor.tenantId, targetUser.id]
  )
  if (latestPending) {
    if (!latestPending.last_sent_at) {
      return sendInviteFromInvitation(Number(latestPending.invitation_id), actor, 'invite', false, meta)
    }
    throw { status: 400, message: 'User already invited. Use re-invite.' }
  }

  const invitationId = await createInvitationRow({
    tenantId: actor.tenantId,
    userId: targetUser.id,
    email,
    invitedBy: actor.userId,
  })
  await upsertInvitationMappings(invitationId, roleRows, teamKeys)

  await auditLog({
    action: 'invite_created',
    entity: 'invitation',
    entityId: invitationId,
    user: actor.userId,
    meta: {
      tenantId: actor.tenantId,
      email,
      roleIds,
      teamKeys,
      ipAddress: meta?.ipAddress || null,
    },
  })

  if (payload.sendNow === false) {
    return {
      invitationId,
      inviteStatus: 'invite_pending',
      status: 'PENDING',
      sent: false,
      email,
    }
  }

  return sendInviteFromInvitation(invitationId, actor, 'invite', false, meta)
}

export async function inviteExistingUser(
  userId: number,
  actorUserId: number,
  options?: {
    mode?: InvitationMode
    sendNow?: boolean
  },
  meta?: InviteMeta
) {
  await ensureInvitationSchema()
  if (!Number.isFinite(userId) || userId <= 0) throw { status: 400, message: 'Invalid user id.' }
  if (!Number.isFinite(actorUserId) || actorUserId <= 0) throw { status: 401, message: 'Unauthorized' }

  const actor = await getActorContext(actorUserId)
  const mode: InvitationMode = options?.mode || 'invite'
  const sendNow = options?.sendNow !== false

  const user = await queryOne<{
    id: number
    email: string
    name: string | null
    tenantId: number | null
    status: string | null
  }>(
    `SELECT "id", "email", "name", "tenantId", "status"
     FROM "User"
     WHERE "id" = $1`,
    [userId]
  )
  if (!user) throw { status: 404, message: 'User not found.' }
  const userTenantId = Number(user.tenantId || 1)
  if (userTenantId !== actor.tenantId) throw { status: 403, message: 'Cross-tenant invitation is not allowed.' }

  if (mode !== 'reinvite' && String(user.status || '').toUpperCase() === 'ACTIVE') {
    throw { status: 400, message: 'User account is already active. Use password reset flow.' }
  }

  const roleRows = await getRoleRowsForUser(userId)
  const roleNames = roleRows.map((roleRow) => roleRow.role_name)
  const teamKeys = await getTeamKeysForUser(userId)
  if (roleNames.includes('AGENT') && teamKeys.length === 0) {
    teamKeys.push('helpdesk')
  }

  if (mode === 'reinvite') {
    const latest = await queryOne<{ invitation_id: number; status: string }>(
      `SELECT invitation_id, status
       FROM invitations
       WHERE tenant_id = $1
         AND user_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [actor.tenantId, userId]
    )
    if (latest) {
      const status = String(latest.status || '').toUpperCase()
      if (['PENDING', 'EXPIRED'].includes(status)) {
        assertRateLimit(`invite:resend:user:${actor.userId}:${userId}`, INVITE_RESEND_RATE_LIMIT)
        return sendInviteFromInvitation(Number(latest.invitation_id), actor, 'reinvite', true, meta)
      }
    }

    assertRateLimit(`invite:resend:user:${actor.userId}:${userId}`, INVITE_RESEND_RATE_LIMIT)
    const invitationId = await createInvitationRow({
      tenantId: actor.tenantId,
      userId,
      email: normalizeEmail(user.email),
      invitedBy: actor.userId,
    })
    await upsertInvitationMappings(invitationId, roleRows, teamKeys)
    await auditLog({
      action: 'invite_created',
      entity: 'invitation',
      entityId: invitationId,
      user: actor.userId,
      meta: {
        tenantId: actor.tenantId,
        userId,
        email: normalizeEmail(user.email),
        roleIds: roleRows.map((roleRow) => roleRow.role_id),
        teamKeys,
        mode: 'reactivate',
        ipAddress: meta?.ipAddress || null,
      },
    })
    return sendInviteFromInvitation(invitationId, actor, 'reinvite', false, meta)
  }

  if (!sendNow) {
    const latestPending = await queryOne<{ invitation_id: number; last_sent_at: string | null }>(
      `SELECT invitation_id, last_sent_at
       FROM invitations
       WHERE tenant_id = $1
         AND user_id = $2
         AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 1`,
      [actor.tenantId, userId]
    )
    if (latestPending) {
      return {
        invitationId: Number(latestPending.invitation_id),
        inviteStatus: latestPending.last_sent_at ? 'invited_not_accepted' : 'invite_pending',
        status: 'PENDING',
        sent: Boolean(latestPending.last_sent_at),
        email: normalizeEmail(user.email),
      }
    }
  }

  const latestPending = await queryOne<{ invitation_id: number; last_sent_at: string | null }>(
    `SELECT invitation_id, last_sent_at
     FROM invitations
     WHERE tenant_id = $1
       AND user_id = $2
       AND status = 'PENDING'
     ORDER BY created_at DESC
     LIMIT 1`,
    [actor.tenantId, userId]
  )
  if (latestPending) {
    if (!latestPending.last_sent_at) {
      return sendInviteFromInvitation(Number(latestPending.invitation_id), actor, 'invite', false, meta)
    }
    throw { status: 400, message: 'User already invited. Use re-invite.' }
  }

  const invitationId = await createInvitationRow({
    tenantId: actor.tenantId,
    userId,
    email: normalizeEmail(user.email),
    invitedBy: actor.userId,
  })
  await upsertInvitationMappings(invitationId, roleRows, teamKeys)

  await auditLog({
    action: 'invite_created',
    entity: 'invitation',
    entityId: invitationId,
    user: actor.userId,
    meta: {
      tenantId: actor.tenantId,
      userId,
      email: normalizeEmail(user.email),
      roleIds: roleRows.map((roleRow) => roleRow.role_id),
      teamKeys,
      ipAddress: meta?.ipAddress || null,
    },
  })

  if (!sendNow) {
    return {
      invitationId,
      inviteStatus: 'invite_pending',
      status: 'PENDING',
      sent: false,
      email: normalizeEmail(user.email),
    }
  }

  return sendInviteFromInvitation(invitationId, actor, 'invite', false, meta)
}

export async function resendInvitationById(
  invitationId: number,
  actorUserId: number,
  meta?: InviteMeta
) {
  await ensureInvitationSchema()
  if (!Number.isFinite(invitationId) || invitationId <= 0) throw { status: 400, message: 'Invalid invitation id.' }
  const actor = await getActorContext(actorUserId)
  assertRateLimit(`invite:resend:${actor.userId}:${invitationId}`, INVITE_RESEND_RATE_LIMIT)

  const invitation = await queryOne<{ invitation_id: number; status: string; tenant_id: number; user_id: number | null }>(
    `SELECT invitation_id, status, tenant_id, user_id
     FROM invitations
     WHERE invitation_id = $1`,
    [invitationId]
  )
  if (!invitation) throw { status: 404, message: 'Invitation not found.' }
  if (Number(invitation.tenant_id) !== actor.tenantId) throw { status: 403, message: 'Cross-tenant invitation access denied.' }

  const status = String(invitation.status || '').toUpperCase()
  if (!['PENDING', 'EXPIRED'].includes(status)) {
    throw { status: 400, message: `Cannot re-invite from status: ${status}` }
  }

  if (Number(invitation.user_id || 0) > 0) {
    const user = await queryOne<{ status: string | null }>(
      `SELECT "status"
       FROM "User"
       WHERE "id" = $1`,
      [invitation.user_id]
    )
    if (String(user?.status || '').toUpperCase() === 'ACTIVE') {
      throw { status: 400, message: 'User account is already active. Use password reset flow.' }
    }
  }

  return sendInviteFromInvitation(invitationId, actor, 'reinvite', true, meta)
}

export async function revokeInvitationById(
  invitationId: number,
  actorUserId: number,
  meta?: InviteMeta
) {
  await ensureInvitationSchema()
  if (!Number.isFinite(invitationId) || invitationId <= 0) throw { status: 400, message: 'Invalid invitation id.' }
  const actor = await getActorContext(actorUserId)

  const updated = await queryOne<{ invitation_id: number }>(
    `UPDATE invitations
     SET status = 'REVOKED',
         revoked_at = NOW(),
         token_hash = NULL,
         expires_at = NULL
     WHERE invitation_id = $1
       AND tenant_id = $2
       AND status IN ('PENDING', 'EXPIRED')
     RETURNING invitation_id`,
    [invitationId, actor.tenantId]
  )

  if (!updated) {
    const existing = await queryOne<{ status: string; tenant_id: number }>(
      `SELECT status, tenant_id
       FROM invitations
       WHERE invitation_id = $1`,
      [invitationId]
    )
    if (!existing) throw { status: 404, message: 'Invitation not found.' }
    if (Number(existing.tenant_id) !== actor.tenantId) throw { status: 403, message: 'Cross-tenant invitation access denied.' }
    throw { status: 400, message: `Cannot revoke invitation from status: ${String(existing.status || '').toUpperCase()}` }
  }

  await auditLog({
    action: 'invite_revoked',
    entity: 'invitation',
    entityId: invitationId,
    user: actor.userId,
    meta: {
      tenantId: actor.tenantId,
      ipAddress: meta?.ipAddress || null,
    },
  })

  return { invitationId, status: 'REVOKED' }
}

export async function acceptInvitationToken(
  token: string,
  password: string,
  name?: string | null,
  meta?: InviteMeta
) {
  await ensureInvitationSchema()
  const rawToken = String(token || '').trim()
  if (!rawToken) throw { status: 400, message: 'Invitation token is required.' }
  if (String(password || '').length < 8) throw { status: 400, message: 'Password must be at least 8 characters.' }

  const tokenHash = hashInviteToken(rawToken)
  const invitation = await queryOne<{
    invitation_id: number
    tenant_id: number
    user_id: number | null
    email: string
    status: string
    expires_at: string | null
  }>(
    `SELECT invitation_id, tenant_id, user_id, email, status, expires_at
     FROM invitations
     WHERE token_hash = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tokenHash]
  )
  if (!invitation) throw { status: 400, message: 'Invitation token is invalid.' }

  const status = String(invitation.status || '').toUpperCase()
  if (status === 'REVOKED') throw { status: 400, message: 'Invitation has been revoked.' }
  if (status === 'ACCEPTED') throw { status: 400, message: 'Invitation has already been used.' }
  if (status !== 'PENDING') throw { status: 400, message: `Invitation is not in a valid state: ${status}` }

  const expiresAtMs = invitation.expires_at ? new Date(invitation.expires_at).getTime() : 0
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await query(
      `UPDATE invitations
       SET status = 'EXPIRED',
           token_hash = NULL
       WHERE invitation_id = $1`,
      [invitation.invitation_id]
    )
    throw { status: 400, message: 'Invitation has expired. Ask your administrator to re-invite you.' }
  }

  const roleRows = await query<RoleRow>(
    `SELECT r.role_id, r.role_name
     FROM invitation_roles ir
     INNER JOIN roles r ON r.role_id = ir.role_id
     WHERE ir.invitation_id = $1`,
    [invitation.invitation_id]
  )
  let effectiveRoleRows = roleRows.map((row) => ({ role_id: Number(row.role_id), role_name: normalizeRoleName(row.role_name) }))
  if (isProtectedAdminEmail(invitation.email)) {
    const adminRole = await queryOne<RoleRow>(
      `SELECT role_id, role_name
       FROM roles
       WHERE role_name = 'ADMIN'
       LIMIT 1`
    )
    if (!adminRole) throw { status: 500, message: 'RBAC ADMIN role is not initialized.' }
    effectiveRoleRows = [{ role_id: Number(adminRole.role_id), role_name: 'ADMIN' }]
  }
  if (effectiveRoleRows.length === 0) {
    const fallbackRole = await queryOne<RoleRow>(
      `SELECT role_id, role_name
       FROM roles
       WHERE role_name = 'USER'
       LIMIT 1`
    )
    if (!fallbackRole) throw { status: 500, message: 'RBAC roles are not initialized.' }
    effectiveRoleRows = [{ role_id: Number(fallbackRole.role_id), role_name: 'USER' }]
  }

  const teamRows = await query<{ team_key: string }>(
    `SELECT team_key
     FROM invitation_teams
     WHERE invitation_id = $1`,
    [invitation.invitation_id]
  )
  const invitedTeamKeys = parseTeamKeys(teamRows.map((row) => row.team_key))
  const hasAgentRole = effectiveRoleRows.some((roleRow) => roleRow.role_name === 'AGENT')
  const teamKeys = hasAgentRole
    ? (invitedTeamKeys.length > 0 ? invitedTeamKeys : ['helpdesk'])
    : []

  const nextName = String(name || '').trim() || null
  const passwordHash = await bcrypt.hash(String(password), 12)
  const primaryRole = choosePrimaryRole(effectiveRoleRows.map((roleRow) => roleRow.role_name))
  const tenantId = Number(invitation.tenant_id || 1)

  let activatedUserId = Number(invitation.user_id || 0)

  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      const lockedInvite = await client.query<{
        invitation_id: number
        tenant_id: number
        user_id: number | null
        email: string
        status: string
        expires_at: string | null
      }>(
        `SELECT invitation_id, tenant_id, user_id, email, status, expires_at
         FROM invitations
         WHERE invitation_id = $1
         FOR UPDATE`,
        [invitation.invitation_id]
      )
      if (lockedInvite.rows.length === 0) throw { status: 404, message: 'Invitation not found.' }
      const row = lockedInvite.rows[0]
      const lockedStatus = String(row.status || '').toUpperCase()
      if (lockedStatus !== 'PENDING') throw { status: 400, message: `Invitation is not in a valid state: ${lockedStatus}` }
      const lockedExpires = row.expires_at ? new Date(row.expires_at).getTime() : 0
      if (!Number.isFinite(lockedExpires) || lockedExpires <= Date.now()) {
        await client.query(
          `UPDATE invitations
           SET status = 'EXPIRED',
               token_hash = NULL
           WHERE invitation_id = $1`,
          [row.invitation_id]
        )
        throw { status: 400, message: 'Invitation has expired. Ask your administrator to re-invite you.' }
      }

      const normalizedEmail = normalizeEmail(row.email)
      let targetUserId = Number(row.user_id || 0)
      let userStatus = ''

      if (targetUserId > 0) {
        const byId = await client.query<{ id: number; status: string | null; tenantId: number | null }>(
          `SELECT "id", "status", "tenantId"
           FROM "User"
           WHERE "id" = $1
           FOR UPDATE`,
          [targetUserId]
        )
        if (byId.rows.length > 0) {
          userStatus = String(byId.rows[0].status || '').toUpperCase()
          const userTenantId = Number(byId.rows[0].tenantId || 1)
          if (userTenantId !== tenantId) throw { status: 403, message: 'Cross-tenant invitation access denied.' }
        } else {
          targetUserId = 0
        }
      }

      if (targetUserId <= 0) {
        const byEmail = await client.query<{ id: number; status: string | null; tenantId: number | null }>(
          `SELECT "id", "status", "tenantId"
           FROM "User"
           WHERE LOWER("email") = LOWER($1)
           LIMIT 1
           FOR UPDATE`,
          [normalizedEmail]
        )
        if (byEmail.rows.length > 0) {
          const existingTenantId = Number(byEmail.rows[0].tenantId || 1)
          if (existingTenantId !== tenantId) throw { status: 403, message: 'Cross-tenant invitation access denied.' }
          targetUserId = Number(byEmail.rows[0].id)
          userStatus = String(byEmail.rows[0].status || '').toUpperCase()
        }
      }

      if (targetUserId > 0) {
        await client.query(
          `UPDATE "User"
           SET "password" = $1,
               "name" = COALESCE(NULLIF($2, ''), "name"),
               "status" = 'ACTIVE',
               "role" = $3,
               "tenantId" = $4,
               "updatedAt" = NOW()
           WHERE "id" = $5`,
          [passwordHash, nextName || '', primaryRole, tenantId, targetUserId]
        )
      } else {
        const inserted = await client.query<{ id: number }>(
          `INSERT INTO "User" ("email", "password", "name", "role", "status", "tenantId", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, 'ACTIVE', $5, NOW(), NOW())
           RETURNING "id"`,
          [normalizedEmail, passwordHash, nextName || normalizedEmail, primaryRole, tenantId]
        )
        targetUserId = Number(inserted.rows[0].id)
      }

      await syncUserRolesBestEffort(client, targetUserId, effectiveRoleRows.map((roleRow) => roleRow.role_id))

      if (hasAgentRole) {
        await client.query(
          `INSERT INTO "ServiceAccounts" ("userId", "enabled", "autoUpgradeQueues", "queueIds", "createdAt", "updatedAt")
           VALUES ($1, TRUE, FALSE, $2, NOW(), NOW())
           ON CONFLICT ("userId")
           DO UPDATE SET
             "enabled" = TRUE,
             "autoUpgradeQueues" = FALSE,
             "queueIds" = EXCLUDED."queueIds",
             "updatedAt" = NOW()`,
          [targetUserId, teamKeys]
        )
        await syncTeamMembershipWithClient(client, targetUserId, tenantId, teamKeys)
      } else {
        await client.query(`DELETE FROM "ServiceAccounts" WHERE "userId" = $1`, [targetUserId])
        await syncTeamMembershipWithClient(client, targetUserId, tenantId, [])
      }

      await client.query(
        `UPDATE invitations
         SET user_id = $1,
             status = 'ACCEPTED',
             accepted_at = NOW(),
             token_hash = NULL,
             expires_at = NULL
         WHERE invitation_id = $2`,
        [targetUserId, row.invitation_id]
      )

      await client.query(
        `UPDATE invitations
         SET status = 'REVOKED',
             revoked_at = NOW(),
             token_hash = NULL,
             expires_at = NULL
         WHERE tenant_id = $1
           AND LOWER(email) = LOWER($2)
           AND invitation_id <> $3
           AND status = 'PENDING'`,
        [tenantId, normalizedEmail, row.invitation_id]
      )

      activatedUserId = targetUserId
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })

  await auditLog({
    action: 'invite_accepted',
    entity: 'invitation',
    entityId: invitation.invitation_id,
    user: activatedUserId,
    meta: {
      tenantId,
      email: normalizeEmail(invitation.email),
      roleNames: effectiveRoleRows.map((roleRow) => roleRow.role_name),
      teamKeys,
      ipAddress: meta?.ipAddress || null,
    },
  })

  await auditLog({
    action: 'role_assignment_updated',
    entity: 'user',
    entityId: activatedUserId,
    user: activatedUserId,
    meta: {
      tenantId,
      invitationId: invitation.invitation_id,
      roleNames: effectiveRoleRows.map((roleRow) => roleRow.role_name),
    },
  })

  await auditLog({
    action: 'team_assignment_updated',
    entity: 'user',
    entityId: activatedUserId,
    user: activatedUserId,
    meta: {
      tenantId,
      invitationId: invitation.invitation_id,
      teamKeys,
    },
  })

  await auditLog({
    action: 'account_activated',
    entity: 'user',
    entityId: activatedUserId,
    user: activatedUserId,
    meta: {
      tenantId,
      invitationId: invitation.invitation_id,
      email: normalizeEmail(invitation.email),
    },
  })

  return {
    ok: true,
    invitationId: invitation.invitation_id,
    userId: activatedUserId,
    email: normalizeEmail(invitation.email),
  }
}
