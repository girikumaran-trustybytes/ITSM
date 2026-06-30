import { Request, Response } from 'express'
import * as svc from './announcements.service'

export async function listAdmin(_req: Request, res: Response) {
  try {
    const rows = await svc.listAnnouncementsAdmin()
    res.json(rows)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load announcements' })
  }
}

export async function listActive(req: Request, res: Response) {
  try {
    const typeRaw = String(req.query.type || '').trim().toLowerCase()
    const type = typeRaw === 'general' ? 'general' : typeRaw === 'maintenance' ? 'maintenance' : undefined
    const rows = await svc.listActiveAnnouncements(type as any)
    res.json(rows)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load announcements' })
  }
}

export async function create(req: Request, res: Response) {
  try {
    const userId = Number((req as any).user?.id)
    const row = await svc.createAnnouncement(req.body || {}, Number.isFinite(userId) ? userId : undefined)
    res.json(row)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err?.message || 'Failed to create announcement' })
  }
}

export async function update(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid announcement id' })
    const userId = Number((req as any).user?.id)
    const row = await svc.updateAnnouncement(id, req.body || {}, Number.isFinite(userId) ? userId : undefined)
    res.json(row)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err?.message || 'Failed to update announcement' })
  }
}

export async function remove(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid announcement id' })
    const row = await svc.deleteAnnouncement(id)
    res.json(row)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err?.message || 'Failed to delete announcement' })
  }
}

export async function repost(req: Request, res: Response) {
  try {
    const id = Number(req.params.id)
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'Invalid announcement id' })
    const userId = Number((req as any).user?.id)
    const row = await svc.repostAnnouncement(id, Number.isFinite(userId) ? userId : undefined)
    res.json(row)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err?.message || 'Failed to repost announcement' })
  }
}
