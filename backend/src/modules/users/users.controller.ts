import { Request, Response } from 'express'
import * as svc from './users.service'
import { auditLog } from '../../common/logger/logger'
import * as rbacSvc from './rbac.service'

export async function list(req: Request, res: Response) {
  try {
    await rbacSvc.ensureRbacSeeded()
    const q = req.query.q ? String(req.query.q) : undefined
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const role = req.query.role ? String(req.query.role) : undefined
    const users = await svc.listUsers({ q, limit, role })
    res.json(users)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to list users' })
  }
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const user = await svc.getUserById(id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
}

export async function create(req: Request, res: Response) {
  try {
    await rbacSvc.ensureRbacSeeded()
    const payload = req.body || {}
    const created = await svc.createUser(payload)
    if (payload.defaultPermissionTemplate) {
      await rbacSvc.upsertUserPermissions(
        created.id,
        {
          templateKey: String(payload.defaultPermissionTemplate),
          autoSwitchCustom: false,
        },
        Number((req as any).user?.id || 0)
      )
    }
    const inviteMode = String(payload.inviteMode || '').toLowerCase()
    if (inviteMode === 'later') {
      await rbacSvc.markInvitePending(created.id, Number((req as any).user?.id || 0))
    }
    if (inviteMode === 'now') {
      await rbacSvc.sendUserInvite(created.id, Number((req as any).user?.id || 0))
    }
    await auditLog({ action: 'create_user', entity: 'user', entityId: created.id, user: (req as any).user?.id, meta: { email: created.email, role: created.role } })
    res.status(201).json(created)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create user' })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const payload = req.body || {}
    const updated = await svc.updateUser(id, payload)
    await auditLog({ action: 'update_user', entity: 'user', entityId: updated.id, user: (req as any).user?.id })
    res.json(updated)
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
    const result = await rbacSvc.sendUserInvite(id, Number((req as any).user?.id || 0))
    res.json(result)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to send invite' })
  }
}

export async function markInvitePending(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    await rbacSvc.markInvitePending(id, Number((req as any).user?.id || 0))
    res.json({ inviteStatus: 'invite_pending' })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to mark invite pending' })
  }
}
