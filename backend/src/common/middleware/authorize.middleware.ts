import { NextFunction, Request, Response } from 'express'
import { queryOne } from '../../db'

export function authorize(moduleName: string, action: string, optionalQueue?: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = Number((req as any).user?.id || 0)
      if (!userId) return res.status(401).json({ error: 'Unauthorized' })

      const user = await queryOne<{ role: string }>('SELECT "role" FROM "User" WHERE "id" = $1', [userId])
      if (!user) return res.status(401).json({ error: 'Unauthorized' })

      const role = String(user.role || 'USER').toUpperCase()
      const roleRow = await queryOne<{ role_id: number }>('SELECT role_id FROM roles WHERE role_name = $1', [role])
      if (!roleRow) return res.status(403).json({ error: 'Forbidden' })

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
      if (!permission) return res.status(403).json({ error: 'Forbidden' })

      const row = await queryOne<{ allowed: boolean }>(
        `SELECT COALESCE(uo.allowed, rp.allowed, false) AS allowed
         FROM permissions p
         LEFT JOIN role_permissions rp
           ON rp.permission_id = p.permission_id
          AND rp.role_id = $1
         LEFT JOIN user_permissions_override uo
           ON uo.permission_id = p.permission_id
          AND uo.user_id = $2
         WHERE p.permission_id = $3`,
        [roleRow.role_id, userId, permission.permission_id]
      )
      if (!row?.allowed) return res.status(403).json({ error: 'Forbidden' })
      next()
    } catch (_error) {
      const fallbackRole = String((req as any).user?.role || '').toUpperCase()
      if (fallbackRole === 'ADMIN') return next()
      return res.status(403).json({ error: 'Forbidden' })
    }
  }
}
