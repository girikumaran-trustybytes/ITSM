#!/usr/bin/env ts-node
import 'dotenv/config'
import dns from 'dns'
import fs from 'fs'
import path from 'path'
import bcrypt from 'bcrypt'
import { Pool, type PoolConfig } from 'pg'

const DEFAULT_ADMIN_EMAIL = 'admin@techdesk.local'
const DEFAULT_ADMIN_NAME = 'TechDesk Administrator'
type DnsResultOrder = 'ipv4first' | 'verbatim'

const schemaFiles = [
  path.resolve(__dirname, '..', 'schema', 'init.sql'),
  path.resolve(__dirname, '..', 'schema', 'crud_core_schema.sql'),
  path.resolve(__dirname, '..', 'schema', 'user_crud_rbac_compat.sql'),
  path.resolve(__dirname, '..', 'schema', 'realtime.sql'),
  path.resolve(__dirname, '..', 'schema', 'security_rls.sql'),
  path.resolve(__dirname, '..', 'schema', 'security_policies.sql'),
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
    console.warn('Unable to set DNS result order for reset-admin DB connection:', err)
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

async function tableExists(pool: Pool, regclass: string) {
  const result = await pool.query<{ rel: string | null }>(
    'SELECT to_regclass($1) AS rel',
    [regclass]
  )
  return Boolean(result.rows[0]?.rel)
}

async function applySchemaFiles(pool: Pool) {
  for (const filePath of schemaFiles) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Schema file not found: ${filePath}`)
    }
    const sql = fs.readFileSync(filePath, 'utf8')
    console.log(`Applying schema file: ${path.basename(filePath)}`)
    await pool.query(sql)
  }
}

async function ensureUserTable(pool: Pool) {
  const exists = await tableExists(pool, 'public."User"')
  if (exists) return
  console.log('User table missing. Bootstrapping schema files...')
  await applySchemaFiles(pool)
  const created = await tableExists(pool, 'public."User"')
  if (!created) {
    throw new Error('Failed to create "User" table after schema bootstrap')
  }
}

async function deleteAllUsers(pool: Pool) {
  await pool.query('BEGIN')
  try {
    if (await tableExists(pool, 'public."RefreshToken"')) {
      await pool.query('DELETE FROM "RefreshToken"')
    }
    if (await tableExists(pool, 'public.user_roles')) {
      await pool.query('DELETE FROM user_roles')
    }
    if (await tableExists(pool, 'public.user_permissions_override')) {
      await pool.query('DELETE FROM user_permissions_override')
    }
    if (await tableExists(pool, 'public."ServiceAccounts"')) {
      await pool.query('DELETE FROM "ServiceAccounts"')
    }
    if (await tableExists(pool, 'public."UserPresence"')) {
      await pool.query('DELETE FROM "UserPresence"')
    }
    if (await tableExists(pool, 'public."PasswordResetToken"')) {
      await pool.query('DELETE FROM "PasswordResetToken"')
    }
    if (await tableExists(pool, 'public."MfaChallenge"')) {
      await pool.query('DELETE FROM "MfaChallenge"')
    }
    if (await tableExists(pool, 'public."MfaTrustedDevice"')) {
      await pool.query('DELETE FROM "MfaTrustedDevice"')
    }
    if (await tableExists(pool, 'public.invitations')) {
      await pool.query('DELETE FROM invitations')
    }
    await pool.query('DELETE FROM "User"')
    await pool.query('COMMIT')
  } catch (error) {
    await pool.query('ROLLBACK')
    throw error
  }
}

async function ensureRoleTables(pool: Pool) {
  if (!(await tableExists(pool, 'public.roles'))) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS roles (
        role_id SERIAL PRIMARY KEY,
        role_name TEXT NOT NULL UNIQUE,
        is_system BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }
  if (!(await tableExists(pool, 'public.user_roles'))) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
        role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(user_id, role_id)
      )
    `)
  }
}

async function createSingleAdmin(pool: Pool, email: string, password: string, name: string) {
  const hash = await bcrypt.hash(password, 12)
  const rows = await pool.query<{
    id: number
    email: string
    name: string | null
    role: string
    status: string
  }>(
    `INSERT INTO "User" ("email", "password", "name", "role", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE', NOW(), NOW())
     RETURNING "id", "email", "name", "role"::text AS "role", "status"`,
    [email, hash, name]
  )
  const admin = rows.rows[0]
  if (!admin?.id) throw new Error('Failed to create admin user')

  await ensureRoleTables(pool)
  await pool.query('INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING', ['ADMIN'])
  await pool.query(
    `INSERT INTO user_roles (user_id, role_id)
     SELECT $1, role_id
     FROM roles
     WHERE role_name = 'ADMIN'
     ON CONFLICT (user_id, role_id) DO NOTHING`,
    [admin.id]
  )

  return admin
}

async function verifyFinalState(pool: Pool, email: string) {
  const tableCheck = await pool.query<{ rel: string | null }>(
    'SELECT to_regclass($1) AS rel',
    ['public."User"']
  )
  const stats = await pool.query<{
    total_users: string
    admin_users: string
    target_exists: string
  }>(
    `SELECT
       COUNT(*)::text AS total_users,
       COUNT(*) FILTER (WHERE UPPER(COALESCE("role"::text, '')) = 'ADMIN')::text AS admin_users,
       COUNT(*) FILTER (WHERE LOWER("email") = LOWER($1))::text AS target_exists
     FROM "User"`,
    [email]
  )
  return {
    userTable: tableCheck.rows[0]?.rel || null,
    totalUsers: Number(stats.rows[0]?.total_users || 0),
    adminUsers: Number(stats.rows[0]?.admin_users || 0),
    targetExists: Number(stats.rows[0]?.target_exists || 0),
  }
}

async function main() {
  configureDnsResultOrder()

  const connectionString = resolveConnectionString()
  if (!connectionString) {
    throw new Error('DATABASE_URL (or --url) is required')
  }
  if (connectionString.includes('[YOUR-PASSWORD]')) {
    throw new Error('DATABASE_URL still contains placeholder [YOUR-PASSWORD]. Replace it with the real password.')
  }

  const email = String(readArgValue('--email') || process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase()
  const password = String(readArgValue('--password') || '').trim()
  const name = String(readArgValue('--name') || DEFAULT_ADMIN_NAME).trim() || DEFAULT_ADMIN_NAME

  if (!email) throw new Error('Admin email is required (--email=...)')
  if (!password) throw new Error('Admin password is required (--password=...)')

  const pool = new Pool(createPoolConfig(connectionString))
  try {
    console.log(`Resetting users on ${redactConnectionString(connectionString)}`)
    await ensureUserTable(pool)
    await deleteAllUsers(pool)
    const admin = await createSingleAdmin(pool, email, password, name)
    const state = await verifyFinalState(pool, email)

    console.log('Admin provisioned:', {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      status: admin.status,
    })
    console.log('Verification:', state)

    if (!state.userTable || state.totalUsers !== 1 || state.adminUsers !== 1 || state.targetExists !== 1) {
      throw new Error('Verification failed: expected exactly one ADMIN user with the provided email.')
    }
  } finally {
    await pool.end()
  }
}

main().catch((error: any) => {
  console.error('Reset failed:', error?.message || error)
  process.exit(1)
})
