import { Request, Response, NextFunction } from 'express'
import { auditLog } from '../logger/logger'

export function permit(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user || { role: 'guest' }
    const actualRoles = Array.isArray(user.roles)
      ? user.roles.map((role: any) => String(role || '').toUpperCase())
      : []
    const fallbackRole = String(user.role || '').toUpperCase()
    if (fallbackRole && !actualRoles.includes(fallbackRole)) actualRoles.push(fallbackRole)
    const allowedRoles = roles.map((r) => String(r || '').toUpperCase())
    if (allowedRoles.some((allowedRole) => actualRoles.includes(allowedRole))) return next()
    void auditLog({
      action: 'access_denied',
      entity: 'authorization',
      user: user?.id,
      meta: {
        requiredRoles: allowedRoles,
        actualRoles,
        method: req.method,
        path: req.originalUrl,
      },
    })
    return res.status(403).json({ error: 'Forbidden' })
  }
}
