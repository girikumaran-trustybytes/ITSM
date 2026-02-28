import { Ticket } from '../tickets/ticket.model'

// Very small SLA engine: calculates breach when now > slaDue
export function checkSla(ticket: Ticket) {
  if (!ticket.slaDue) return { status: 'no-sla' }
  const due = new Date(ticket.slaDue).getTime()
  const now = Date.now()
  if (now > due) return { status: 'breached', byMs: now - due }
  const remaining = due - now
  return { status: 'ok', remainingMs: remaining }
}
