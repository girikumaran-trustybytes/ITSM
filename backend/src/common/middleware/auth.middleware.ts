import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret'

export function mockAuth(req: Request, _res: Response, next: NextFunction) {
  const user = req.header('X-User') || 'anonymous'
  const role = req.header('X-User-Role') || 'guest'
  ;(req as any).user = { id: user, role }
  next()
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const auth = req.header('Authorization')
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' })

  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Invalid Authorization format' })

  const token = parts[1]
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as any
    ;(req as any).user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
