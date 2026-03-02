import { NextFunction, Request, Response } from 'express'
import { auditLog } from '../logger/logger'
import { PermissionKey, hasPermission, normalizeRole } from '../authz/policy'

function deny(req: Request, res: Response, permission: PermissionKey, reason: string) {
  const user = (req as any).user || {}
  void auditLog({
    action: 'access_denied',
    entity: 'authorization',
    user: user?.id,
    meta: {
      permission,
      reason,
      role: normalizeRole(user),
      roles: Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean),
      path: req.originalUrl,
      method: req.method,
    },
  })
  return res.status(403).json({ error: 'Forbidden' })
}

export function requirePermission(permission: PermissionKey) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!hasPermission(user, permission)) {
      return deny(req, res, permission, 'missing_permission')
    }
    return next()
  }
}

export function requireAnyPermission(permissions: PermissionKey[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!permissions.some((permission) => hasPermission(user, permission))) {
      return deny(req, res, permissions[0] || 'portal.access', 'missing_any_permission')
    }
    return next()
  }
}
