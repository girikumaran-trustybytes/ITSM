import { query, queryOne } from '../../db'
import bcrypt from 'bcrypt'

function normalizeRole(input: any) {
  const value = String(input || 'USER').trim().toUpperCase()
  if (['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM'].includes(value)) return value
  return 'USER'
}

export type PresenceStatus = 'Available' | 'Do not disturb' | 'Set as away'

function normalizePresenceStatus(input: any): PresenceStatus {
  const raw = String(input || '').trim().toLowerCase()
  if (raw === 'available' || raw === 'online' || raw === 'active') return 'Available'
  if (raw === 'do not disturb' || raw === 'dnd' || raw === 'busy') return 'Do not disturb'
  if (raw === 'set as away' || raw === 'away') return 'Set as away'
  return 'Available'
}

let userSchemaReady: Promise<void> | null = null

async function ensureUserCrudSchema() {
  if (!userSchemaReady) {
    userSchemaReady = (async () => {
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workEmail" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeId" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "designation" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reportingManager" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateOfJoining" DATE`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employmentType" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workMode" TEXT`)
      await query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT`)
      await query(`CREATE INDEX IF NOT EXISTS idx_user_employee_id ON "User"("employeeId")`)
      await query(`CREATE INDEX IF NOT EXISTS idx_user_work_email ON "User"("workEmail")`)
      await query(`CREATE INDEX IF NOT EXISTS idx_user_personal_email ON "User"("personalEmail")`)
      await query(`
        CREATE TABLE IF NOT EXISTS "ServiceAccounts" (
          "id" SERIAL PRIMARY KEY,
          "userId" INTEGER NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
          "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
          "autoUpgradeQueues" BOOLEAN NOT NULL DEFAULT TRUE,
          "queueIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_service_accounts_user_id ON "ServiceAccounts"("userId")`)
      await query(`
        CREATE TABLE IF NOT EXISTS "UserPresence" (
          "userId" INTEGER PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "status" TEXT NOT NULL DEFAULT 'Available',
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
    })()
  }
  await userSchemaReady
}

function normalizeQueueIds(input: any): string[] {
  if (!Array.isArray(input)) return []
  return input
    .map((v) => String(v || '').trim())
    .filter((v) => v.length > 0)
}

async function syncServiceAccount(
  userId: number,
  enabled: boolean,
  opts: { autoUpgradeQueues?: any; queueIds?: any } = {}
) {
  if (!enabled) {
    await query(`DELETE FROM "ServiceAccounts" WHERE "userId" = $1`, [userId])
    return
  }

  const existing = await queryOne<{ autoUpgradeQueues: boolean; queueIds: string[] }>(
    `SELECT "autoUpgradeQueues", "queueIds" FROM "ServiceAccounts" WHERE "userId" = $1`,
    [userId]
  )
  const autoUpgradeQueues = typeof opts.autoUpgradeQueues === 'boolean'
    ? opts.autoUpgradeQueues
    : (existing?.autoUpgradeQueues ?? true)
  const queueIds = Array.isArray(opts.queueIds)
    ? normalizeQueueIds(opts.queueIds)
    : (existing?.queueIds ?? [])

  await query(
    `INSERT INTO "ServiceAccounts" ("userId", "enabled", "autoUpgradeQueues", "queueIds", "createdAt", "updatedAt")
     VALUES ($1, TRUE, $2, $3, NOW(), NOW())
     ON CONFLICT ("userId")
     DO UPDATE SET
       "enabled" = TRUE,
       "autoUpgradeQueues" = EXCLUDED."autoUpgradeQueues",
       "queueIds" = EXCLUDED."queueIds",
       "updatedAt" = NOW()`,
    [userId, autoUpgradeQueues, queueIds]
  )
}

export async function listUsers(opts: { q?: string; limit?: number; role?: string } = {}) {
  await ensureUserCrudSchema()
  const conditions: string[] = []
  const params: any[] = []
  if (opts.role) {
    params.push(opts.role)
    conditions.push(`u."role" = $${params.length}`)
  }
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`(u."name" ILIKE $${params.length} OR u."email" ILIKE $${params.length})`)
  }
  const take = opts.limit && opts.limit > 0 ? opts.limit : 50
  params.push(take)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const inviteTable = await queryOne<{ exists: string }>(
    `SELECT to_regclass('public.user_invites')::text AS exists`
  )
  const hasInvites = Boolean(inviteTable?.exists)
  if (!hasInvites) {
    return query(
      `SELECT
         u."id",
         u."name",
         u."avatarUrl",
         u."email",
         u."personalEmail",
         u."workEmail",
         u."phone",
         u."employeeId",
         u."designation",
         u."department",
         u."reportingManager",
         u."dateOfJoining",
         u."employmentType",
         u."workMode",
         u."role",
         u."status",
         COALESCE(up."status", 'Available') AS "presenceStatus",
         u."createdAt",
         COALESCE(sa."enabled", FALSE) AS "isServiceAccount",
         COALESCE(sa."autoUpgradeQueues", TRUE) AS "autoUpgradeQueues",
         COALESCE(sa."queueIds", ARRAY[]::TEXT[]) AS "queueIds",
         'none'::text AS "inviteStatus"
       FROM "User" u
       LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
       LEFT JOIN "UserPresence" up ON up."userId" = u."id"
       ${where}
       ORDER BY u."name" ASC NULLS LAST, u."email" ASC
       LIMIT $${params.length}`,
      params
    )
  }
  return query(
    `SELECT
       u."id",
       u."name",
       u."avatarUrl",
       u."email",
       u."personalEmail",
       u."workEmail",
       u."phone",
       u."employeeId",
       u."designation",
       u."department",
       u."reportingManager",
       u."dateOfJoining",
       u."employmentType",
       u."workMode",
       u."role",
       u."status",
       COALESCE(up."status", 'Available') AS "presenceStatus",
       u."createdAt",
       COALESCE(sa."enabled", FALSE) AS "isServiceAccount",
       COALESCE(sa."autoUpgradeQueues", TRUE) AS "autoUpgradeQueues",
       COALESCE(sa."queueIds", ARRAY[]::TEXT[]) AS "queueIds",
       COALESCE(ui.status, 'none') AS "inviteStatus"
     FROM "User" u
     LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
     LEFT JOIN "UserPresence" up ON up."userId" = u."id"
     LEFT JOIN LATERAL (
       SELECT status
       FROM user_invites
       WHERE user_id = u."id"
       ORDER BY created_at DESC
       LIMIT 1
     ) ui ON TRUE
     ${where}
     ORDER BY u."name" ASC NULLS LAST, u."email" ASC
     LIMIT $${params.length}`,
    params
  )
}

export async function getUserById(id: number) {
  await ensureUserCrudSchema()
  return queryOne(
    `SELECT
      u."id",
      u."name",
      u."avatarUrl",
      u."email",
      u."role",
      u."phone",
      u."client",
      u."site",
      u."accountManager",
      u."personalEmail",
      u."workEmail",
      u."employeeId",
      u."designation",
      u."department",
      u."reportingManager",
      u."dateOfJoining",
      u."employmentType",
      u."workMode",
      u."status",
      COALESCE(up."status", 'Available') AS "presenceStatus",
      u."createdAt",
      u."updatedAt",
      COALESCE(sa."enabled", FALSE) AS "isServiceAccount",
      COALESCE(sa."autoUpgradeQueues", TRUE) AS "autoUpgradeQueues",
      COALESCE(sa."queueIds", ARRAY[]::TEXT[]) AS "queueIds"
    FROM "User" u
    LEFT JOIN "ServiceAccounts" sa ON sa."userId" = u."id"
    LEFT JOIN "UserPresence" up ON up."userId" = u."id"
    WHERE u."id" = $1`,
    [id]
  )
}

export async function createUser(payload: any) {
  await ensureUserCrudSchema()
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) throw { status: 400, message: 'Email is required' }
  let password = String(payload.password || '')
  if (password && password.length < 6) throw { status: 400, message: 'Password must be at least 6 characters' }
  if (!password) {
    password = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
  }

  const existing = await queryOne('SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1)', [email])
  if (existing) throw { status: 409, message: 'Email already exists' }

  const hashed = await bcrypt.hash(password, 12)
  const data = {
    email,
    password: hashed,
    name: payload.name ?? null,
    avatarUrl: payload.avatarUrl ?? null,
    phone: payload.phone ?? null,
    personalEmail: payload.personalEmail ?? null,
    workEmail: payload.workEmail ?? null,
    employeeId: payload.employeeId ?? null,
    designation: payload.designation ?? null,
    department: payload.department ?? null,
    reportingManager: payload.reportingManager ?? null,
    dateOfJoining: payload.dateOfJoining ?? null,
    employmentType: payload.employmentType ?? null,
    workMode: payload.workMode ?? null,
    client: payload.client ?? null,
    site: payload.site ?? null,
    accountManager: payload.accountManager ?? null,
    role: normalizeRole(payload.role),
    status: String(payload.status || 'ACTIVE').trim().toUpperCase(),
  }
  const explicitServiceAccount = payload.isServiceAccount === true || payload.isServiceAccount === false
    ? Boolean(payload.isServiceAccount)
    : null
  const shouldEnableServiceAccount = explicitServiceAccount !== null
    ? explicitServiceAccount
    : data.role === 'AGENT'
  if (shouldEnableServiceAccount) data.role = 'AGENT'

  try {
    const rows = await query(
      `INSERT INTO "User" (
        "email", "password", "name", "avatarUrl", "phone", "personalEmail", "workEmail", "employeeId", "designation", "department",
        "reportingManager", "dateOfJoining", "employmentType", "workMode", "client", "site", "accountManager", "role", "status", "createdAt", "updatedAt"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()
      )
      RETURNING "id", "name", "avatarUrl", "email", "role", "phone", "personalEmail", "workEmail", "employeeId", "designation", "department", "reportingManager", "dateOfJoining", "employmentType", "workMode", "client", "site", "accountManager", "status", "createdAt", "updatedAt"`,
      [
        data.email, data.password, data.name, data.avatarUrl, data.phone, data.personalEmail, data.workEmail, data.employeeId, data.designation, data.department,
        data.reportingManager, data.dateOfJoining, data.employmentType, data.workMode, data.client, data.site, data.accountManager, data.role, data.status,
      ]
    )
    const created = rows[0]
    await syncServiceAccount(
      Number(created.id),
      shouldEnableServiceAccount,
      {
        autoUpgradeQueues: payload.autoUpgradeQueues,
        queueIds: payload.queueIds,
      }
    )
    return getUserById(Number(created.id))
  } catch (err: any) {
    if (err?.code === '23505') throw { status: 409, message: 'Email already exists' }
    throw err
  }
}

export async function updateUser(id: number, payload: any) {
  await ensureUserCrudSchema()
  const currentUser = await queryOne<{ id: number; role: string }>(
    'SELECT "id", "role" FROM "User" WHERE "id" = $1',
    [id]
  )
  if (!currentUser) throw { status: 404, message: 'User not found' }

  const data: any = {}
  if (payload.email !== undefined) data.email = String(payload.email).trim().toLowerCase()
  if (payload.name !== undefined) data.name = payload.name
  if (payload.avatarUrl !== undefined) data.avatarUrl = payload.avatarUrl
  if (payload.phone !== undefined) data.phone = payload.phone
  if (payload.personalEmail !== undefined) data.personalEmail = payload.personalEmail
  if (payload.workEmail !== undefined) data.workEmail = payload.workEmail
  if (payload.employeeId !== undefined) data.employeeId = payload.employeeId
  if (payload.designation !== undefined) data.designation = payload.designation
  if (payload.department !== undefined) data.department = payload.department
  if (payload.reportingManager !== undefined) data.reportingManager = payload.reportingManager
  if (payload.dateOfJoining !== undefined) data.dateOfJoining = payload.dateOfJoining
  if (payload.employmentType !== undefined) data.employmentType = payload.employmentType
  if (payload.workMode !== undefined) data.workMode = payload.workMode
  if (payload.client !== undefined) data.client = payload.client
  if (payload.site !== undefined) data.site = payload.site
  if (payload.accountManager !== undefined) data.accountManager = payload.accountManager
  if (payload.role !== undefined) data.role = normalizeRole(payload.role)
  if (payload.status !== undefined) data.status = String(payload.status).trim().toUpperCase()

  const explicitServiceAccount = payload.isServiceAccount === true || payload.isServiceAccount === false
    ? Boolean(payload.isServiceAccount)
    : null
  if (explicitServiceAccount === true) data.role = 'AGENT'
  if (explicitServiceAccount === false && payload.role === undefined && String(currentUser.role || '').toUpperCase() === 'AGENT') {
    data.role = 'USER'
  }

  if (payload.password) {
    if (String(payload.password).length < 6) throw { status: 400, message: 'Password must be at least 6 characters' }
    data.password = await bcrypt.hash(String(payload.password), 12)
  }

  try {
    const setParts: string[] = []
    const params: any[] = []
    for (const [key, value] of Object.entries(data)) {
      params.push(value)
      setParts.push(`"${key}" = $${params.length}`)
    }
    setParts.push('"updatedAt" = NOW()')
    params.push(id)
    const rows = await query(
      `UPDATE "User" SET ${setParts.join(', ')} WHERE "id" = $${params.length}
       RETURNING "id", "name", "avatarUrl", "email", "role", "phone", "personalEmail", "workEmail", "employeeId", "designation", "department", "reportingManager", "dateOfJoining", "employmentType", "workMode", "client", "site", "accountManager", "status", "createdAt", "updatedAt"`,
      params
    )
    if (!rows[0]) throw { status: 404, message: 'User not found' }
    const shouldSyncServiceAccount =
      explicitServiceAccount !== null ||
      payload.role !== undefined ||
      payload.autoUpgradeQueues !== undefined ||
      payload.queueIds !== undefined

    if (shouldSyncServiceAccount) {
      const nextRole = String((rows[0] as any)?.role || currentUser.role || '').toUpperCase()
      const enabled = explicitServiceAccount !== null ? explicitServiceAccount : nextRole === 'AGENT'
      await syncServiceAccount(
        id,
        enabled,
        {
          autoUpgradeQueues: payload.autoUpgradeQueues,
          queueIds: payload.queueIds,
        }
      )
    }
    return getUserById(id)
  } catch (err: any) {
    if (err?.status === 404) throw err
    if (err?.code === '23505') throw { status: 409, message: 'Email already exists' }
    throw err
  }
}

export async function deleteUser(id: number) {
  await ensureUserCrudSchema()
  try {
    await query('DELETE FROM "ServiceAccounts" WHERE "userId" = $1', [id])
    const rows = await query(
      'DELETE FROM "User" WHERE "id" = $1 RETURNING "id", "name", "email"',
      [id]
    )
    if (!rows[0]) throw { status: 404, message: 'User not found' }
    return rows[0]
  } catch (err: any) {
    if (err?.status === 404) throw err
    throw err
  }
}

export async function getUserPresence(userId: number): Promise<{ status: PresenceStatus }> {
  await ensureUserCrudSchema()
  const user = await queryOne<{ id: number }>('SELECT "id" FROM "User" WHERE "id" = $1', [userId])
  if (!user) throw { status: 404, message: 'User not found' }
  const row = await queryOne<{ status: string }>(
    'SELECT "status" FROM "UserPresence" WHERE "userId" = $1',
    [userId]
  )
  return { status: normalizePresenceStatus(row?.status) }
}

export async function saveUserPresence(userId: number, statusInput: any): Promise<{ status: PresenceStatus }> {
  await ensureUserCrudSchema()
  const user = await queryOne<{ id: number }>('SELECT "id" FROM "User" WHERE "id" = $1', [userId])
  if (!user) throw { status: 404, message: 'User not found' }
  const status = normalizePresenceStatus(statusInput)
  await query(
    `INSERT INTO "UserPresence" ("userId", "status", "updatedAt")
     VALUES ($1, $2, NOW())
     ON CONFLICT ("userId")
     DO UPDATE SET "status" = EXCLUDED."status", "updatedAt" = NOW()`,
    [userId, status]
  )
  return { status }
}
