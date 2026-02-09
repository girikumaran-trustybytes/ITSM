import winston from 'winston'
import { query } from '../../db'

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' }),
  ],
})

const AUDIT_STORE: any[] = []

export async function auditLog(entry: { ticketId?: string; user?: any; from?: string; to?: string; action: string; when?: string; meta?: any; entity?: string; entityId?: number; assetId?: number }) {
  // persist to in-memory store for quick lookup + structured logger
  AUDIT_STORE.push(entry)
  logger.info('audit', { ...entry })
  try {
    const userId = typeof entry.user === 'number' ? entry.user : parseInt(String(entry.user)) || undefined
    await query(
      'INSERT INTO "AuditLog" ("action", "entity", "entityId", "userId", "assetId", "meta", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [
        entry.action,
        entry.entity || (entry.ticketId ? 'ticket' : 'system'),
        entry.entityId ?? null,
        userId ?? null,
        entry.assetId ?? null,
        { ...entry.meta, ticketId: entry.ticketId, from: entry.from, to: entry.to },
      ]
    )
  } catch (err) {
    // avoid breaking primary flow if audit storage fails
    logger.warn('audit_store_failed', { error: (err as any)?.message || String(err) })
  }
}

export function getAuditByTicketId(ticketId: string) {
  return AUDIT_STORE.filter(a => a.ticketId === ticketId)
}

export default logger
