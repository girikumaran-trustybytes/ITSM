import { query, queryOne } from '../../db'
import bcrypt from 'bcrypt'

export async function listUsers(opts: { q?: string; limit?: number; role?: string } = {}) {
  const conditions: string[] = []
  const params: any[] = []
  if (opts.role) {
    params.push(opts.role)
    conditions.push(`"role" = $${params.length}`)
  }
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`("name" ILIKE $${params.length} OR "email" ILIKE $${params.length})`)
  }
  const take = opts.limit && opts.limit > 0 ? opts.limit : 50
  params.push(take)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return query(
    `SELECT "id", "name", "email", "role", "status", "createdAt" FROM "User" ${where} ORDER BY "name" ASC LIMIT $${params.length}`,
    params
  )
}

export async function getUserById(id: number) {
  return queryOne(
    'SELECT "id", "name", "email", "role", "phone", "client", "site", "accountManager", "status", "createdAt", "updatedAt" FROM "User" WHERE "id" = $1',
    [id]
  )
}

export async function createUser(payload: any) {
  const email = String(payload.email || '').trim().toLowerCase()
  if (!email) throw { status: 400, message: 'Email is required' }
  let password = String(payload.password || '')
  if (password && password.length < 6) throw { status: 400, message: 'Password must be at least 6 characters' }
  if (!password) {
    password = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6)
  }

  const existing = await queryOne('SELECT "id" FROM "User" WHERE "email" = $1', [email])
  if (existing) throw { status: 409, message: 'Email already exists' }

  const hashed = await bcrypt.hash(password, 12)
  const data = {
    email,
    password: hashed,
    name: payload.name ?? null,
    phone: payload.phone ?? null,
    client: payload.client ?? null,
    site: payload.site ?? null,
    accountManager: payload.accountManager ?? null,
    role: payload.role || 'USER',
    status: payload.status || 'ACTIVE',
  }

  const rows = await query(
    'INSERT INTO "User" ("email", "password", "name", "phone", "client", "site", "accountManager", "role", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()) RETURNING "id", "name", "email", "role", "phone", "client", "site", "accountManager", "status", "createdAt", "updatedAt"',
    [data.email, data.password, data.name, data.phone, data.client, data.site, data.accountManager, data.role, data.status]
  )
  return rows[0]
}

export async function updateUser(id: number, payload: any) {
  const data: any = {}
  if (payload.email !== undefined) data.email = String(payload.email).trim().toLowerCase()
  if (payload.name !== undefined) data.name = payload.name
  if (payload.phone !== undefined) data.phone = payload.phone
  if (payload.client !== undefined) data.client = payload.client
  if (payload.site !== undefined) data.site = payload.site
  if (payload.accountManager !== undefined) data.accountManager = payload.accountManager
  if (payload.role !== undefined) data.role = payload.role
  if (payload.status !== undefined) data.status = payload.status
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
      `UPDATE "User" SET ${setParts.join(', ')} WHERE "id" = $${params.length} RETURNING "id", "name", "email", "role", "phone", "client", "site", "accountManager", "status", "createdAt", "updatedAt"`,
      params
    )
    if (!rows[0]) throw { status: 404, message: 'User not found' }
    return rows[0]
  } catch (err: any) {
    if (err?.status === 404) throw err
    if (err?.code === '23505') throw { status: 409, message: 'Email already exists' }
    throw err
  }
}

export async function deleteUser(id: number) {
  try {
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
