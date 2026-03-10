import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret'

export function mockAuth(req: Request, _res: Response, next: NextFunction) {
  const user = req.header('X-User') || 'anonymous'
  const role = req.header('X-User-Role') || 'guest'
  ;(req as any).user = { id: user, role, roles: [String(role || '').toUpperCase()], permissions: [] }
  next()
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  // Let CORS preflight checks pass through without token validation.
  if (req.method === 'OPTIONS') return next()

  const auth = req.header('Authorization')
  if (!auth) return res.status(401).json({ error: 'Missing Authorization header' })

  const parts = auth.split(' ')
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') return res.status(401).json({ error: 'Invalid Authorization format' })

  const token = parts[1]
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as any
    const roles = Array.isArray(payload.roles)
      ? payload.roles.map((role: any) => String(role || '').trim().toUpperCase()).filter((role: string) => role.length > 0)
      : []
    const role = String(payload.role || '').trim().toUpperCase()
    if (role && !roles.includes(role)) roles.unshift(role)
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.map((permission: any) => String(permission || '').trim()).filter((permission: string) => permission.length > 0)
      : []
    ;(req as any).user = {
      id: payload.sub,
      role: role || roles[0] || 'GUEST',
      roles,
      permissions,
      tenantId: Number(payload.tenantId || 1),
      name: payload.name,
      email: payload.email,
    }
    next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }
}
