import prisma from '../../prisma/client'

export async function listAssets(opts: {
  page?: number
  pageSize?: number
  q?: string
  status?: string
  category?: string
  assignedToId?: number
} = {}) {
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 20
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { assetId: { contains: opts.q, mode: 'insensitive' } },
      { name: { contains: opts.q, mode: 'insensitive' } },
      { serial: { contains: opts.q, mode: 'insensitive' } },
      { category: { contains: opts.q, mode: 'insensitive' } },
      { vendor: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  if (opts.status) where.status = opts.status
  if (opts.category) where.category = opts.category
  if (opts.assignedToId !== undefined) where.assignedToId = opts.assignedToId

  const [items, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { assignedTo: true, parentAsset: true },
    }),
    prisma.asset.count({ where }),
  ])

  return { items, total, page, pageSize }
}

export async function getAssetById(id: number) {
  return prisma.asset.findUnique({
    where: { id },
    include: {
      assignedTo: true,
      parentAsset: true,
      childAssets: true,
      tickets: true,
      assetChanges: { include: { change: true } },
      assetProblems: { include: { problem: true } },
      assetServices: { include: { service: true } },
    },
  })
}

export async function createAsset(data: any) {
  return prisma.asset.create({ data })
}

export async function updateAsset(id: number, data: any) {
  return prisma.asset.update({ where: { id }, data })
}

export async function deleteAsset(id: number) {
  return prisma.asset.delete({ where: { id } })
}

export async function linkTicketsToAsset(assetId: number, ticketIds: string[]) {
  await prisma.ticket.updateMany({ where: { assetId }, data: { assetId: null } })
  if (ticketIds.length === 0) return
  const numericIds = ticketIds.map((t) => Number(t)).filter((n) => !Number.isNaN(n))
  await prisma.ticket.updateMany({
    where: {
      OR: [
        { ticketId: { in: ticketIds } },
        ...(numericIds.length ? [{ id: { in: numericIds } }] : []),
      ],
    },
    data: { assetId },
  })
}

export async function setAssetChanges(assetId: number, changeIds: number[]) {
  await prisma.assetChange.deleteMany({ where: { assetId } })
  if (!changeIds.length) return
  await prisma.assetChange.createMany({ data: changeIds.map((changeId) => ({ assetId, changeId })) })
}

export async function setAssetProblems(assetId: number, problemIds: number[]) {
  await prisma.assetProblem.deleteMany({ where: { assetId } })
  if (!problemIds.length) return
  await prisma.assetProblem.createMany({ data: problemIds.map((problemId) => ({ assetId, problemId })) })
}

export async function setAssetServices(assetId: number, serviceIds: number[]) {
  await prisma.assetService.deleteMany({ where: { assetId } })
  if (!serviceIds.length) return
  await prisma.assetService.createMany({ data: serviceIds.map((serviceId) => ({ assetId, serviceId })) })
}
