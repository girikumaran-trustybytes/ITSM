import { Request, Response } from 'express'
import * as svc from './users.service'
import { auditLog } from '../../common/logger/logger'
import * as rbacSvc from './rbac.service'
import * as inviteSvc from './invitations.service'

function normalizeStatusFromInvite(user: any) {
  const inviteStatus = String(user?.inviteStatus || '').trim().toLowerCase()
  const normalized = inviteStatus === 'accepted' ? 'Active' : 'Invited'
  return { ...user, status: normalized }
}

function isTransientDbTimeout(err: any) {
  const code = String(err?.code || '').trim().toUpperCase()
  const msg = String(err?.message || err?.error || '').toLowerCase()
  return (
    code === '57014' || // PostgreSQL statement timeout
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    msg.includes('query read timeout') ||
    msg.includes('statement timeout') ||
    msg.includes('db operation timed out')
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function normalizePublicBaseUrl(input: unknown): string {
  const raw = String(input || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return ''
  }
}

function deriveInviteActivationBaseUrl(req: Request): string | undefined {
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
  const envCandidates = [
    process.env.INVITE_ACTIVATION_BASE_URL,
    process.env.FRONTEND_URL,
    process.env.APP_URL,
    process.env.WEB_APP_URL,
  ]
    .map((value) => normalizePublicBaseUrl(value))
    .filter(Boolean)

  const envBase = envCandidates[0] || ''
  const envLooksLocal = /localhost|127\.0\.0\.1/i.test(envBase)
  if (envBase && !(isProduction && envLooksLocal)) return envBase

  const requestOrigin = normalizePublicBaseUrl(req.get('origin'))
  if (requestOrigin) return requestOrigin

  const referer = String(req.get('referer') || '').trim()
  if (referer) {
    try {
      const parsed = new URL(referer)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return `${parsed.protocol}//${parsed.host}`
      }
    } catch {
      // ignore malformed referrer
    }
  }

  if (envBase) return envBase
  return undefined
}

const USER_CREATE_RETRY_ATTEMPTS = Math.max(0, Number(process.env.USER_CREATE_RETRY_ATTEMPTS || 1))
const USER_CREATE_RETRY_DELAY_MS = Math.max(250, Number(process.env.USER_CREATE_RETRY_DELAY_MS || 700))
const USER_CREATE_ATTEMPT_TIMEOUT_MS = Math.max(2500, Number(process.env.USER_CREATE_ATTEMPT_TIMEOUT_MS || 8000))
const USER_LIST_RETRY_ATTEMPTS = Math.max(0, Number(process.env.USER_LIST_RETRY_ATTEMPTS || 2))
const USER_LIST_RETRY_DELAY_MS = Math.max(250, Number(process.env.USER_LIST_RETRY_DELAY_MS || 700))
const USER_LIST_ATTEMPT_TIMEOUT_MS = Math.max(5000, Number(process.env.USER_LIST_ATTEMPT_TIMEOUT_MS || 20000))
const inviteSingleFlight = new Map<string, Promise<any>>()

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutError: any = new Error(`DB operation timed out after ${timeoutMs}ms`)
      timeoutError.code = 'ETIMEDOUT'
      reject(timeoutError)
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

async function withTimeoutRetry<T>(runner: () => Promise<T>) {
  let lastErr: any = null
  for (let attempt = 0; attempt <= USER_CREATE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await withTimeout(runner(), USER_CREATE_ATTEMPT_TIMEOUT_MS)
    } catch (err: any) {
      lastErr = err
      if (!isTransientDbTimeout(err) || attempt >= USER_CREATE_RETRY_ATTEMPTS) break
      await wait(USER_CREATE_RETRY_DELAY_MS * (attempt + 1))
    }
  }
  throw lastErr
}

async function withListTimeoutRetry<T>(runner: () => Promise<T>) {
  let lastErr: any = null
  for (let attempt = 0; attempt <= USER_LIST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await withTimeout(runner(), USER_LIST_ATTEMPT_TIMEOUT_MS)
    } catch (err: any) {
      lastErr = err
      if (!isTransientDbTimeout(err) || attempt >= USER_LIST_RETRY_ATTEMPTS) break
      await wait(USER_LIST_RETRY_DELAY_MS * (attempt + 1))
    }
  }
  throw lastErr
}

