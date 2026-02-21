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

export async function getState(req: Request, res: Response) {
  try {
    const state = await svc.getNotificationState((req as any).user)
    res.json(state)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to load notification state' })
  }
}

export async function putState(req: Request, res: Response) {
  try {
    const body = req.body || {}
    const state = await svc.saveNotificationState((req as any).user, {
      readIds: Array.isArray(body.readIds) ? body.readIds : [],
      deletedIds: Array.isArray(body.deletedIds) ? body.deletedIds : [],
      clearedAt: body.clearedAt,
    })
    res.json(state)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to save notification state' })
  }
}
