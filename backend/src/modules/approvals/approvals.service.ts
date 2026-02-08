import prisma from '../../prisma/client'

export async function createApproval(ticketId: number, approverId?: number) {
  return prisma.approval.create({
    data: {
      ticketId,
      approverId: approverId || null,
    },
  })
}

export async function listApprovalsByTicket(ticketId: number) {
  return prisma.approval.findMany({ where: { ticketId } })
}

export async function setApprovalStatus(approvalId: number, status: string, approverId?: number, comment?: string) {
  return prisma.approval.update({
    where: { id: approvalId },
    data: { status, approverId: approverId || undefined, comment, approvedAt: status === 'approved' ? new Date() : undefined },
  })
}
