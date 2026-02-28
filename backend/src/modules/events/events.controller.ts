import { Request, Response } from 'express'
import * as svc from './events.service'

export const list = async (req: Request, res: Response) => {
  try {
    const q: any = (req as any).validated?.query || req.query || {}
    const sinceId = q.sinceId !== undefined ? Number(q.sinceId) : undefined
    const limit = q.limit !== undefined ? Number(q.limit) : undefined
    const items = await svc.listEvents({ sinceId, limit })
    const nextCursor = items.length > 0 ? Number(items[items.length - 1].id) : Number(sinceId || 0)
    res.json({ items, nextCursor })
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to list events' })
  }
}

