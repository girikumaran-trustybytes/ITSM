import { Request, Response, NextFunction } from 'express'

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const rawStatus = Number(err?.status || err?.statusCode || 500)
  const status = Number.isFinite(rawStatus) && rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500
  const clientMessage = status >= 500
    ? 'Internal Server Error'
    : String(err?.message || 'Request failed')

  console.error('Unhandled Error:', {
    status,
    message: err?.message || String(err),
    code: err?.code,
    stack: err?.stack,
  })

  res.status(status).json({ error: clientMessage })
}
