import { Request, Response } from 'express'
import * as authService from './auth.service'

function isDbError(err: any): boolean {
  const name = err?.constructor?.name ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  const code = err?.code ?? ''
  return (
    name.includes('Postgres') ||
    msg.includes('database') ||
    msg.includes('postgres') ||
    msg.includes('db connection') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === '57P01' || // admin shutdown
    code === '57P03' || // cannot connect now
    code === '53300' // too many connections
  )
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body
  try {
    const result = await authService.login(email, password)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Invalid credentials' })
  }
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body
  try {
    const result = await authService.refresh(refreshToken)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Unauthorized' })
  }
}