async function runInviteSingleFlight<T>(key: string, runner: () => Promise<T>) {
  const existing = inviteSingleFlight.get(key)
  if (existing) return existing as Promise<T>
  const pending = runner().finally(() => {
    inviteSingleFlight.delete(key)
  })
  inviteSingleFlight.set(key, pending)
  return pending
}

export async function list(req: Request, res: Response) {
  try {
    // Do not block user listing on runtime RBAC seeding.
    void rbacSvc.ensureRbacSeeded().catch((seedErr) => {
      console.warn('RBAC seed warmup skipped for /users list due to seed error:', seedErr)
    })
    const q = req.query.q ? String(req.query.q) : undefined
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const role = req.query.role ? String(req.query.role) : undefined
    const principalType = req.query.principalType ? String(req.query.principalType) : undefined
    const opts = { q, limit, role, principalType: role ? principalType : (principalType || 'user') }
    let users: any[] = []
    try {
      users = await withListTimeoutRetry(() => svc.listUsers(opts))
    } catch (err: any) {
      if (!isTransientDbTimeout(err)) throw err
      try {
        // Fallback to lightweight list when invite-status joins are slow.
        users = await withListTimeoutRetry(() => svc.listUsersLightweight(opts))
        res.setHeader('X-Users-Source', 'lightweight-fallback')
      } catch (fallbackErr: any) {
        if (!isTransientDbTimeout(fallbackErr)) throw fallbackErr
        // Last-resort fallback with a minimal query that avoids optional tables.
        users = await withTimeout(svc.listUsersEmergency(opts), Math.min(USER_LIST_ATTEMPT_TIMEOUT_MS, 8000))
        res.setHeader('X-Users-Source', 'emergency-fallback')
      }
    }
    res.json(Array.isArray(users) ? users.map((u) => normalizeStatusFromInvite(u)) : [])
  } catch (err: any) {
    if (isTransientDbTimeout(err)) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to list users' })
  }
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const user = await svc.getUserById(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(normalizeStatusFromInvite(user))
}

export async function create(req: Request, res: Response) {
  try {
    try {
      await rbacSvc.ensureRbacSeeded()
    } catch (seedErr) {
      console.warn('RBAC seed skipped for /users create due to seed error:', seedErr)
    }
    const payload = req.body || {}
    const actorId = Number((req as any).user?.id || 0)
    const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req)
    const created = await withTimeoutRetry(() => svc.createUser(payload))
    if (payload.defaultPermissionTemplate) {
      await rbacSvc.upsertUserPermissions(
        created.id,
        {
          templateKey: String(payload.defaultPermissionTemplate),
          autoSwitchCustom: false,
        },
        actorId
      )
    }
    const inviteMode = String(payload.inviteMode || '').toLowerCase()
    const shouldHandleInviteDuringCreate = inviteMode === 'now' || inviteMode === 'later'
    let inviteResult: any = null
    if (shouldHandleInviteDuringCreate) {
      try {
        inviteResult = await withTimeoutRetry(() =>
          inviteSvc.inviteExistingUser(
            created.id,
            actorId,
            {
              mode: 'invite',
              sendNow: inviteMode === 'now',
              requireImmediate: inviteMode === 'now',
              activationBaseUrl: inviteActivationBaseUrl,
            },
            { ipAddress: req.ip }
          )
        )
      } catch (inviteErr) {
        console.warn('User created but invitation flow failed during /users create:', inviteErr)
      }
    }
    await auditLog({
      action: 'create_user',
      entity: 'user',
      entityId: created.id,
      user: actorId,
      meta: { email: created.email, role: created.role, invitationId: inviteResult?.invitationId || null },
    })
    const inviteStatus = inviteResult?.inviteStatus
      || (shouldHandleInviteDuringCreate && inviteMode === 'later' ? 'invite_pending' : (created as any)?.inviteStatus || 'none')
    res.status(201).json(normalizeStatusFromInvite({ ...created, inviteStatus }))
  } catch (err: any) {
    if (isTransientDbTimeout(err)) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to create user' })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const payload = req.body || {}
    const actorRole = String((req as any)?.user?.role || '').toUpperCase()
    if (payload?.name !== undefined && actorRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Only admin can change user name' })
    }
    const updated = await svc.updateUser(id, payload)
    await auditLog({ action: 'update_user', entity: 'user', entityId: updated.id, user: (req as any).user?.id })
    res.json(normalizeStatusFromInvite(updated))
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update user' })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const deleted = await svc.deleteUser(id)
    await auditLog({ action: 'delete_user', entity: 'user', entityId: deleted.id, user: (req as any).user?.id, meta: { email: deleted.email } })
    res.json({ success: true, deleted })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete user' })
  }
}

