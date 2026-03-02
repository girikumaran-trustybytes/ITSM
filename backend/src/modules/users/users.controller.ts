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

export async function list(req: Request, res: Response) {
  try {
    try {
      await rbacSvc.ensureRbacSeeded()
    } catch (seedErr) {
      console.warn('RBAC seed skipped for /users list due to seed error:', seedErr)
    }
    const q = req.query.q ? String(req.query.q) : undefined
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const role = req.query.role ? String(req.query.role) : undefined
    const users = await svc.listUsers({ q, limit, role })
    res.json(Array.isArray(users) ? users.map((u) => normalizeStatusFromInvite(u)) : [])
  } catch (err: any) {
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
    await rbacSvc.ensureRbacSeeded()
    const payload = req.body || {}
    const actorId = Number((req as any).user?.id || 0)
    const created = await svc.createUser(payload)
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
    const inviteResult = await inviteSvc.inviteExistingUser(
      created.id,
      actorId,
      {
        mode: 'invite',
        sendNow: inviteMode === 'now',
      },
      { ipAddress: req.ip }
    )
    await auditLog({
      action: 'create_user',
      entity: 'user',
      entityId: created.id,
      user: actorId,
      meta: { email: created.email, role: created.role, invitationId: inviteResult?.invitationId || null },
    })
    res.status(201).json(normalizeStatusFromInvite({ ...created, inviteStatus: inviteResult?.inviteStatus || 'invite_pending' }))
  } catch (err: any) {
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
    const result = await inviteSvc.inviteExistingUser(
      id,
      Number((req as any).user?.id || 0),
      { mode: 'invite', sendNow: true },
      { ipAddress: req.ip }
    )
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send invite' })
  }
}

export async function sendServiceAccountInvite(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const result = await inviteSvc.inviteExistingUser(
      id,
      Number((req as any).user?.id || 0),
      { mode: 'invite', sendNow: true },
      { ipAddress: req.ip }
    )
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send service account invite' })
  }
}

export async function reinviteServiceAccount(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const result = await inviteSvc.inviteExistingUser(
      id,
      Number((req as any).user?.id || 0),
      { mode: 'reinvite', sendNow: true },
      { ipAddress: req.ip }
    )
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to re-invite service account' })
  }
}

export async function markInvitePending(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const result = await inviteSvc.inviteExistingUser(
      id,
      Number((req as any).user?.id || 0),
      { mode: 'invite', sendNow: false },
      { ipAddress: req.ip }
    )
    res.json({ ...result, inviteStatus: 'invite_pending' })
  } catch (err: any) {
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
