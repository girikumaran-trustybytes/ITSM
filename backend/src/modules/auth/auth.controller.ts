import { Request, Response } from 'express'
import * as authService from './auth.service'

function isDbError(err: any): boolean {
  const name = err?.constructor?.name ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  return (
    name === 'PrismaClientInitializationError' ||
    name === 'PrismaClientKnownRequestError' ||
    name === 'PrismaClientUnknownRequestError' ||
    msg.includes('prisma') ||
    msg.includes('database server') ||
    msg.includes('can\'t reach database')
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

