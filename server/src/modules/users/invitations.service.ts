import { createHash } from 'crypto'
import bcrypt from 'bcrypt'
import { query, queryOne } from '../../db'
import { auditLog } from '../../common/logger/logger'
import * as userService from './users.service'
import * as rbacService from './rbac.service'

type InviteOptions = {
  mode?: 'invite' | 'reinvite'
  sendNow?: boolean
  requireImmediate?: boolean
  toEmail?: string
  activationBaseUrl?: string
}

type RequestMeta = {
  ipAddress?: string | null
}

type InvitationRow = {
  invitation_id: number
  user_id: number
  email: string
  status: string
  expires_at: string | null
  last_sent_at: string | null
}

type InviteTargetRow = {
  id: number
  role: string | null
  is_end_user: boolean | null
  is_service_account: boolean | null
}

const INVITE_DB_RETRY_ATTEMPTS = Math.max(0, Number(process.env.INVITE_DB_RETRY_ATTEMPTS || 2))
const INVITE_DB_RETRY_DELAY_MS = Math.max(200, Number(process.env.INVITE_DB_RETRY_DELAY_MS || 500))

function hashToken(token: string) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientInviteDbError(err: any) {
  const code = String(err?.code || '').trim().toUpperCase()
  const message = String(err?.message || err?.error || '').toLowerCase()
  return (
    code === '57014' || // statement timeout
    code === '57P01' || // admin shutdown
    code === '57P03' || // cannot connect now
    code === '53300' || // too many connections
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    message.includes('db operation timed out') ||
    message.includes('statement timeout') ||
    message.includes('query read timeout') ||
    message.includes('too many connections') ||
    message.includes('database') ||
    message.includes('postgres')
  )
}

async function withInviteDbRetry<T>(runner: () => Promise<T>): Promise<T> {
  let lastError: any = null
  for (let attempt = 0; attempt <= INVITE_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await runner()
    } catch (err: any) {
      lastError = err
      if (!isTransientInviteDbError(err) || attempt >= INVITE_DB_RETRY_ATTEMPTS) break
      await wait(INVITE_DB_RETRY_DELAY_MS * (attempt + 1))
    }
  }
  throw lastError
}

let invitationSchemaReady: Promise<void> | null = null

async function ensureInviteSchema() {
  if (!invitationSchemaReady) {
    invitationSchemaReady = query(
      `
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
      );
      `
    )
      .then(() => query('CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_token_hash_unique ON invitations(token_hash) WHERE token_hash IS NOT NULL'))
      .then(() => query('CREATE INDEX IF NOT EXISTS idx_invitations_tenant_email_created ON invitations(tenant_id, email, created_at DESC)'))
      .then(() => query('CREATE INDEX IF NOT EXISTS idx_invitations_user_created ON invitations(user_id, created_at DESC)'))
      .then(() => undefined)
      .catch((err) => {
        invitationSchemaReady = null
        throw err
      })
  }
  await invitationSchemaReady
}

function normalizeInviteStatus(status: unknown, lastSentAt?: unknown) {
  const normalized = String(status || '').trim().toUpperCase()
  if (normalized === 'ACCEPTED') return 'accepted'
  if (normalized === 'REVOKED') return 'revoked'
  if (normalized === 'EXPIRED') return 'expired'
  if (normalized === 'PENDING') return lastSentAt ? 'invited_not_accepted' : 'invite_pending'
  if (!normalized) return 'none'
  return normalized.toLowerCase()
}

