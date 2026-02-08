import prisma from '../../prisma/client'

export async function createTask(ticketId: number, name: string, assignedToId?: number) {
  return prisma.task.create({ data: { ticketId, name, assignedToId: assignedToId || null } })
}

export async function listTasksByTicket(ticketId: number) {
  return prisma.task.findMany({ where: { ticketId } })
}

export async function updateTaskStatus(taskId: number, status: string) {
  return prisma.task.update({ where: { id: taskId }, data: { status, completedAt: status === 'completed' ? new Date() : undefined } })
}
