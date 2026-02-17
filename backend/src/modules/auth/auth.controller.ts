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

export async function loginWithGoogle(req: Request, res: Response) {
  const { idToken } = req.body
  try {
    const result = await authService.loginWithGoogle(idToken)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Google login failed' })
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body
  try {
    const result = await authService.forgotPassword(email)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 400).json({ error: err.message || 'Unable to process request' })
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body
  try {
    const result = await authService.resetPassword(token, password)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(400).json({ error: err.message || 'Unable to reset password' })
  }
}

export async function verifyMfa(req: Request, res: Response) {
  const { challengeToken, code } = req.body
  try {
    const result = await authService.verifyMfa(challengeToken, code)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Invalid MFA code' })
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

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body || {}
  const userId = Number((req as any)?.user?.id || 0)
  try {
    const result = await authService.changePassword(userId, String(currentPassword || ''), String(newPassword || ''))
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(400).json({ error: err.message || 'Unable to change password' })
  }
}

export async function googleConfig(_req: Request, res: Response) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim()
  res.json({
    enabled: Boolean(clientId),
    clientId: clientId || null,
  })
}

