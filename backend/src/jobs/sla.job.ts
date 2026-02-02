import { getTickets, transitionTicket } from '../modules/tickets/ticket.service'
import { checkSla } from '../modules/sla/sla.engine'

export async function runSlaChecks() {
  try {
    const res = await getTickets({ page: 1, pageSize: 1000 })
    const tickets = Array.isArray(res.items) ? res.items : []
    tickets.forEach(async (t: any) => {
      const r = checkSla(t)
      if (r.status === 'breached') {
        console.warn(`SLA breached for ${t.ticketId || t.id}`)
        // simple automation: if ticket is New, move to In Progress for triage
        try {
          if (t.status === 'New') {
            await transitionTicket(t.ticketId || t.id, 'In Progress', 'system')
            console.info(`Auto-transitioned ${t.ticketId || t.id} to In Progress due to SLA breach`)
          }
        } catch (e) {
          console.warn('Failed to auto-transition ticket on SLA breach', e)
        }
        // In production enqueue escalation job/notification
      }
    })
  } catch (e) {
    console.error('SLA job failed', e)
  }
}

// run every minute for demo (in production use a proper scheduler)
setInterval(() => {
  runSlaChecks().catch(() => {})
}, 60_000)
