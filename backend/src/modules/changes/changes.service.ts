import prisma from '../../prisma/client'

export async function listChanges(opts: { q?: string } = {}) {
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { code: { contains: opts.q, mode: 'insensitive' } },
      { title: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  return prisma.change.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function getChange(id: number) {
  return prisma.change.findUnique({ where: { id } })
}

export async function createChange(payload: any) {
  const code = String(payload.code || '').trim()
  const title = String(payload.title || '').trim()
  if (!code) throw { status: 400, message: 'Code is required' }
  if (!title) throw { status: 400, message: 'Title is required' }
  return prisma.change.create({ data: { code, title, status: payload.status || null } })
}

export async function updateChange(id: number, payload: any) {
  const data: any = {}
  if (payload.code !== undefined) data.code = String(payload.code).trim()
  if (payload.title !== undefined) data.title = String(payload.title).trim()
  if (payload.status !== undefined) data.status = payload.status
  try {
    return await prisma.change.update({ where: { id }, data })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'Change not found' }
    throw err
  }
}

export async function deleteChange(id: number) {
  try {
    return await prisma.change.delete({ where: { id } })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'Change not found' }
    throw err
  }
}
