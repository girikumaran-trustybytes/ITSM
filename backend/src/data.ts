import prisma from './prisma/client'

export type Asset = {
  id: number
  name: string
  serial?: string
  category: string
  status: string
  vendor?: string
}

export async function getAssets() {
  return prisma.asset.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getAssetById(id: string) {
  return prisma.asset.findUnique({ where: { id: Number(id) } })
}
