import prisma from '../../prisma/client'

export async function listServices(opts: { q?: string } = {}) {
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: 'insensitive' } },
      { description: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  return prisma.service.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function getService(id: number) {
  return prisma.service.findUnique({ where: { id } })
}

export async function createService(payload: any) {
  const name = String(payload.name || '').trim()
  if (!name) throw { status: 400, message: 'Name is required' }
  return prisma.service.create({ data: { name, description: payload.description || null } })
}

export async function updateService(id: number, payload: any) {
  const data: any = {}
  if (payload.name !== undefined) data.name = String(payload.name).trim()
  if (payload.description !== undefined) data.description = payload.description
  try {
    return await prisma.service.update({ where: { id }, data })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'Service not found' }
    throw err
  }
}

export async function deleteService(id: number) {
  try {
    return await prisma.service.delete({ where: { id } })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'Service not found' }
    throw err
  }
}
