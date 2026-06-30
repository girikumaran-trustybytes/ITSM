import dns from 'dns'
import { Pool, PoolClient, QueryResult } from 'pg'

type DnsResultOrder = 'ipv4first' | 'verbatim'

function isPlaceholderDatabaseHost(hostname: string) {
  const normalized = String(hostname || '').trim().toLowerCase()
  return normalized === 'base'
}

function isSupabaseDirectHost(hostname: string) {
  return /^db\.[a-z0-9]+\.(?:supabase\.co)$/i.test(String(hostname || '').trim())
}

function normalizeConnectionString(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const wrappedInDoubleQuotes = raw.startsWith('"') && raw.endsWith('"')
  const wrappedInSingleQuotes = raw.startsWith("'") && raw.endsWith("'")
  if (wrappedInDoubleQuotes || wrappedInSingleQuotes) {
    return raw.slice(1, -1).trim()
  }
  return raw
}

function isValidPostgresConnectionString(connectionString: string) {
  const normalized = normalizeConnectionString(connectionString)
  if (!normalized) return false
  try {
    const url = new URL(normalized)
    const protocol = String(url.protocol || '').toLowerCase()
    const hostname = String(url.hostname || '').trim()
    if (protocol !== 'postgres:' && protocol !== 'postgresql:') return false
    if (!hostname) return false
    if (isPlaceholderDatabaseHost(hostname)) return false
    return true
  } catch {
    return false
  }
}

function resolveDnsResultOrder(): DnsResultOrder | null {
  const explicit = String(process.env.PG_DNS_RESULT_ORDER || '').trim().toLowerCase()
  if (explicit === 'ipv4first' || explicit === 'verbatim') return explicit
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
  return isProduction ? 'ipv4first' : null
}

function configureDnsResultOrder() {
  const dnsResultOrder = resolveDnsResultOrder()
  if (!dnsResultOrder) return
  try {
    dns.setDefaultResultOrder(dnsResultOrder)
  } catch (err) {
    console.warn('Unable to set DNS result order for Postgres connections:', err)
  }
}

configureDnsResultOrder()

function resolveConnectionString() {
  const rawCandidates: Array<{ key: string; value: string }> = [
    { key: 'DATABASE_URL', value: normalizeConnectionString(process.env.DATABASE_URL) },
    { key: 'SUPABASE_DATABASE_URL', value: normalizeConnectionString(process.env.SUPABASE_DATABASE_URL) },
    { key: 'SUPABASE_DB_URL', value: normalizeConnectionString(process.env.SUPABASE_DB_URL) },
    { key: 'POSTGRES_URL', value: normalizeConnectionString(process.env.POSTGRES_URL) },
    { key: 'DATABASE_POOLER_URL', value: normalizeConnectionString(process.env.DATABASE_POOLER_URL) },
    { key: 'SUPABASE_POOLER_URL', value: normalizeConnectionString(process.env.SUPABASE_POOLER_URL) },
  ]

  for (const candidate of rawCandidates) {
    if (!candidate.value) continue
    try {
      const parsed = new URL(candidate.value)
      const hostname = String(parsed.hostname || '').trim()
      if (isPlaceholderDatabaseHost(hostname)) {
        console.warn(
          `${candidate.key} is set to an invalid placeholder host "${hostname}". ` +
          'Please set a real PostgreSQL host.'
        )
      } else if (isSupabaseDirectHost(hostname)) {
        console.warn(
          `${candidate.key} uses a Supabase direct database host (${hostname}). ` +
          'If your runtime has no IPv6 egress, prefer a Supabase pooler URL (aws-*.pooler.supabase.com).'
        )
      }
    } catch {
      // Ignore parse failures here; they will be filtered out below.
    }
  }

  const candidates = rawCandidates
    .map((entry) => entry.value)
    .filter((value) => isValidPostgresConnectionString(value))

  if (!candidates.length) return ''
  return candidates[0]
}

const connectionString = resolveConnectionString()
let pool: Pool | null = null

function toBool(value: unknown, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function shouldUseSsl(databaseUrl: string) {
  const envMode = String(process.env.PGSSLMODE || '').trim().toLowerCase()
  if (envMode === 'disable') return false
  if (['require', 'verify-ca', 'verify-full', 'prefer'].includes(envMode)) return true

  if (/sslmode=disable/i.test(databaseUrl)) return false
  if (/sslmode=require/i.test(databaseUrl) || /ssl=true/i.test(databaseUrl)) return true

  // In production, default to SSL unless explicitly disabled.
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
}

if (!connectionString) {
  // Avoid hard failure at import time; server will surface a clearer error on first query.
  console.warn(
    'Database URL is not set or invalid (checked DATABASE_URL, SUPABASE_DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, DATABASE_POOLER_URL, SUPABASE_POOLER_URL)'
  )
} else {
  const sslEnabled = shouldUseSsl(connectionString)
  pool = new Pool({
    connectionString,
    // Keep a moderate default pool size so auth/invite endpoints do not starve
    // under concurrent polling traffic; override with PG_POOL_MAX when needed.
    max: Number(process.env.PG_POOL_MAX || 10),
    idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
    connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 5000),
    query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 30000),
    statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT_MS || 45000),
    keepAlive: toBool(process.env.PG_KEEPALIVE, true),
    keepAliveInitialDelayMillis: Number(process.env.PG_KEEPALIVE_INITIAL_DELAY_MS || 10000),
    ...(sslEnabled
      ? {
          ssl: {
            rejectUnauthorized: toBool(process.env.PG_SSL_REJECT_UNAUTHORIZED, false),
          },
        }
      : {}),
  })

  pool.on('error', (err) => {
    console.error('Unexpected pg pool error', err)
  })
}

function requirePool(): Pool {
  if (!pool) {
    const err = new Error('DATABASE_URL is not set or empty')
    ;(err as any).code = 'DB_CONFIG_MISSING'
    throw err
  }
  return pool
}

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result: QueryResult = await requirePool().query(text, params)
  return result.rows as T[]
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await requirePool().connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export default pool
