import { Request, Response } from 'express'
import * as svc from './changes.service'
import { auditLog } from '../../common/logger/logger'

export async function list(req: Request, res: Response) {
  const q = req.query.q ? String(req.query.q) : undefined
  const items = await svc.listChanges({ q })
  res.json(items)
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const item = await svc.getChange(id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
}

export async function create(req: Request, res: Response) {
  try {
    const created = await svc.createChange(req.body || {})
    await auditLog({ action: 'create_change', entity: 'change', entityId: created.id, user: (req as any).user?.id, meta: { code: created.code } })
    res.status(201).json(created)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create change' })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const updated = await svc.updateChange(id, req.body || {})
    await auditLog({ action: 'update_change', entity: 'change', entityId: updated.id, user: (req as any).user?.id })
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update change' })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const deleted = await svc.deleteChange(id)
    await auditLog({ action: 'delete_change', entity: 'change', entityId: deleted.id, user: (req as any).user?.id, meta: { code: deleted.code } })
    res.json({ success: true, deleted })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete change' })
  }
}