async function getLatestInvite(userId: number) {
  return queryOne<{
    invitation_id: number
    status: string
    last_sent_at: string | null
  }>(
    `SELECT invitation_id, status, last_sent_at
     FROM invitations
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  )
}

async function assertAgentInviteTarget(userId: number) {
  const target = await queryOne<InviteTargetRow>(
    `SELECT
      u."id",
      u."role"::text AS "role",
      COALESCE(u."isEndUser", FALSE) AS "is_end_user",
      COALESCE(sa."enabled", FALSE) AS "is_service_account"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     WHERE u."id" = $1
     LIMIT 1`,
    [userId]
  )
  if (!target?.id) throw { status: 404, message: 'User not found' }
  const role = String(target.role || '').trim().toUpperCase()
  const isEndUser = Boolean(target.is_end_user)
  const isServiceAccount = Boolean(target.is_service_account)
  const isAgentLike = (role === 'AGENT' || role === 'ADMIN') && !isEndUser
  if (!isAgentLike && !isServiceAccount) {
    throw { status: 400, message: 'Target user is not an agent account' }
  }
}

export async function inviteExistingUser(
  userId: number,
  actorUserId?: number,
  options: InviteOptions = {},
  _meta: RequestMeta = {}
) {
  await ensureInviteSchema()

  const sendNow = options.sendNow !== false
  const mode = options.mode === 'reinvite' ? 'reinvite' : 'invite'
  const requireImmediate = sendNow && options.requireImmediate !== false

  if (sendNow) {
    const sendWithMode = (targetMode: 'invite' | 'reinvite') =>
      withInviteDbRetry(() =>
        rbacService.sendUserInvite(userId, actorUserId, {
          mode: targetMode,
          toEmail: options.toEmail,
          activationBaseUrl: options.activationBaseUrl,
          allowPendingOnTransientFailure: !requireImmediate,
        })
      )

    let result: any
    try {
      result = await sendWithMode(mode)
    } catch (err: any) {
      const message = String(err?.message || '').toLowerCase()
      if (mode === 'invite' && message.includes('already invited')) {
        result = await sendWithMode('reinvite')
      } else {
        throw err
      }
    }
    const latest = await getLatestInvite(userId)
    return {
      invitationId: result?.invitationId || latest?.invitation_id || null,
      ...result,
      inviteStatus: result?.inviteStatus || normalizeInviteStatus(latest?.status, latest?.last_sent_at),
    }
  }

  await rbacService.markInvitePending(userId, actorUserId)
  const latest = await getLatestInvite(userId)
  return {
    invitationId: latest?.invitation_id || null,
    inviteStatus: 'invite_pending',
  }
}

export async function inviteAgentUser(
  userId: number,
  actorUserId?: number,
  options: InviteOptions = {},
  meta: RequestMeta = {}
) {
  await assertAgentInviteTarget(userId)
  return inviteExistingUser(userId, actorUserId, options, meta)
}

export async function createInvitationRequest(
  payload: {
    email?: string
    name?: string
    roleIds?: number[]
    roleNames?: string[]
    teamIds?: string[]
    sendNow?: boolean
  },
  actorUserId?: number,
  meta: RequestMeta = {}
) {
  await ensureInviteSchema()
  const email = String(payload?.email || '').trim().toLowerCase()
  if (!email) throw { status: 400, message: 'Email is required' }

  let existing = await queryOne<{ id: number }>(
    'SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1',
    [email]
  )

  if (!existing) {
    const preferredRole = Array.isArray(payload?.roleNames) && payload.roleNames.length > 0
      ? String(payload.roleNames[0] || 'USER').toUpperCase()
      : 'USER'
    const created = await userService.createUser({
      email,
      name: payload?.name || null,
      role: preferredRole,
      isServiceAccount: false,
    })
    existing = { id: Number((created as any)?.id) }
  }

  const invite = await inviteExistingUser(
    Number(existing.id),
    actorUserId,
    { mode: 'invite', sendNow: payload?.sendNow !== false, requireImmediate: payload?.sendNow !== false },
    meta
  )

  return {
    invitationId: invite.invitationId,
    userId: Number(existing.id),
    inviteStatus: invite.inviteStatus,
  }
}

export async function resendInvitationById(invitationId: number, actorUserId?: number, meta: RequestMeta = {}) {
  await ensureInviteSchema()
  const row = await queryOne<InvitationRow>(
    `SELECT invitation_id, user_id, email, status, expires_at, last_sent_at
     FROM invitations
     WHERE invitation_id = $1`,
    [invitationId]
  )
  if (!row) throw { status: 404, message: 'Invitation not found' }
  if (!row.user_id) throw { status: 400, message: 'Invitation has no linked user' }
  if (String(row.status || '').toUpperCase() === 'ACCEPTED') {
    throw { status: 400, message: 'Invitation already accepted' }
  }
  if (String(row.status || '').toUpperCase() === 'REVOKED') {
    throw { status: 400, message: 'Invitation is revoked' }
  }

  return inviteExistingUser(
    Number(row.user_id),
    actorUserId,
    {
      mode: 'reinvite',
      sendNow: true,
      requireImmediate: true,
      toEmail: String(row.email || '').trim().toLowerCase() || undefined,
    },
    meta
  )
}

export async function revokeInvitationById(invitationId: number, actorUserId?: number, _meta: RequestMeta = {}) {
  await ensureInviteSchema()
  const row = await queryOne<InvitationRow>(
    `SELECT invitation_id, user_id, email, status, expires_at, last_sent_at
     FROM invitations
     WHERE invitation_id = $1`,
    [invitationId]
  )
  if (!row) throw { status: 404, message: 'Invitation not found' }

  await query(
    `UPDATE invitations
     SET status = 'REVOKED',
         revoked_at = COALESCE(revoked_at, NOW())
     WHERE invitation_id = $1`,
    [invitationId]
  )

  await auditLog({
    action: 'invite_revoked',
    entity: 'invitation',
    entityId: invitationId,
    user: actorUserId,
  })

  return {
    invitationId,
    userId: Number(row.user_id),
    inviteStatus: 'revoked',
  }
}

export async function acceptInvitationToken(
  token: string,
  password: string,
  name?: string | null,
  _meta: RequestMeta = {}
) {
  await ensureInviteSchema()

  const rawToken = String(token || '').trim()
  if (!rawToken) throw { status: 400, message: 'Invitation token is required' }
  if (String(password || '').length < 8) throw { status: 400, message: 'Password must be at least 8 characters' }

  const tokenHash = hashToken(rawToken)
  const invite = await queryOne<{
    invitation_id: number
    user_id: number
    expires_at: string | null
    status: string
  }>(
    `SELECT invitation_id, user_id, expires_at, status
     FROM invitations
     WHERE token_hash = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tokenHash]
  )

  if (!invite) throw { status: 400, message: 'Invalid invitation token' }
  if (!invite.user_id) throw { status: 400, message: 'Invitation is not linked to any user' }
  if (String(invite.status || '').toUpperCase() === 'REVOKED') throw { status: 400, message: 'Invitation is revoked' }
  if (String(invite.status || '').toUpperCase() === 'ACCEPTED') throw { status: 400, message: 'Invitation already accepted' }
  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    throw { status: 400, message: 'Invitation token has expired' }
  }

  const passwordHash = await bcrypt.hash(String(password), 12)
  const nextName = String(name || '').trim()

  if (nextName) {
    await query(
      `UPDATE "User"
       SET "password" = $1,
           "name" = $2,
           "status" = 'ACTIVE',
           "updatedAt" = NOW()
       WHERE "id" = $3`,
      [passwordHash, nextName, invite.user_id]
    )
  } else {
    await query(
      `UPDATE "User"
       SET "password" = $1,
           "status" = 'ACTIVE',
           "updatedAt" = NOW()
       WHERE "id" = $2`,
      [passwordHash, invite.user_id]
    )
  }

  await query(
    `UPDATE invitations
     SET status = 'ACCEPTED',
         accepted_at = NOW()
     WHERE invitation_id = $1`,
    [invite.invitation_id]
  )

  await auditLog({
    action: 'invite_accepted',
    entity: 'invitation',
    entityId: invite.invitation_id,
    user: invite.user_id,
  })

  return {
    ok: true,
    invitationId: invite.invitation_id,
    userId: invite.user_id,
  }
}
