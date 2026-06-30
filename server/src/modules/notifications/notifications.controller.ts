import { Request, Response } from 'express'
import * as svc from './notifications.service'

function isTransientDbIssue(err: any) {
  const code = String(err?.code || '').trim().toUpperCase()
  const msg = String(err?.message || err?.error || '').toLowerCase()
  return (
    code === '57014' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    msg.includes('query read timeout') ||
    msg.includes('statement timeout') ||
    msg.includes('db operation timed out') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable')
  )
}

function normalizeIds(value: any): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  ).slice(0, 5000)
}

export async function list(req: Request, res: Response) {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : undefined
    const items = await svc.listNotifications((req as any).user, { limit })
    res.json(items)
  } catch (err: any) {
    if (isTransientDbIssue(err)) {
      return res.json([])
    }
    res.status(500).json({ error: err?.message || 'Failed to load notifications' })
  }
}

export async function getState(req: Request, res: Response) {
  try {
    const state = await svc.getNotificationState((req as any).user)
    res.json(state)
  } catch (err: any) {
    if (isTransientDbIssue(err)) {
      return res.json({ readIds: [], deletedIds: [], clearedAt: undefined })
    }
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
    if (isTransientDbIssue(err)) {
      const body = req.body || {}
      const fallbackClearedAt = Number(body.clearedAt)
      const clearedAt = Number.isFinite(fallbackClearedAt) && fallbackClearedAt > 0 ? fallbackClearedAt : undefined
      return res.json({
        readIds: normalizeIds(body.readIds),
        deletedIds: normalizeIds(body.deletedIds),
        clearedAt,
      })
    }
    res.status(500).json({ error: err?.message || 'Failed to save notification state' })
  }
}
