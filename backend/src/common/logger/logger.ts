import winston from 'winston'

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

export function auditLog(entry: { ticketId?: string; user?: any; from?: string; to?: string; action: string; when?: string; meta?: any }) {
  // persist to in-memory store for quick lookup + structured logger
  AUDIT_STORE.push(entry)
  logger.info('audit', { ...entry })
}

export function getAuditByTicketId(ticketId: string) {
  return AUDIT_STORE.filter(a => a.ticketId === ticketId)
}

export default logger
