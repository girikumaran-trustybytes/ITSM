import { Request, Response } from 'express'
import {
  getPublicMailConfig,
  sendSmtpMail,
  setMailConfigOverride,
  verifyImap,
  verifySmtp,
  setInboundRoutingConfig,
  type MailConfig,
} from '../../services/mail.integration'
import { query } from '../../db'

type StoredMailSettings = {
  provider?: MailConfig['provider']
  smtp?: Partial<MailConfig['smtp']>
  imap?: Partial<MailConfig['imap']>
  inbound?: {
    defaultQueue?: string
    inboundRoutes?: Array<{ email: string; queue: string }>
    outboundRoutes?: Array<{ queue: string; from: string }>
  }
  settings?: Record<string, any>
}

async function ensureSystemSettingsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
}

async function loadStoredMailSettings(): Promise<StoredMailSettings | null> {
  await ensureSystemSettingsTable()
  const rows = await query<{ value: any }>('SELECT value FROM system_settings WHERE key = $1', ['mail.settings'])
  const stored = rows[0]?.value
  return stored && typeof stored === 'object' ? stored : null
}

function normalizeStoredMailSettings(input: any): StoredMailSettings {
  const raw = input && typeof input === 'object' ? input : {}
  const smtp = raw.smtp && typeof raw.smtp === 'object' ? raw.smtp : {}
  const imap = raw.imap && typeof raw.imap === 'object' ? raw.imap : {}
  const inbound = raw.inbound && typeof raw.inbound === 'object' ? raw.inbound : {}
  const settings = raw.settings && typeof raw.settings === 'object' ? raw.settings : {}

  const inboundRoutes = Array.isArray(inbound.inboundRoutes)
    ? inbound.inboundRoutes
      .map((row: any) => ({
        email: String(row?.email || '').trim().toLowerCase(),
        queue: String(row?.queue || '').trim(),
      }))
      .filter((row: any) => row.email && row.queue)
    : undefined
  const outboundRoutes = Array.isArray(inbound.outboundRoutes)
    ? inbound.outboundRoutes
      .map((row: any) => ({
        queue: String(row?.queue || '').trim(),
        from: String(row?.from || '').trim().toLowerCase(),
      }))
      .filter((row: any) => row.queue && row.from)
    : undefined

  return {
    provider: raw.provider,
    smtp: {
      host: String(smtp.host || '').trim(),
      port: smtp.port ?? undefined,
      secure: Boolean(smtp.secure),
      user: String(smtp.user || '').trim(),
      pass: String(smtp.pass || '').trim(),
      from: String(smtp.from || '').trim(),
    },
    imap: {
      host: String(imap.host || '').trim(),
      port: imap.port ?? undefined,
      secure: Boolean(imap.secure),
      user: String(imap.user || '').trim(),
      pass: String(imap.pass || '').trim(),
      mailbox: String(imap.mailbox || '').trim(),
    },
    inbound: {
      defaultQueue: String(inbound.defaultQueue || '').trim(),
      inboundRoutes,
      outboundRoutes,
    },
    settings,
  }
}

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
  try {
    const stored = await loadStoredMailSettings()
    if (stored) {
      const normalized = normalizeStoredMailSettings(stored)
      const override: Partial<MailConfig> = {}
      if (normalized.provider) override.provider = normalized.provider
      if (normalized.smtp) override.smtp = normalized.smtp as MailConfig['smtp']
      if (normalized.imap) override.imap = normalized.imap as MailConfig['imap']
      if (Object.keys(override).length) {
        setMailConfigOverride(override)
      }
      if (normalized.inbound?.defaultQueue) {
        setInboundRoutingConfig(normalized.inbound)
      }
      const cfg = getPublicMailConfig()
      return res.json({ ...cfg, settings: normalized.settings || {} })
    }
    return res.json(getPublicMailConfig())
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load mail configuration' })
  }
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

export async function updateInboundRouting(req: Request, res: Response) {
  try {
    const defaultQueue = String(req.body?.defaultQueue || '').trim()
    if (!defaultQueue) return res.status(400).json({ error: 'defaultQueue is required' })
    const inboundRoutes = Array.isArray(req.body?.inboundRoutes)
      ? req.body.inboundRoutes.map((row: any) => ({
        email: String(row?.email || '').trim().toLowerCase(),
        queue: String(row?.queue || '').trim(),
      }))
      : undefined
    const outboundRoutes = Array.isArray(req.body?.outboundRoutes)
      ? req.body.outboundRoutes.map((row: any) => ({
        queue: String(row?.queue || '').trim(),
        from: String(row?.from || '').trim().toLowerCase(),
      }))
      : undefined
    const next = setInboundRoutingConfig({ defaultQueue, inboundRoutes, outboundRoutes })
    const stored = await loadStoredMailSettings()
    const normalized = normalizeStoredMailSettings(stored || {})
    normalized.inbound = next
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['mail.settings', normalized]
    )
    return res.json(next)
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to update inbound routing' })
  }
}

export async function updateConfig(req: Request, res: Response) {
  try {
    const incoming = normalizeStoredMailSettings(req.body || {})
    const override: Partial<MailConfig> = {}
    if (incoming.provider) override.provider = incoming.provider
    if (incoming.smtp) override.smtp = incoming.smtp as MailConfig['smtp']
    if (incoming.imap) override.imap = incoming.imap as MailConfig['imap']
    if (Object.keys(override).length) {
      setMailConfigOverride(override)
    }
    if (incoming.inbound?.defaultQueue) {
      setInboundRoutingConfig(incoming.inbound)
    }
    await ensureSystemSettingsTable()
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['mail.settings', incoming]
    )
    const cfg = getPublicMailConfig()
    return res.json({ ...cfg, settings: incoming.settings || {} })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update mail configuration' })
  }
}
