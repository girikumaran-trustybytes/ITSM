import { Request, Response } from 'express'
import { getPublicMailConfig, sendSmtpMail, verifyImap, verifySmtp, type MailConfig } from '../../services/mail.integration'

function pickOverride(body: any): Partial<MailConfig> | undefined {
  if (!body || typeof body !== 'object') return undefined
  const smtp = body.smtp && typeof body.smtp === 'object'
    ? {
      host: body.smtp.host,
      port: body.smtp.port,
      secure: body.smtp.secure,
      user: body.smtp.user,
      pass: body.smtp.pass,
      from: body.smtp.from,
    }
    : undefined
  const imap = body.imap && typeof body.imap === 'object'
    ? {
      host: body.imap.host,
      port: body.imap.port,
      secure: body.imap.secure,
      user: body.imap.user,
      pass: body.imap.pass,
      mailbox: body.imap.mailbox,
    }
    : undefined
  const provider = body.provider
  if (!smtp && !imap && !provider) return undefined
  return { provider, smtp, imap } as Partial<MailConfig>
}

export async function getConfig(_req: Request, res: Response) {
  return res.json(getPublicMailConfig())
}

export async function testSmtp(req: Request, res: Response) {
  try {
    const result = await verifySmtp(pickOverride(req.body))
    return res.json(result)
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'SMTP test failed' })
  }
}

export async function testImap(req: Request, res: Response) {
  try {
    const result = await verifyImap(pickOverride(req.body))
    return res.json(result)
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'IMAP test failed' })
  }
}

export async function sendTestMail(req: Request, res: Response) {
  try {
    const to = req.body?.to
    const subject = req.body?.subject || 'ITSM Mail Integration Test'
    const text = req.body?.text || 'SMTP integration test email from ITSM backend.'
    const html = req.body?.html
    const from = req.body?.from
    const result = await sendSmtpMail({ to, subject, text, html, from }, pickOverride(req.body))
    return res.json(result)
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to send test mail' })
  }
}

