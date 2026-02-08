import prisma from '../../prisma/client'
import bcrypt from 'bcrypt'

export async function listUsers(opts: { q?: string; limit?: number; role?: string } = {}) {
  const where: any = {}
  if (opts.role) {
    where.role = opts.role
  }
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: 'insensitive' } },
      { email: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  const take = opts.limit && opts.limit > 0 ? opts.limit : 50
  return prisma.user.findMany({
    where,
    take,
    orderBy: { name: 'asc' },
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
  })
}

export async function getUserById(id: number) {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, phone: true, client: true, site: true, accountManager: true, status: true, createdAt: true, updatedAt: true },
  })
}

export async function createUser(payload: any) {
  const email = String(payload.email || '').trim().toLowerCase()
  const password = String(payload.password || '')
  if (!email) throw { status: 400, message: 'Email is required' }
  if (!password || password.length < 6) throw { status: 400, message: 'Password must be at least 6 characters' }

  const existing = await prisma.user.findUnique({ where: { email } })
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

  return prisma.user.create({
    data,
    select: { id: true, name: true, email: true, role: true, phone: true, client: true, site: true, accountManager: true, status: true, createdAt: true, updatedAt: true },
  })
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
    return await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, phone: true, client: true, site: true, accountManager: true, status: true, createdAt: true, updatedAt: true },
    })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'User not found' }
    if (err?.code === 'P2002') throw { status: 409, message: 'Email already exists' }
    throw err
  }
}

export async function deleteUser(id: number) {
  try {
    return await prisma.user.delete({
      where: { id },
      select: { id: true, name: true, email: true },
    })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'User not found' }
    throw err
  }
}
