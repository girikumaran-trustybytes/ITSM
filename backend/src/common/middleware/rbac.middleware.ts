import { Request, Response, NextFunction } from 'express'

export function permit(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user || { role: 'guest' }
    const actualRole = String(user.role || '').toUpperCase()
    const allowedRoles = roles.map((r) => String(r || '').toUpperCase())
    if (allowedRoles.includes(actualRole)) return next()
    return res.status(403).json({ error: 'Forbidden' })
  }
}
