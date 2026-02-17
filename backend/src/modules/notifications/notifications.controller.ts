import { Request, Response } from 'express'
import * as svc from './notifications.service'

export async function list(req: Request, res: Response) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const items = await svc.listNotifications((req as any).user, { limit })
    res.json(items)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load notifications' })
  }
}
