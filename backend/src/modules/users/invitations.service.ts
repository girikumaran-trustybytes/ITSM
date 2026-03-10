import { createHash } from 'crypto'
import bcrypt from 'bcrypt'
import { query, queryOne } from '../../db'
import { auditLog } from '../../common/logger/logger'
import * as userService from './users.service'
import * as rbacService from './rbac.service'

type InviteOptions = {
  mode?: 'invite' | 'reinvite'
  sendNow?: boolean
}

type RequestMeta = {
  ipAddress?: string | null
}

function hashToken(token: string) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

async function ensureInviteSchema() {
  await query(
    `CREATE TABLE IF NOT EXISTS user_invites (
      invite_id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      token_hash TEXT,
      expires_at TIMESTAMP(3),
      status TEXT NOT NULL DEFAULT 'invite_pending',
      sent_at TIMESTAMP(3),
      accepted_at TIMESTAMP(3),
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  )
}

async function getLatestInvite(userId: number) {
  return queryOne<{ invite_id: number; status: string }>(
    `SELECT invite_id, status
     FROM user_invites
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  )
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

  if (sendNow) {
    const result = await rbacService.sendUserInvite(userId, actorUserId, { mode })
    const latest = await getLatestInvite(userId)
    return {
      invitationId: latest?.invite_id || null,
      ...result,
      inviteStatus: result?.inviteStatus || latest?.status || 'invited_not_accepted',
    }
  }

  await rbacService.markInvitePending(userId, actorUserId)
  const latest = await getLatestInvite(userId)
  return {
    invitationId: latest?.invite_id || null,
    inviteStatus: 'invite_pending',
  }
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
    { mode: 'invite', sendNow: payload?.sendNow !== false },
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
  const row = await queryOne<{ invite_id: number; user_id: number; status: string }>(
    `SELECT invite_id, user_id, status
     FROM user_invites
     WHERE invite_id = $1`,
    [invitationId]
  )
  if (!row) throw { status: 404, message: 'Invitation not found' }
  if (String(row.status || '').toLowerCase() === 'accepted') {
    throw { status: 400, message: 'Invitation already accepted' }
  }
  if (String(row.status || '').toLowerCase() === 'revoked') {
    throw { status: 400, message: 'Invitation is revoked' }
  }

  return inviteExistingUser(Number(row.user_id), actorUserId, { mode: 'reinvite', sendNow: true }, meta)
}

export async function revokeInvitationById(invitationId: number, actorUserId?: number, _meta: RequestMeta = {}) {
  await ensureInviteSchema()
  const row = await queryOne<{ invite_id: number; user_id: number; status: string }>(
    `SELECT invite_id, user_id, status
     FROM user_invites
     WHERE invite_id = $1`,
    [invitationId]
  )
  if (!row) throw { status: 404, message: 'Invitation not found' }

  await query(
    `UPDATE user_invites
     SET status = 'revoked'
     WHERE invite_id = $1`,
    [invitationId]
  )

  await auditLog({
    action: 'invite_revoked',
    entity: 'user_invite',
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
  const invite = await queryOne<{ invite_id: number; user_id: number; expires_at: string | null; status: string }>(
    `SELECT invite_id, user_id, expires_at, status
     FROM user_invites
     WHERE token_hash = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tokenHash]
  )

  if (!invite) throw { status: 400, message: 'Invalid invitation token' }
  if (String(invite.status || '').toLowerCase() === 'revoked') throw { status: 400, message: 'Invitation is revoked' }
  if (String(invite.status || '').toLowerCase() === 'accepted') throw { status: 400, message: 'Invitation already accepted' }
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
    `UPDATE user_invites
     SET status = 'accepted',
         accepted_at = NOW()
     WHERE invite_id = $1`,
    [invite.invite_id]
  )

  await auditLog({
    action: 'invite_accepted',
    entity: 'user_invite',
    entityId: invite.invite_id,
    user: invite.user_id,
  })

  return {
    ok: true,
    invitationId: invite.invite_id,
    userId: invite.user_id,
  }
}

