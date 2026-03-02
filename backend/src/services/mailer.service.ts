import { sendSmtpMail } from './mail.integration'

const PLATFORM_BASE_MAIL = String(
  process.env.APPLICATION_BASE_MAIL ||
  process.env.SMTP_FROM ||
  process.env.SMTP_USER ||
  'no-reply@itsm.local'
).trim()
const TICKET_REPLY_BASE_URL = String(
  process.env.APP_URL ||
  process.env.WEB_APP_URL ||
  process.env.FRONTEND_URL ||
  'http://localhost:3000'
).trim().replace(/\/+$/, '')

function htmlEscape(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatTicketReplySubject(ticket: any, subjectOverride?: string) {
  const ticketLabel = String(ticket?.ticketId || ticket?.id || 'TB#000000').trim()
  const rawBase = String(subjectOverride || ticket?.subject || 'Ticket Update').trim()
  const withoutRe = rawBase.replace(/^re:\s*/i, '').trim()
  const withoutStatusPrefix = withoutRe.replace(
    /^(?:update|updated|accept|accepted|acknowledge|acknowledged|resolve|resolved|resolution update|close|closed|ticket closed|reopen|reopened|reject|rejected|pending|approval pending|in progress|on hold|supplier log)\s*-\s*/i,
    ''
  ).trim()
  const withoutTicketTags = withoutStatusPrefix.replace(/\[TB#\d+\]/gi, ' ').replace(/\s+/g, ' ').trim()
  const base = withoutTicketTags || 'Ticket Update'
  return `Re: ${base} [${ticketLabel}]`
}

function formatTicketReplyTextBody(ticket: any, message: string, agentName?: string) {
  const signatureName = String(agentName || 'TB Support Team').trim() || 'TB Support Team'
  const bodyContext = String(message || '-').trim() || '-'
  return [
    bodyContext,
    '',
    'To update your ticket or provide a response, please reply directly to this email.',
    '',
    'Thanks and regards,',
    '',
    signatureName,
    'TB Support Team.',
  ].join('\n')
}

function formatTicketReplyHtmlBody(ticket: any, message: string, agentName?: string) {
  const signatureName = String(agentName || 'TB Support Team').trim() || 'TB Support Team'
  const escapedMessage = htmlEscape(String(message || '-').trim() || '-')
  const htmlLines = escapedMessage.replace(/\r?\n/g, '<br/>')
  return [
    `<p style="margin:0 0 16px 0">${htmlLines}</p>`,
    '<p style="margin:0 0 12px 0">To update your ticket or provide a response, please reply directly to this email.</p>',
    '<p style="margin:0 0 12px 0">Thanks and regards,</p>',
    '<p style="margin:0 0 8px 0">' + htmlEscape(signatureName) + '</p>',
    '<p style="margin:0"><strong>TB Support Team.</strong></p>',
  ].join('')
}

async function safeSend(to: string, subject: string, text: string) {
  try {
    await sendSmtpMail({ to, subject, text, from: PLATFORM_BASE_MAIL })
  } catch (error: any) {
    console.warn('[MAILER] Failed to send email', { to, subject, error: error?.message || error })
  }
}

async function strictSend(to: string, subject: string, text: string) {
  await sendSmtpMail({ to, subject, text, from: PLATFORM_BASE_MAIL })
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
    attachments?: Array<{ filename: string; path?: string; contentType?: string }>,
    agentName?: string
  ) {
    const subject = formatTicketReplySubject(ticket, subjectOverride)
    const text = formatTicketReplyTextBody(ticket, message, agentName)
    const html = formatTicketReplyHtmlBody(ticket, message, agentName)
    await sendSmtpMail({ to: email, cc, bcc, subject, text, html, attachments, from: PLATFORM_BASE_MAIL })
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
