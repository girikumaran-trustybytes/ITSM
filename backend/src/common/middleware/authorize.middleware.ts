import { NextFunction, Request, Response } from 'express'
import { query, queryOne } from '../../db'
import { auditLog } from '../logger/logger'

function deny(req: Request, res: Response, reason: string) {
  const user = (req as any).user || {}
  void auditLog({
    action: 'access_denied',
    entity: 'authorization',
    user: user?.id,
    meta: {
      reason,
      role: String(user?.role || '').toUpperCase(),
      roles: Array.isArray(user?.roles) ? user.roles : [String(user?.role || '').toUpperCase()].filter(Boolean),
      method: req.method,
      path: req.originalUrl,
    },
  })
  return res.status(403).json({ error: 'Forbidden' })
}

export function authorize(moduleName: string, action: string, optionalQueue?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number((req as any).user?.id || 0)
      if (!userId) return res.status(401).json({ error: 'Unauthorized' })

      const tokenPermissions = Array.isArray((req as any).user?.permissions)
        ? (req as any).user.permissions.map((permission: any) => String(permission || '').trim())
        : []
      if (tokenPermissions.includes('*')) return next()

      const user = await queryOne<{ role: string }>('SELECT "role" FROM "User" WHERE "id" = $1', [userId])
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      let roleIds = (await query<{ role_id: number }>(
        `SELECT DISTINCT ur.role_id
         FROM user_roles ur
         WHERE ur.user_id = $1`,
        [userId]
      )).map((row) => Number(row.role_id))

      if (roleIds.length === 0) {
        const fallbackRole = String(user.role || 'USER').toUpperCase()
        const fallbackRoleRow = await queryOne<{ role_id: number }>(
          'SELECT role_id FROM roles WHERE role_name = $1',
          [fallbackRole]
        )
        if (fallbackRoleRow?.role_id) roleIds = [Number(fallbackRoleRow.role_id)]
      }
      if (roleIds.length === 0) return deny(req, res, 'role_not_mapped')

      const queue = optionalQueue ? String(optionalQueue).toLowerCase() : null
      const requestedModule = String(moduleName || '').toLowerCase()
      const moduleAliases: Record<string, string[]> = {
        user: ['user', 'users'],
        users: ['users', 'user'],
        supplier: ['supplier', 'suppliers'],
        suppliers: ['suppliers', 'supplier'],
        asset: ['asset', 'assets'],
        assets: ['assets', 'asset'],
        report: ['report', 'reports'],
        reports: ['reports', 'report'],
        ticket: ['ticket', 'tickets'],
        tickets: ['tickets', 'ticket'],
        admin: ['admin'],
        dashboard: ['dashboard'],
      }
      const lookupModules = moduleAliases[requestedModule] || [requestedModule]
      const permission = await queryOne<{ permission_id: number }>(
        `SELECT permission_id
         FROM permissions
         WHERE module = ANY($1::text[])
           AND action = $2
           AND (
             ($3::text IS NULL AND queue IS NULL)
             OR queue = $3
           )
         LIMIT 1`,
        [lookupModules, action, queue]
      )
      if (!permission) return deny(req, res, 'permission_not_found')

      const row = await queryOne<{ allowed: boolean }>(
        `SELECT COALESCE(
           (
             SELECT uo.allowed
             FROM user_permissions_override uo
             WHERE uo.user_id = $2
               AND uo.permission_id = $3
           ),
           (
             SELECT BOOL_OR(rp.allowed)
             FROM role_permissions rp
             WHERE rp.permission_id = $3
               AND rp.role_id = ANY($1::int[])
           ),
           FALSE
         ) AS allowed`,
        [roleIds, userId, permission.permission_id]
      )
      if (!row?.allowed) return deny(req, res, 'permission_denied')
      next()
    } catch (_error) {
      const fallbackRole = String((req as any).user?.role || '').toUpperCase()
      if (fallbackRole === 'ADMIN') return next()
      return deny(req, res, 'authorize_exception')
    }
  }
}
