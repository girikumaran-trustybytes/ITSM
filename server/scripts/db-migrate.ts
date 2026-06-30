import 'dotenv/config'
import crypto from 'crypto'
import dns from 'dns'
import fs from 'fs'
import path from 'path'
import { Pool, type PoolConfig } from 'pg'

type MigrationFile = {
  name: string
  fullPath: string
}
type DnsResultOrder = 'ipv4first' | 'verbatim'

const migrationFiles: MigrationFile[] = [
  { name: 'init.sql', fullPath: path.resolve(__dirname, '..', 'schema', 'init.sql') },
  { name: 'crud_core_schema.sql', fullPath: path.resolve(__dirname, '..', 'schema', 'crud_core_schema.sql') },
  { name: 'user_crud_rbac_compat.sql', fullPath: path.resolve(__dirname, '..', 'schema', 'user_crud_rbac_compat.sql') },
  { name: 'realtime.sql', fullPath: path.resolve(__dirname, '..', 'schema', 'realtime.sql') },
  { name: 'security_rls.sql', fullPath: path.resolve(__dirname, '..', 'schema', 'security_rls.sql') },
  { name: 'security_policies.sql', fullPath: path.resolve(__dirname, '..', 'schema', 'security_policies.sql') },
]

function readArgValue(flag: string) {
  const arg = process.argv.find((entry) => entry.startsWith(`${flag}=`))
  return arg ? arg.split('=').slice(1).join('=').trim() : ''
}

function normalizeConnectionString(value: string) {
  return String(value || '').trim()
}

function resolveConnectionString() {
  const fromArg = normalizeConnectionString(readArgValue('--url'))
  if (fromArg) return fromArg

  return [
    normalizeConnectionString(process.env.DATABASE_URL || ''),
    normalizeConnectionString(process.env.SUPABASE_DATABASE_URL || ''),
    normalizeConnectionString(process.env.SUPABASE_DB_URL || ''),
    normalizeConnectionString(process.env.POSTGRES_URL || ''),
    normalizeConnectionString(process.env.DATABASE_POOLER_URL || ''),
    normalizeConnectionString(process.env.SUPABASE_POOLER_URL || ''),
  ].find(Boolean) || ''
}

function toBool(value: unknown, fallback = false) {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return fallback
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

function shouldUseSsl(connectionString: string) {
  const sslMode = String(process.env.PGSSLMODE || '').trim().toLowerCase()
  if (sslMode === 'disable') return false
  if (['require', 'verify-ca', 'verify-full', 'prefer'].includes(sslMode)) return true

  if (/sslmode=disable/i.test(connectionString)) return false
  if (/sslmode=require/i.test(connectionString) || /ssl=true/i.test(connectionString)) return true
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
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
    console.warn('Unable to set DNS result order for migration DB connection:', err)
  }
}

function createPoolConfig(connectionString: string): PoolConfig {
  const useSsl = shouldUseSsl(connectionString)
  const rejectUnauthorized = toBool(process.env.PG_SSL_REJECT_UNAUTHORIZED, false)
  return {
    connectionString,
    ...(useSsl ? { ssl: { rejectUnauthorized } } : {}),
  }
}

function redactConnectionString(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '<redacted>'
  }
}

function checksum(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function ensureMigrationsTable(pool: Pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
}

async function wasMigrationApplied(pool: Pool, name: string) {
  const result = await pool.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations WHERE name = $1',
    [name]
  )
  return result.rows[0] || null
}

async function markMigrationApplied(pool: Pool, name: string, hash: string) {
  await pool.query(
    `INSERT INTO schema_migrations (name, checksum, applied_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (name)
     DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW()`,
    [name, hash]
  )
}

async function run() {
  configureDnsResultOrder()

  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error('DATABASE_URL (or --url) is required')
  }
  if (connectionString.includes('[YOUR-PASSWORD]')) {
    throw new Error('DATABASE_URL still contains placeholder [YOUR-PASSWORD]. Replace it with the real password.')
  }

  const pool = new Pool(createPoolConfig(connectionString))
  try {
    console.log(`Running migrations on ${redactConnectionString(connectionString)}`)
    await ensureMigrationsTable(pool)

    for (const file of migrationFiles) {
      if (!fs.existsSync(file.fullPath)) {
        throw new Error(`Migration file not found: ${file.fullPath}`)
      }
      const sql = fs.readFileSync(file.fullPath, 'utf8')
      const hash = checksum(sql)
      const existing = await wasMigrationApplied(pool, file.name)

      if (existing && existing.checksum === hash) {
        console.log(`Skipping ${file.name} (already applied)`)
        continue
      }

      if (existing && existing.checksum !== hash) {
        throw new Error(
          `Migration drift detected for ${file.name}. Existing checksum differs from current file.`
        )
      }

      console.log(`Applying ${file.name} ...`)
      await pool.query(sql)
      await markMigrationApplied(pool, file.name, hash)
      console.log(`Applied ${file.name}`)
    }

    const tableCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
       WHERE table_schema = 'public'`
    )
    console.log(`Migration complete. Public tables: ${tableCount.rows[0]?.count || '0'}`)
  } finally {
    await pool.end()
  }
}

run().catch((err: any) => {
  console.error('Migration failed:', err?.message || err)
  process.exit(1)
})
