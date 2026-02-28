import { Request, Response } from 'express'
import * as svc from './services.service'
import { auditLog } from '../../common/logger/logger'

export async function list(req: Request, res: Response) {
  const q = req.query.q ? String(req.query.q) : undefined
  const items = await svc.listServices({ q })
  res.json(items)
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const item = await svc.getService(id)
  if (!item) return res.status(404).json({ error: 'Not found' })
  res.json(item)
}

export async function create(req: Request, res: Response) {
  try {
    const created = await svc.createService(req.body || {})
    await auditLog({ action: 'create_service', entity: 'service', entityId: created.id, user: (req as any).user?.id, meta: { name: created.name } })
    res.status(201).json(created)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create service' })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const updated = await svc.updateService(id, req.body || {})
    await auditLog({ action: 'update_service', entity: 'service', entityId: updated.id, user: (req as any).user?.id })
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update service' })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const deleted = await svc.deleteService(id)
    await auditLog({ action: 'delete_service', entity: 'service', entityId: deleted.id, user: (req as any).user?.id, meta: { name: deleted.name } })
    res.json({ success: true, deleted })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete service' })
  }
}
