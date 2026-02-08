import nodemailer from 'nodemailer'

const host = process.env.SMTP_HOST
const port = Number(process.env.SMTP_PORT || 587)
const user = process.env.SMTP_USER
const pass = process.env.SMTP_PASS

const transporter = nodemailer.createTransport({
  host,
  port,
  secure: port === 465,
  auth: user && pass ? { user, pass } : undefined,
})

async function sendMail(to: string, subject: string, html: string) {
  if (!host) {
    console.warn('SMTP not configured - skipping email to', to)
    return
  }
  await transporter.sendMail({
    to,
    subject,
    html,
    from: process.env.SMTP_FROM || user,
  })
}

export async function sendTicketCreated(to: string, ticket: any) {
  const html = `<h3>New Ticket Created: ${ticket.ticketId}</h3><p>Type: ${ticket.type}</p><p>Priority: ${ticket.priority}</p><p>${ticket.description || ''}</p>`
  await sendMail(to, `Ticket ${ticket.ticketId} created`, html)
}

export async function sendAssignmentChanged(to: string, ticket: any) {
  const html = `<h3>Ticket Assigned: ${ticket.ticketId}</h3><p>Assigned to: ${ticket.assignee?.email || 'N/A'}</p>`
  await sendMail(to, `Ticket ${ticket.ticketId} assigned`, html)
}

export async function sendStatusUpdated(to: string, ticket: any) {
  const html = `<h3>Ticket ${ticket.ticketId} - Status Updated</h3><p>New status: ${ticket.status}</p>`
  await sendMail(to, `Ticket ${ticket.ticketId} status updated`, html)
}

export async function sendSLABreach(to: string, ticket: any) {
  const html = `<h3>SLA Breach Alert: ${ticket.ticketId}</h3><p>Please review the ticket.</p>`
  await sendMail(to, `SLA Breach: ${ticket.ticketId}`, html)
}

export async function sendTicketResponse(to: string, ticket: any, message: string) {
  const html = `<h3>Update on Ticket ${ticket.ticketId}</h3><p>${message}</p>`
  await sendMail(to, `Update: ${ticket.ticketId}`, html)
}

export async function sendTicketResolved(to: string, ticket: any) {
  const html = `<h3>Ticket ${ticket.ticketId} Resolved</h3><p>Resolution: ${ticket.resolution || ''}</p>`
  await sendMail(to, `Resolved: ${ticket.ticketId}`, html)
}

export default { sendTicketCreated, sendAssignmentChanged, sendStatusUpdated, sendSLABreach, sendTicketResponse, sendTicketResolved }

