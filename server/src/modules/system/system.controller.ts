import { Request, Response } from 'express'
import { Pool } from 'pg'
import mysql from 'mysql2/promise'
import fs from 'fs'
import path from 'path'
import { query } from '../../db'

type SecuritySettings = {
  loginMethods: {
    password: boolean
    passwordless: boolean
    googleSso: boolean
    sso: boolean
  }
  ipRangeRestriction: {
    enabled: boolean
    ranges: string[]
  }
  sessionTimeoutMinutes: number
  requireAuthForPublicUrls: boolean
  ticketSharing: {
    publicLinks: boolean
    shareOutsideGroup: boolean
    allowRequesterShare: boolean
    requesterShareScope: 'any' | 'department'
  }
  adminNotifications: {
    adminUserId: string | null
  }
  attachmentFileTypes: {
    mode: 'all' | 'specific'
    types: string[]
  }
}

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  loginMethods: {
    password: true,
    passwordless: false,
    googleSso: false,
    sso: false,
  },
  ipRangeRestriction: {
    enabled: false,
    ranges: [],
  },
  sessionTimeoutMinutes: 60,
  requireAuthForPublicUrls: true,
  ticketSharing: {
    publicLinks: true,
    shareOutsideGroup: false,
    allowRequesterShare: true,
    requesterShareScope: 'any',
  },
  adminNotifications: {
    adminUserId: null,
  },
  attachmentFileTypes: {
    mode: 'all',
    types: [],
  },
}

type AccountSettings = {
  accountName: string
  currentPlan: string
  activeSince: string
  assetsCount: number
  agentsCount: number
  dataCenter: string
  version: string
  contact: {
    firstName: string
    lastName: string
    email: string
    phone: string
    invoiceEmail: string
    invoiceCc: string
  }
}

type AssetFieldConfig = {
  id: string
  label: string
  key: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'
  required: boolean
  options: string[]
}

type AssetTypeConfig = {
  id: string
  label: string
  description: string
  parentId: string | null
  icon: string
  fields: AssetFieldConfig[]
}

type AssetTypesSettings = {
  types: AssetTypeConfig[]
}

const resolveAppVersion = () => {
  const envVersion = String(process.env.APP_VERSION || process.env.npm_package_version || '').trim()
  if (envVersion) return envVersion
  const tryPaths = [
    path.resolve(process.cwd(), 'package.json'),
    path.resolve(process.cwd(), '..', 'package.json'),
  ]
  for (const candidate of tryPaths) {
    try {
      if (!fs.existsSync(candidate)) continue
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
      const version = String(parsed?.version || '').trim()
      if (version) return version
    } catch {
      // ignore and continue
    }
  }
  return '1.0.0'
}

const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  accountName: 'TB Asset Support Workspace',
  currentPlan: 'Standard',
  activeSince: '',
  assetsCount: 0,
  agentsCount: 0,
  dataCenter: 'US-East',
  version: resolveAppVersion(),
  contact: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    invoiceEmail: '',
    invoiceCc: '',
  },
}

