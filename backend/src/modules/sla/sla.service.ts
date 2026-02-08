import prisma from '../../prisma/client'

export async function listSlaConfigs(opts: { q?: string } = {}) {
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { name: { contains: opts.q, mode: 'insensitive' } },
      { priority: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  return prisma.slaConfig.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function getSlaConfig(id: number) {
  return prisma.slaConfig.findUnique({ where: { id } })
}

export async function createSlaConfig(payload: any) {
  const name = String(payload.name || '').trim()
  const priority = String(payload.priority || '').trim()
  const responseTimeMin = Number(payload.responseTimeMin)
  const resolutionTimeMin = Number(payload.resolutionTimeMin)
  if (!name) throw { status: 400, message: 'Name is required' }
  if (!priority) throw { status: 400, message: 'Priority is required' }
  if (!Number.isFinite(responseTimeMin) || responseTimeMin < 0) throw { status: 400, message: 'Invalid response time' }
  if (!Number.isFinite(resolutionTimeMin) || resolutionTimeMin < 0) throw { status: 400, message: 'Invalid resolution time' }

  return prisma.slaConfig.create({
    data: {
      name,
      priority,
      responseTimeMin,
      resolutionTimeMin,
      businessHours: Boolean(payload.businessHours),
      active: payload.active === undefined ? true : Boolean(payload.active),
    },
  })
}

export async function updateSlaConfig(id: number, payload: any) {
  const data: any = {}
  if (payload.name !== undefined) data.name = String(payload.name).trim()
  if (payload.priority !== undefined) data.priority = String(payload.priority).trim()
  if (payload.responseTimeMin !== undefined) data.responseTimeMin = Number(payload.responseTimeMin)
  if (payload.resolutionTimeMin !== undefined) data.resolutionTimeMin = Number(payload.resolutionTimeMin)
  if (payload.businessHours !== undefined) data.businessHours = Boolean(payload.businessHours)
  if (payload.active !== undefined) data.active = Boolean(payload.active)

  try {
    return await prisma.slaConfig.update({ where: { id }, data })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'SLA config not found' }
    throw err
  }
}

export async function deleteSlaConfig(id: number) {
  try {
    return await prisma.slaConfig.delete({ where: { id } })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'SLA config not found' }
    throw err
  }
}
