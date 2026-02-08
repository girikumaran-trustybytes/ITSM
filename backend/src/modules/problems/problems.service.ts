import prisma from '../../prisma/client'

export async function listProblems(opts: { q?: string } = {}) {
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { code: { contains: opts.q, mode: 'insensitive' } },
      { title: { contains: opts.q, mode: 'insensitive' } },
    ]
  }
  return prisma.problem.findMany({ where, orderBy: { createdAt: 'desc' } })
}

export async function getProblem(id: number) {
  return prisma.problem.findUnique({ where: { id } })
}

export async function createProblem(payload: any) {
  const code = String(payload.code || '').trim()
  const title = String(payload.title || '').trim()
  if (!code) throw { status: 400, message: 'Code is required' }
  if (!title) throw { status: 400, message: 'Title is required' }
  return prisma.problem.create({ data: { code, title, status: payload.status || null } })
}

export async function updateProblem(id: number, payload: any) {
  const data: any = {}
  if (payload.code !== undefined) data.code = String(payload.code).trim()
  if (payload.title !== undefined) data.title = String(payload.title).trim()
  if (payload.status !== undefined) data.status = payload.status
  try {
    return await prisma.problem.update({ where: { id }, data })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'Problem not found' }
    throw err
  }
}

export async function deleteProblem(id: number) {
  try {
    return await prisma.problem.delete({ where: { id } })
  } catch (err: any) {
    if (err?.code === 'P2025') throw { status: 404, message: 'Problem not found' }
    throw err
  }
}