export async function getPermissions(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const snapshot = await rbacSvc.getUserPermissionsSnapshot(id)
    res.json(snapshot)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to load permissions' })
  }
}

export async function listTicketQueues(req: Request, res: Response) {
  try {
    const queues = await rbacSvc.listTicketQueues()
    res.json(queues)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list ticket queues' })
  }
}

export async function createTicketQueue(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    const created = await rbacSvc.createTicketQueue(
      { label: payload.label, queueKey: payload.queueKey },
      Number((req as any).user?.id || 0)
    )
    res.status(201).json(created)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create ticket queue' })
  }
}

export async function updateTicketQueue(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const payload = req.body || {}
    const updated = await rbacSvc.updateTicketQueue(id, { label: payload.label }, Number((req as any).user?.id || 0))
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update ticket queue' })
  }
}

export async function deleteTicketQueue(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const removed = await rbacSvc.deleteTicketQueue(id, Number((req as any).user?.id || 0))
    res.json({ success: true, deleted: removed })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete ticket queue' })
  }
}

export async function updatePermissions(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const payload = req.body || {}
    const snapshot = await rbacSvc.upsertUserPermissions(
      id,
      {
        role: payload.role,
        templateKey: payload.templateKey,
        permissions: payload.permissions,
        autoSwitchCustom: payload.autoSwitchCustom !== false,
      },
      Number((req as any).user?.id || 0)
    )
    res.json(snapshot)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update permissions' })
  }
}

export async function addTicketCustomAction(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    const created = await rbacSvc.createTicketQueueCustomAction(
      {
        queue: payload.queue,
        label: payload.label,
        actionKey: payload.actionKey,
      },
      Number((req as any).user?.id || 0)
    )
    res.status(201).json(created)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to add custom action' })
  }
}

export async function sendInvite(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const toEmail = String((req.body as any)?.toEmail || '').trim()
    const requireImmediate = toBool(
      (req.body as any)?.requireImmediate ?? (req.body as any)?.immediate ?? req.query?.immediate,
      true
    )
    const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req)
    const key = `invite:${id}:${String(toEmail || '').toLowerCase()}`
    const result = await runInviteSingleFlight(
      key,
      () => inviteSvc.inviteExistingUser(
        id,
        Number((req as any).user?.id || 0),
        {
          mode: 'invite',
          sendNow: true,
          requireImmediate,
          toEmail: toEmail || undefined,
          activationBaseUrl: inviteActivationBaseUrl,
        },
        { ipAddress: req.ip }
      )
    )
    res.json(result)
  } catch (err: any) {
    if (String(err?.source || '').toLowerCase() === 'smtp' || String(err?.code || '').toUpperCase().startsWith('SMTP_')) {
      return res.status(err.status || 502).json({ error: err.message || 'Invite email delivery failed' })
    }
    if (isTransientDbTimeout(err)) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to send invite' })
  }
}

export async function sendServiceAccountInvite(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const toEmail = String((req.body as any)?.toEmail || '').trim()
    const requireImmediate = toBool(
      (req.body as any)?.requireImmediate ?? (req.body as any)?.immediate ?? req.query?.immediate,
      true
    )
    const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req)
    const key = `invite:${id}:${String(toEmail || '').toLowerCase()}`
    const result = await runInviteSingleFlight(
      key,
      () => inviteSvc.inviteAgentUser(
        id,
        Number((req as any).user?.id || 0),
        {
          mode: 'invite',
          sendNow: true,
          requireImmediate,
          toEmail: toEmail || undefined,
          activationBaseUrl: inviteActivationBaseUrl,
        },
        { ipAddress: req.ip }
      )
    )
    res.json(result)
  } catch (err: any) {
    if (String(err?.source || '').toLowerCase() === 'smtp' || String(err?.code || '').toUpperCase().startsWith('SMTP_')) {
      return res.status(err.status || 502).json({ error: err.message || 'Invite email delivery failed' })
    }
    if (isTransientDbTimeout(err)) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to send service account invite' })
  }
}

