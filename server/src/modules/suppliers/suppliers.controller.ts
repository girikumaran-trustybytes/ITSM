import { Request, Response } from 'express'
import * as svc from './suppliers.service'
import { auditLog } from '../../common/logger/logger'

export async function create(req: Request, res: Response) {
  const data = req.body
  const s = await svc.createSupplier(data)
  await auditLog({ action: 'create_supplier', entity: 'supplier', entityId: s.id, user: (req as any).user?.id, meta: { companyName: s.companyName } })
  res.status(201).json(s)
}

export async function list(req: Request, res: Response) {
  const q = req.query.q ? String(req.query.q) : undefined
  const items = await svc.listSuppliers({ q })
  res.json(items)
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  const s = await svc.getSupplier(id)
  if (!s) return res.status(404).json({ error: 'Not found' })
  res.json(s)
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id)
  const data = req.body
  const s = await svc.updateSupplier(id, data)
  if (!s) return res.status(404).json({ error: 'Not found' })
  await auditLog({ action: 'update_supplier', entity: 'supplier', entityId: s.id, user: (req as any).user?.id })
  res.json(s)
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id)
  const deleted = await svc.deleteSupplier(id)
  if (!deleted) return res.status(404).json({ error: 'Not found' })
  await auditLog({ action: 'delete_supplier', entity: 'supplier', entityId: deleted.id, user: (req as any).user?.id, meta: { companyName: deleted.companyName } })
  res.json({ ok: true })
}
