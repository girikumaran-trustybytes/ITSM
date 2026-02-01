import { Request, Response, NextFunction } from 'express'

export function permit(roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user || { role: 'guest' }
    if (roles.includes(user.role)) return next()
    return res.status(403).json({ error: 'Forbidden' })
  }
}
