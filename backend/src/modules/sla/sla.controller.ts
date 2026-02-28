import { Request, Response } from 'express'
import * as svc from './sla.service'
import { auditLog } from '../../common/logger/logger'

export async function list(_req: Request, res: Response) {
  const q = _req.query.q ? String(_req.query.q) : undefined
  const items = await svc.listSlaConfigs({ q })
  res.json(items)
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid id' })
  const item = await svc.getSlaConfig(id)
  if (!item) return res.status(404).json({ error: 'SLA config not found' })
  res.json(item)
}

export async function create(req: Request, res: Response) {
  try {
    const created = await svc.createSlaConfig(req.body || {})
    const userId = (req as any).user?.id
    await auditLog({ action: 'create_sla', entity: 'sla', entityId: created.id, user: userId, meta: { name: created.name } })
    res.status(201).json(created)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to create SLA config' })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const updated = await svc.updateSlaConfig(id, req.body || {})
    const userId = (req as any).user?.id
    await auditLog({ action: 'update_sla', entity: 'sla', entityId: updated.id, user: userId })
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update SLA config' })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!id) return res.status(400).json({ error: 'Invalid id' })
    const deleted = await svc.deleteSlaConfig(id)
    const userId = (req as any).user?.id
    await auditLog({ action: 'delete_sla', entity: 'sla', entityId: deleted.id, user: userId, meta: { name: deleted.name } })
    res.json({ success: true, deleted })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete SLA config' })
  }
}
