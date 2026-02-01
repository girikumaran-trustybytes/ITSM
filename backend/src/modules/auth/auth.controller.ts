import { Request, Response } from 'express'
import * as authService from './auth.service'

export async function login(req: Request, res: Response) {
  const { email, password } = req.body
  try {
    const result = await authService.login(email, password)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Unauthorized' })
  }
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body
  try {
    const result = await authService.refresh(refreshToken)
    res.json(result)
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Unauthorized' })
  }
}

