import { sendSmtpMail } from './mail.integration'

async function safeSend(to: string, subject: string, text: string) {
  try {
    await sendSmtpMail({ to, subject, text })
  } catch (error: any) {
    console.warn('[MAILER] Failed to send email', { to, subject, error: error?.message || error })
  }
}

async function strictSend(to: string, subject: string, text: string) {
  await sendSmtpMail({ to, subject, text })
}

export default {
  async sendTicketCreated(email: string, ticket: any) {
    const subject = `[ITSM] Ticket created: ${ticket?.ticketId || ticket?.id || ''}`.trim()
    const text = [
      'Your ticket has been created.',
      `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
      `Subject: ${ticket?.subject || '-'}`,
      `Status: ${ticket?.status || 'New'}`,
    ].join('\n')
    await safeSend(email, subject, text)
  },

  async sendStatusUpdated(email: string, ticket: any) {
    const subject = `[ITSM] Ticket status updated: ${ticket?.ticketId || ticket?.id || ''}`.trim()
    const text = [
      'A ticket status has been updated.',
      `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
      `Subject: ${ticket?.subject || '-'}`,
      `Status: ${ticket?.status || '-'}`,
    ].join('\n')
    await safeSend(email, subject, text)
  },

  async sendTicketResponse(email: string, ticket: any, message: string) {
    const subject = `[ITSM] New response: ${ticket?.ticketId || ticket?.id || ''}`.trim()
    const text = [
      'A new response was added to your ticket.',
      `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
      `Message: ${message || '-'}`,
    ].join('\n')
    await safeSend(email, subject, text)
  },

  async sendTicketResponseStrict(
    email: string,
    ticket: any,
    message: string,
    subjectOverride?: string,
    cc?: string,
    bcc?: string,
    attachments?: Array<{ filename: string; path?: string; contentType?: string }>
  ) {
    const subject = String(subjectOverride || `[ITSM] New response: ${ticket?.ticketId || ticket?.id || ''}`).trim()
    const text = [
      'A new response was added to your ticket.',
      `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
      `Message: ${message || '-'}`,
    ].join('\n')
    await sendSmtpMail({ to: email, cc, bcc, subject, text, attachments })
  },

  async sendTicketResolved(email: string, ticket: any) {
    const subject = `[ITSM] Ticket resolved: ${ticket?.ticketId || ticket?.id || ''}`.trim()
    const text = [
      'Your ticket has been resolved.',
      `Ticket: ${ticket?.ticketId || ticket?.id || '-'}`,
      `Resolution: ${ticket?.resolution || '-'}`,
    ].join('\n')
    await safeSend(email, subject, text)
  },
}
