import prisma from '../prisma/client'
import { sendEmail, sendTeamsWebhook } from '../services/notification.service'

const POLL_INTERVAL = Number(process.env.SLA_POLL_MS || 30000)

async function checkSla() {
  const running = await prisma.slaTracking.findMany({ where: { status: 'running' } })
  for (const s of running) {
    if (s.breachTime && new Date(s.breachTime) <= new Date()) {
      // mark breach and notify
      await prisma.slaTracking.update({ where: { id: s.id }, data: { status: 'breached' } })
      // create history entry on ticket
      await prisma.ticketStatusHistory.create({ data: { ticketId: s.ticketId, oldStatus: 'open', newStatus: 'sla_breached', changedAt: new Date() } })
      // notify via templates (configurable in real app)
      await sendEmail('ops@example.com', `SLA breach: ${s.slaName}`, 'sla_breach.html', { ticketId: s.ticketId, slaName: s.slaName, breachTime: s.breachTime, appUrl: process.env.APP_URL || 'http://localhost:3000' })
    }
  }
}

export function startSlaWorker() {
  setInterval(() => { checkSla().catch(console.error) }, POLL_INTERVAL)
  console.info('[SLA Worker] started, interval', POLL_INTERVAL)
}
