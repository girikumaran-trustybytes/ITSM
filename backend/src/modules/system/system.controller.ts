import { Request, Response } from 'express'
import { Pool } from 'pg'

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function parseDbConfigFromUrl(connectionString: string) {
  try {
    const url = new URL(connectionString)
    const database = String(url.pathname || '').replace(/^\/+/, '')
    const sslMode = String(url.searchParams.get('sslmode') || '').trim().toLowerCase()
    return {
      connectionString,
      host: String(url.hostname || '').trim(),
      port: Number(url.port || 5432),
      database,
      user: decodeURIComponent(String(url.username || '').trim()),
      ssl: ['require', 'verify-ca', 'verify-full'].includes(sslMode),
      hasPassword: Boolean(String(url.password || '').trim()),
    }
  } catch {
    return {
      connectionString,
      host: '',
      port: 5432,
      database: '',
      user: '',
      ssl: false,
      hasPassword: false,
    }
  }
}

function buildDbConnectionString(input: any): string {
  const raw = String(input?.connectionString || '').trim()
  if (raw) return raw
  const host = String(input?.host || '').trim()
  const port = Number(input?.port || 5432) || 5432
  const database = String(input?.database || '').trim()
  const user = String(input?.user || '').trim()
  const password = String(input?.password || '').trim()
  const ssl = toBool(input?.ssl, false)

  if (!host) throw { status: 400, message: 'Database host is required' }
  if (!database) throw { status: 400, message: 'Database name is required' }
  if (!user) throw { status: 400, message: 'Database user is required' }

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
  const sslSuffix = ssl ? '?sslmode=require' : ''
  return `postgresql://${auth}@${host}:${port}/${database}${sslSuffix}`
}

export async function getDatabaseConfig(_req: Request, res: Response) {
  const fromEnv = String(process.env.DATABASE_URL || '').trim()
  const cfg = parseDbConfigFromUrl(fromEnv)
  return res.json({
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    ssl: cfg.ssl,
    hasPassword: cfg.hasPassword,
    hasConnectionString: Boolean(cfg.connectionString),
  })
}

export async function testDatabaseConfig(req: Request, res: Response) {
  let pool: Pool | null = null
  try {
    const connectionString = buildDbConnectionString(req.body || {})
    const parsed = parseDbConfigFromUrl(connectionString)
    const started = Date.now()
    pool = new Pool({
      connectionString,
      max: 1,
      connectionTimeoutMillis: 6000,
      idleTimeoutMillis: 1000,
      ssl: parsed.ssl ? { rejectUnauthorized: false } : undefined,
    })
    const rows = await pool.query('SELECT NOW()::text AS now')
    const latencyMs = Date.now() - started
    return res.json({
      ok: true,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
      ssl: parsed.ssl,
      latencyMs,
      serverTime: rows.rows?.[0]?.now || null,
    })
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Database connection test failed' })
  } finally {
    if (pool) {
      try { await pool.end() } catch {}
    }
  }
}
