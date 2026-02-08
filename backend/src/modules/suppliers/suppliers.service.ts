import prisma from '../../prisma/client'

export const createSupplier = async (data: any) => {
  return prisma.supplier.create({ data })
}

export const updateSupplier = async (id: number, data: any) => {
  return prisma.supplier.update({ where: { id }, data })
}

export const getSupplier = async (id: number) => {
  return prisma.supplier.findUnique({ where: { id } })
}

export const listSuppliers = async (opts: { q?: string } = {}) => {
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { companyName: { contains: opts.q, mode: 'insensitive' } },
      { contactName: { contains: opts.q, mode: 'insensitive' } },
      { contactEmail: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  return prisma.supplier.findMany({ where, orderBy: { companyName: 'asc' } })
}

export const deleteSupplier = async (id: number) => {
  return prisma.supplier.delete({ where: { id } })
}