const DEFAULT_ASSET_TYPES_SETTINGS: AssetTypesSettings = {
  types: [],
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

type DatabaseDialect = 'postgres' | 'mysql'

type DatabaseConfig = {
  dialect: DatabaseDialect
  connectionString: string
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean
}

function parseDbConfigFromUrl(connectionString: string) {
  try {
    const url = new URL(connectionString)
    const protocol = String(url.protocol || '').toLowerCase()
    const dialect = protocol.startsWith('mysql') ? 'mysql' : 'postgres'
    const database = String(url.pathname || '').replace(/^\/+/, '')
    const sslMode = String(url.searchParams.get('sslmode') || '').trim().toLowerCase()
    return {
      dialect,
      connectionString,
      host: String(url.hostname || '').trim(),
      port: Number(url.port || (dialect === 'mysql' ? 3306 : 5432)),
      database,
      user: decodeURIComponent(String(url.username || '').trim()),
      ssl: ['require', 'verify-ca', 'verify-full', 'ssl=true'].includes(sslMode),
      hasPassword: Boolean(String(url.password || '').trim()),
    }
  } catch {
    return {
      dialect: 'postgres' as DatabaseDialect,
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
  const dialect = String(input?.dialect || 'postgres').toLowerCase() === 'mysql' ? 'mysql' : 'postgres'
  const host = String(input?.host || '').trim()
  const port = Number(input?.port || (dialect === 'mysql' ? 3306 : 5432)) || (dialect === 'mysql' ? 3306 : 5432)
  const database = String(input?.database || '').trim()
  const user = String(input?.user || '').trim()
  const password = String(input?.password || '').trim()
  const ssl = toBool(input?.ssl, false)

  if (!host) throw { status: 400, message: 'Database host is required' }
  if (!database) throw { status: 400, message: 'Database name is required' }
  if (!user) throw { status: 400, message: 'Database user is required' }

  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`
  if (dialect === 'mysql') {
    const sslSuffix = ssl ? '?ssl=true' : ''
    return `mysql://${auth}@${host}:${port}/${database}${sslSuffix}`
  }
  const sslSuffix = ssl ? '?sslmode=require' : ''
  return `postgresql://${auth}@${host}:${port}/${database}${sslSuffix}`
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

function normalizeList(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,]+/g)
      .map((v) => v.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeSecuritySettings(input: any): SecuritySettings {
  const raw = input || {}
  const loginRaw = raw.loginMethods || {}
  const loginMethods = {
    password: toBool(loginRaw.password, true),
    passwordless: toBool(loginRaw.passwordless, false),
    googleSso: toBool(loginRaw.googleSso, false),
    sso: toBool(loginRaw.sso, false),
  }
  if (!loginMethods.password && !loginMethods.passwordless && !loginMethods.googleSso && !loginMethods.sso) {
    loginMethods.password = true
  }
  const ipRanges = normalizeList(raw.ipRangeRestriction?.ranges)
  const sessionTimeoutMinutes = Math.max(5, Math.min(1440, Number(raw.sessionTimeoutMinutes || 60) || 60))
  const requesterShareScope = String(raw.ticketSharing?.requesterShareScope || 'any').toLowerCase() === 'department'
    ? 'department'
    : 'any'
  const attachmentMode = String(raw.attachmentFileTypes?.mode || 'all') === 'specific' ? 'specific' : 'all'
  const attachmentTypes = attachmentMode === 'specific' ? normalizeList(raw.attachmentFileTypes?.types) : []

  return {
    loginMethods,
    ipRangeRestriction: {
      enabled: toBool(raw.ipRangeRestriction?.enabled, false),
      ranges: ipRanges,
    },
    sessionTimeoutMinutes,
    requireAuthForPublicUrls: toBool(raw.requireAuthForPublicUrls, true),
    ticketSharing: {
      publicLinks: toBool(raw.ticketSharing?.publicLinks, true),
      shareOutsideGroup: toBool(raw.ticketSharing?.shareOutsideGroup, false),
      allowRequesterShare: toBool(raw.ticketSharing?.allowRequesterShare, true),
      requesterShareScope,
    },
    adminNotifications: {
      adminUserId: raw.adminNotifications?.adminUserId
        ? String(raw.adminNotifications.adminUserId || '').trim() || null
        : null,
    },
    attachmentFileTypes: {
      mode: attachmentMode,
      types: attachmentTypes,
    },
  }
}

function normalizeAccountSettings(input: any): AccountSettings {
  const raw = input || {}
  const contact = raw.contact || {}
  return {
    accountName: String(raw.accountName || DEFAULT_ACCOUNT_SETTINGS.accountName).trim(),
    currentPlan: String(raw.currentPlan || DEFAULT_ACCOUNT_SETTINGS.currentPlan).trim(),
    activeSince: String(raw.activeSince || '').trim(),
    assetsCount: Number(raw.assetsCount || 0) || 0,
    agentsCount: Number(raw.agentsCount || 0) || 0,
    dataCenter: String(raw.dataCenter || DEFAULT_ACCOUNT_SETTINGS.dataCenter).trim(),
    version: resolveAppVersion(),
    contact: {
      firstName: String(contact.firstName || '').trim(),
      lastName: String(contact.lastName || '').trim(),
      email: String(contact.email || '').trim(),
      phone: String(contact.phone || '').trim(),
      invoiceEmail: String(contact.invoiceEmail || '').trim(),
      invoiceCc: String(contact.invoiceCc || '').trim(),
    },
  }
}

const ASSET_FIELD_TYPES = new Set(['text', 'number', 'date', 'select', 'textarea', 'boolean'])

function slugifyKey(value: string): string {
  const normalized = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || `field_${Date.now()}`
}

function normalizeAssetField(raw: any, fallbackId?: string): AssetFieldConfig | null {
  const label = String(raw?.label || raw?.name || '').trim()
  if (!label) return null
  const type = ASSET_FIELD_TYPES.has(String(raw?.type || '').toLowerCase())
    ? String(raw.type).toLowerCase()
    : 'text'
  const options = type === 'select'
    ? normalizeList(raw?.options)
    : []
  const key = slugifyKey(raw?.key || label)
  return {
    id: String(raw?.id || fallbackId || `af-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    label,
    key,
    type: type as AssetFieldConfig['type'],
    required: toBool(raw?.required, false),
    options,
  }
}

function normalizeAssetType(raw: any): AssetTypeConfig | null {
  const label = String(raw?.label || raw?.name || '').trim()
  if (!label) return null
  const fieldsRaw = Array.isArray(raw?.fields) ? raw.fields : []
  const fields: AssetFieldConfig[] = []
  const seenKeys = new Set<string>()
  for (const field of fieldsRaw) {
    const normalized = normalizeAssetField(field)
    if (!normalized) continue
    let key = normalized.key
    if (seenKeys.has(key)) {
      key = `${key}_${fields.length + 1}`
    }
    seenKeys.add(key)
    fields.push({ ...normalized, key })
  }
  return {
    id: String(raw?.id || `at-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    label,
    description: String(raw?.description || '').trim(),
    parentId: raw?.parentId ? String(raw.parentId).trim() : null,
    icon: String(raw?.icon || '').trim(),
    fields,
  }
}

function normalizeAssetTypesSettings(input: any): AssetTypesSettings {
  const rawTypes = Array.isArray(input?.types) ? input.types : []
  const normalized: AssetTypeConfig[] = []
  const seenLabels = new Set<string>()
  for (const raw of rawTypes) {
    const type = normalizeAssetType(raw)
    if (!type) continue
    const key = type.label.toLowerCase()
    if (seenLabels.has(key)) continue
    seenLabels.add(key)
    normalized.push(type)
  }
  return {
    types: normalized,
  }
}

async function getSystemSetting<T>(key: string): Promise<T | null> {
  await ensureSystemSettingsTable()
  const rows = await query<{ value: any }>('SELECT value FROM system_settings WHERE key = $1', [key])
  return rows[0]?.value ?? null
}

async function saveSystemSetting(key: string, value: any) {
  await ensureSystemSettingsTable()
  await query(
    `INSERT INTO system_settings (key, value, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value]
  )
}

export async function getDatabaseConfig(_req: Request, res: Response) {
  const fromEnv = String(process.env.DATABASE_URL || '').trim()
  const cfg = parseDbConfigFromUrl(fromEnv)
  return res.json({
    dialect: cfg.dialect,
    host: cfg.host,
    port: cfg.port,
    database: cfg.database,
    user: cfg.user,
    ssl: cfg.ssl,
    hasPassword: cfg.hasPassword,
    hasConnectionString: Boolean(cfg.connectionString),
  })
}

async function testPostgresConnection(connectionString: string, password?: string) {
  const parsed = parseDbConfigFromUrl(connectionString)
  const poolOptions: any = {
    connectionString,
    max: 1,
    connectionTimeoutMillis: 6000,
    idleTimeoutMillis: 1000,
    ssl: parsed.ssl ? { rejectUnauthorized: false } : undefined,
  }
  if (password) {
    poolOptions.password = password
  }
  const pool = new Pool(poolOptions)
  try {
    const rows = await pool.query('SELECT NOW()::text AS now')
    return rows.rows?.[0]?.now || null
  } finally {
    await pool.end()
  }
}

async function testMysqlConnection(connectionString: string) {
  const conn = await mysql.createConnection(connectionString)
  try {
    const [rows] = await conn.execute('SELECT NOW() AS now')
    if (Array.isArray(rows) && rows.length > 0 && typeof rows[0] === 'object') {
      return (rows[0] as any).now || null
    }
    return null
  } finally {
    await conn.end()
  }
}

export async function testDatabaseConfig(req: Request, res: Response) {
  try {
    const rawConnectionString = String(req.body?.connectionString || '').trim()
    const connectionString = buildDbConnectionString(req.body || {})
    const parsed = parseDbConfigFromUrl(connectionString)
    if (rawConnectionString && !parsed.hasPassword && typeof req.body?.password === 'string' && !req.body.password) {
      throw {
        status: 400,
        message: 'Connection string password is missing. Add password in the URL or use the Password field.',
      }
    }
    const started = Date.now()
    const serverTime = parsed.dialect === 'mysql'
      ? await testMysqlConnection(connectionString)
      : await testPostgresConnection(connectionString, String(req.body?.password || ''))
    const latencyMs = Date.now() - started
    return res.json({
      ok: true,
      dialect: parsed.dialect,
      host: parsed.host,
      port: parsed.port,
      database: parsed.database,
      user: parsed.user,
      ssl: parsed.ssl,
      latencyMs,
      serverTime,
    })
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Database connection test failed' })
  }
}

function readDotEnv(pathToEnv: string) {
  if (!fs.existsSync(pathToEnv)) return ''
  return fs.readFileSync(pathToEnv, 'utf8')
}

function writeDotEnv(pathToEnv: string, content: string) {
  fs.writeFileSync(pathToEnv, content, 'utf8')
}

function saveDotEnvValues(vars: Record<string, string>) {
  const envPath = path.resolve(__dirname, '../../../.env')
  const existing = readDotEnv(envPath).split(/\r?\n/)
  const nextLines: string[] = []
  const updatedKeys = new Set<string>()
  for (const rawLine of existing) {
    const match = rawLine.match(/^([A-Za-z0-9_]+)=(.*)$/)
    if (match && match[1] in vars) {
      nextLines.push(`${match[1]}=${vars[match[1]]}`)
      updatedKeys.add(match[1])
    } else {
      nextLines.push(rawLine)
    }
  }
  for (const [key, value] of Object.entries(vars)) {
    if (!updatedKeys.has(key)) {
      nextLines.push(`${key}=${value}`)
    }
  }
  writeDotEnv(envPath, nextLines.join('\n'))
}

export async function saveDatabaseConfig(req: Request, res: Response) {
  try {
    const connectionString = buildDbConnectionString(req.body || {})
    const parsed = parseDbConfigFromUrl(connectionString)
    saveDotEnvValues({
      DATABASE_URL: connectionString,
      DATABASE_DIALECT: parsed.dialect,
    })
    process.env.DATABASE_URL = connectionString
    process.env.DATABASE_DIALECT = parsed.dialect
    return res.json({ ok: true, dialect: parsed.dialect, connectionString })
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to save database configuration' })
  }
}

export async function migrateDatabaseConfig(req: Request, res: Response) {
  try {
    const rawConnectionString = String(req.body?.connectionString || '').trim()
    const connectionString = buildDbConnectionString(req.body || {})
    const parsed = parseDbConfigFromUrl(connectionString)
    if (rawConnectionString && !parsed.hasPassword && typeof req.body?.password === 'string' && !req.body.password) {
      throw {
        status: 400,
        message: 'Connection string password is missing. Add password in the URL or use the Password field.',
      }
    }
    if (parsed.dialect === 'mysql') {
      await testMysqlConnection(connectionString)
    } else {
      await testPostgresConnection(connectionString, String(req.body?.password || ''))
    }
    saveDotEnvValues({
      DATABASE_URL: connectionString,
      DATABASE_DIALECT: parsed.dialect,
    })
    process.env.DATABASE_URL = connectionString
    process.env.DATABASE_DIALECT = parsed.dialect
    return res.json({ ok: true, migrated: true, dialect: parsed.dialect, connectionString })
  } catch (err: any) {
    return res.status(err.status || 500).json({ error: err.message || 'Failed to migrate database configuration' })
  }
}

export async function getSecuritySettings(_req: Request, res: Response) {
  try {
    await ensureSystemSettingsTable()
    const rows = await query<{ value: any }>('SELECT value FROM system_settings WHERE key = $1', ['security.settings'])
    const stored = rows[0]?.value
    const normalized = stored ? normalizeSecuritySettings(stored) : DEFAULT_SECURITY_SETTINGS
    return res.json(normalized)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load security settings' })
  }
}

export async function updateSecuritySettings(req: Request, res: Response) {
  try {
    await ensureSystemSettingsTable()
    const next = normalizeSecuritySettings(req.body || {})
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['security.settings', next]
    )
    return res.json(next)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update security settings' })
  }
}

export async function getAccountSettings(_req: Request, res: Response) {
  try {
    await ensureSystemSettingsTable()
    const rows = await query<{ value: any }>('SELECT value FROM system_settings WHERE key = $1', ['account.settings'])
    const stored = rows[0]?.value
    const normalized = stored ? normalizeAccountSettings(stored) : DEFAULT_ACCOUNT_SETTINGS
    return res.json(normalized)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load account settings' })
  }
}

export async function updateAccountSettings(req: Request, res: Response) {
  try {
    await ensureSystemSettingsTable()
    const next = normalizeAccountSettings(req.body || {})
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['account.settings', next]
    )
    return res.json(next)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update account settings' })
  }
}

export async function exportAccountData(_req: Request, res: Response) {
  try {
    await ensureSystemSettingsTable()
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['account.export', { requestedAt: new Date().toISOString() }]
    )
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to request export' })
  }
}

export async function cancelAccount(_req: Request, res: Response) {
  try {
    await ensureSystemSettingsTable()
    await query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key)
       DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      ['account.cancel', { requestedAt: new Date().toISOString() }]
    )
    return res.json({ ok: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to request cancellation' })
  }
}

export async function getAssetTypesSettings(_req: Request, res: Response) {
  try {
    const stored = await getSystemSetting<any>('asset.types')
    const normalized = stored ? normalizeAssetTypesSettings(stored) : DEFAULT_ASSET_TYPES_SETTINGS
    return res.json(normalized)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to load asset types' })
  }
}

export async function updateAssetTypesSettings(req: Request, res: Response) {
  try {
    const next = normalizeAssetTypesSettings(req.body || {})
    await saveSystemSetting('asset.types', next)
    return res.json(next)
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update asset types' })
  }
}