export async function reinviteServiceAccount(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const toEmail = String((req.body as any)?.toEmail || '').trim()
    const requireImmediate = toBool(
      (req.body as any)?.requireImmediate ?? (req.body as any)?.immediate ?? req.query?.immediate,
      true
    )
    const inviteActivationBaseUrl = deriveInviteActivationBaseUrl(req)
    const key = `reinvite:${id}:${String(toEmail || '').toLowerCase()}`
    const result = await runInviteSingleFlight(
      key,
      () => inviteSvc.inviteAgentUser(
        id,
        Number((req as any).user?.id || 0),
        {
          mode: 'reinvite',
          sendNow: true,
          requireImmediate,
          toEmail: toEmail || undefined,
          activationBaseUrl: inviteActivationBaseUrl,
        },
        { ipAddress: req.ip }
      )
    )
    res.json(result)
  } catch (err: any) {
    if (String(err?.source || '').toLowerCase() === 'smtp' || String(err?.code || '').toUpperCase().startsWith('SMTP_')) {
      return res.status(err.status || 502).json({ error: err.message || 'Invite email delivery failed' })
    }
    if (isTransientDbTimeout(err)) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to re-invite service account' })
  }
}

export async function markInvitePending(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const result = await withTimeoutRetry(() =>
      inviteSvc.inviteExistingUser(
        id,
        Number((req as any).user?.id || 0),
        { mode: 'invite', sendNow: false },
        { ipAddress: req.ip }
      )
    )
    res.json({ ...result, inviteStatus: 'invite_pending' })
  } catch (err: any) {
    if (isTransientDbTimeout(err)) {
      return res.status(503).json({ error: 'Service temporarily unavailable. Please try again.' })
    }
    res.status(err.status || 500).json({ error: err.message || 'Failed to mark invite pending' })
  }
}

export async function createInvitation(req: Request, res: Response) {
  try {
    const payload = req.body || {}
    const result = await inviteSvc.createInvitationRequest(
      {
        email: payload.email,
        name: payload.name || payload.fullName,
        roleIds: payload.roleIds || payload.role_ids,
        roleNames: payload.roleNames,
        teamIds: payload.teamIds || payload.team_ids,
        sendNow: payload.sendNow !== false,
      },
      Number((req as any).user?.id || 0),
      { ipAddress: req.ip }
    )
    res.status(201).json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create invitation' })
  }
}

export async function resendInvitation(req: Request, res: Response) {
  try {
    const invitationId = Number(req.params.invitationId)
    if (!invitationId) return res.status(400).json({ error: 'Invalid invitation id' })
    const result = await inviteSvc.resendInvitationById(
      invitationId,
      Number((req as any).user?.id || 0),
      { ipAddress: req.ip }
    )
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to resend invitation' })
  }
}

export async function revokeInvitation(req: Request, res: Response) {
  try {
    const invitationId = Number(req.params.invitationId)
    if (!invitationId) return res.status(400).json({ error: 'Invalid invitation id' })
    const result = await inviteSvc.revokeInvitationById(
      invitationId,
      Number((req as any).user?.id || 0),
      { ipAddress: req.ip }
    )
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to revoke invitation' })
  }
}

export async function getMyPresence(req: Request, res: Response) {
  try {
    const id = Number((req as any).user?.id || 0)
    if (!id) return res.status(401).json({ error: 'Unauthorized' })
    const result = await svc.getUserPresence(id)
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to load presence' })
  }
}

export async function putMyPresence(req: Request, res: Response) {
  try {
    const id = Number((req as any).user?.id || 0)
    if (!id) return res.status(401).json({ error: 'Unauthorized' })
    const status = (req.body as any)?.status
    const result = await svc.saveUserPresence(id, status)
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to save presence' })
  }
}
