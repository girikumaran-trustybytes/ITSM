import { NextFunction, Request, Response } from 'express'
import { auditLog } from '../logger/logger'

function getUserRoles(user: any): string[] {
  const roles = Array.isArray(user?.roles)
    ? user.roles.map((role: any) => String(role || '').trim().toUpperCase()).filter((role: string) => role.length > 0)
    : []
  const primary = String(user?.role || '').trim().toUpperCase()
  if (primary && !roles.includes(primary)) roles.unshift(primary)
  return roles
}

function getUserPermissions(user: any): string[] {
  return Array.isArray(user?.permissions)
    ? user.permissions.map((permission: any) => String(permission || '').trim()).filter((permission: string) => permission.length > 0)
    : []
}

function hasPermission(granted: string[], required: string): boolean {
  if (!required) return true
  if (granted.includes('*')) return true
  return granted.includes(required)
}

function deny(req: Request, res: Response, reason: string, required: string[]) {
  const user = (req as any).user || {}
  void auditLog({
    action: 'access_denied',
    entity: 'permission',
    user: user?.id,
    meta: {
      reason,
      required,
      role: String(user?.role || '').toUpperCase(),
      roles: getUserRoles(user),
      permissions: getUserPermissions(user),
      method: req.method,
      path: req.originalUrl,
    },
  })
  return res.status(403).json({ error: 'Forbidden' })
}

export function requirePermission(permission: string) {
  const required = String(permission || '').trim()
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' })

    const roles = getUserRoles(user)
    if (roles.includes('ADMIN')) return next()

    const granted = getUserPermissions(user)
    if (hasPermission(granted, required)) return next()

    return deny(req, res, 'missing_permission', [required])
  }
}

export function requireAnyPermission(permissions: string[]) {
  const required = (Array.isArray(permissions) ? permissions : [])
    .map((permission) => String(permission || '').trim())
    .filter((permission) => permission.length > 0)

  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!user?.id) return res.status(401).json({ error: 'Unauthorized' })

    const roles = getUserRoles(user)
    if (roles.includes('ADMIN')) return next()

    const granted = getUserPermissions(user)
    if (required.some((permission) => hasPermission(granted, permission))) return next()

    return deny(req, res, 'missing_any_permission', required)
  }
}