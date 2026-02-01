import { getTickets } from '../modules/tickets/ticket.service'
import { checkSla } from '../modules/sla/sla.engine'

export async function runSlaChecks() {
  try {
    const res = await getTickets({ page: 1, pageSize: 1000 })
    const tickets = Array.isArray(res.items) ? res.items : []
    tickets.forEach((t: any) => {
      const r = checkSla(t)
      if (r.status === 'breached') {
        console.warn(`SLA breached for ${t.ticketId || t.id}`)
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
