import prisma from '../../prisma/client'
import { workflowEngine } from '../workflows/workflow.service'
import { auditLog } from '../../common/logger/logger'
import mailer from '../../services/mailer.service'

export const getTickets = async (opts: { page?: number; pageSize?: number; q?: string } = {}) => {
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 20
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { ticketId: { contains: opts.q } },
      { description: { contains: opts.q } },
      { category: { contains: opts.q } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { requester: true, assignee: true },
    }),
    prisma.ticket.count({ where }),
  ])

  return { items, total, page, pageSize }
}

export const getTicketById = async (id: string) => {
  const t = await prisma.ticket.findUnique({
    where: { ticketId: id },
    include: { attachments: true, history: true, requester: true, assignee: true },
  })
  return t
}

export const createTicket = async (payload: any, creator = 'system') => {
  const ticketId = `TKT-${Date.now()}`
  const created = await prisma.ticket.create({
    data: {
      ticketId,
      type: payload.type || 'Incident',
      priority: payload.priority || 'Low',
      impact: payload.impact || 'Low',
      urgency: payload.urgency || 'Low',
      status: payload.status || 'New',
      category: payload.category,
      subcategory: payload.subcategory,
      description: payload.description,
      requesterId: payload.requesterId,
      assigneeId: payload.assigneeId,
      slaStart: payload.slaStart ? new Date(payload.slaStart) : new Date(),
    },
  })

  await auditLog({
    action: 'create_ticket',
    ticketId: created.ticketId,
    user: creator,
    meta: { payload },
  })
  // notify requester if email available
  if (payload.requesterEmail) {
    await mailer.sendTicketCreated(payload.requesterEmail, created)
  }

  return created
}

export const transitionTicket = async (ticketId: string, toState: string, user = 'system') => {
  const t = await prisma.ticket.findUnique({ where: { ticketId } })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const can = workflowEngine.canTransition(t.type, t.status, toState)
  if (!can) throw { status: 400, message: `Invalid transition from ${t.status} to ${toState}` }

  const from = t.status
  const updated = await prisma.ticket.update({
    where: { ticketId },
    data: { status: toState },
  })

  await prisma.ticketHistory.create({
    data: {
      ticketId: t.id,
      fromStatus: from,
      toStatus: toState,
      changedById: typeof user === 'number' ? user : parseInt(String(user)) || undefined,
      note: '',
    },
  })
  await auditLog({
    action: 'transition',
    ticketId: updated.ticketId,
    user,
    meta: { from, to: toState },
  })
  // notify requester/assignee
  try {
    const requester = await prisma.user.findUnique({ where: { id: updated.requesterId || undefined } })
    const assignee = await prisma.user.findUnique({ where: { id: updated.assigneeId || undefined } })
    if (requester && requester.email) await mailer.sendStatusUpdated(requester.email, updated)
    if (assignee && assignee.email) await mailer.sendStatusUpdated(assignee.email, updated)
  } catch (e) {
    // swallow notification errors
    console.warn('Failed sending status update emails', e)
  }

  return updated
}
