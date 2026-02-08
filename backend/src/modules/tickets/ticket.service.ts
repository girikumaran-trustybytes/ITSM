import prisma from '../../prisma/client'
import { workflowEngine } from '../workflows/workflow.service'
import { auditLog } from '../../common/logger/logger'
import mailer from '../../services/mailer.service'

export const getTickets = async (opts: { page?: number; pageSize?: number; q?: string } = {}, viewer?: any) => {
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 20
  const where: any = {}
  if (opts.q) {
    where.OR = [
      { ticketId: { contains: opts.q } },
      { subject: { contains: opts.q } },
      { description: { contains: opts.q } },
      { category: { contains: opts.q } },
    ]
  }
  if (viewer?.role === 'USER' && viewer?.id) {
    where.requesterId = Number(viewer.id)
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

const isNumericId = (value: string) => /^\d+$/.test(value)

const resolveTicketWhere = (idOrTicketId: string) =>
  isNumericId(idOrTicketId) ? { id: Number(idOrTicketId) } : { ticketId: idOrTicketId }

export const getTicketById = async (id: string, viewer?: any) => {
  const t = await prisma.ticket.findUnique({
    where: resolveTicketWhere(id),
    include: { attachments: true, history: true, requester: true, assignee: true, asset: true },
  })
  if (t && viewer?.role === 'USER' && viewer?.id && t.requesterId !== Number(viewer.id)) {
    return null
  }
  return t
}

export const createTicket = async (payload: any, creator = 'system') => {
  const ticketId = `TKT-${Date.now()}`
  // auto-actions: compute priority from impact x urgency if not provided
  function computePriority(impact: string, urgency: string) {
    const map: Record<string, number> = { Low: 1, Medium: 2, High: 3 }
    const i = map[impact] || 1
    const u = map[urgency] || 1
    const score = i * u
    if (score >= 6) return 'High'
    if (score >= 2) return 'Medium'
    return 'Low'
  }

  function computeSlaBreachTime(start: Date, priority: string) {
    // simple SLA mapping (hours)
    const hoursByPriority: Record<string, number> = { High: 8, Medium: 24, Low: 72 }
    const hours = hoursByPriority[priority] || 24
    return new Date(start.getTime() + hours * 60 * 60 * 1000)
  }

  function autoCategoryFromText(text?: string) {
    if (!text) return undefined
    const t = text.toLowerCase()
    if (t.includes('battery') || t.includes('laptop') || t.includes('screen') || t.includes('keyboard')) return 'Hardware'
    if (t.includes('email') || t.includes('outlook') || t.includes('imap')) return 'Email'
    if (t.includes('network') || t.includes('vpn') || t.includes('wifi')) return 'Network'
    return undefined
  }

  const impact = payload.impact || 'Low'
  const urgency = payload.urgency || 'Low'
  const priority = payload.priority || computePriority(impact, urgency)
  const now = payload.slaStart ? new Date(payload.slaStart) : new Date()
  const category = payload.category || autoCategoryFromText(`${payload.description || ''} ${payload.summary || ''} ${payload.subject || ''}`)

  const data: any = {
    ticketId,
    subject: payload.subject || payload.summary || undefined,
    type: payload.type || 'Incident',
    priority,
    impact,
    urgency,
    status: payload.status || 'New',
    subcategory: payload.subcategory,
    description: payload.description,
    slaStart: now,
  }
  if (category) data.category = category
  if (payload.requesterId) data.requesterId = payload.requesterId
  if (payload.assigneeId) data.assigneeId = payload.assigneeId

  const created = await prisma.ticket.create({ data })

  // start SLA tracking record
  try {
    await prisma.slaTracking.create({ data: { ticketId: created.id, slaName: `${created.priority} SLA`, startTime: now, breachTime: computeSlaBreachTime(now, priority), status: 'running' } })
  } catch (e) {
    console.warn('Failed creating SLA tracking record', e)
  }

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
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const can = workflowEngine.canTransition(t.type, t.status, toState)
  if (!can) throw { status: 400, message: `Invalid transition from ${t.status} to ${toState}` }

  const from = t.status
  const updated = await prisma.ticket.update({
    where: resolveTicketWhere(ticketId),
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

export const createHistoryEntry = async (ticketId: string, opts: { note: string; user?: any }) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const created = await prisma.ticketHistory.create({
    data: {
      ticketId: t.id,
      fromStatus: t.status,
      toStatus: t.status,
      changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined,
      note: opts.note,
    },
  })

  await auditLog({
    action: 'add_history',
    ticketId: t.ticketId,
    user: opts.user,
    meta: { note: opts.note },
  })

  return created
}

export const addResponse = async (ticketId: string, opts: { message: string; user?: any; sendEmail?: boolean }) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const created = await prisma.ticketHistory.create({
    data: {
      ticketId: t.id,
      fromStatus: t.status,
      toStatus: t.status,
      changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined,
      note: opts.message,
      internal: false,
    },
  })

  await auditLog({ action: 'respond', ticketId: t.ticketId, user: opts.user, meta: { message: opts.message } })

  if (opts.sendEmail && t.requesterId) {
    const requester = await prisma.user.findUnique({ where: { id: t.requesterId } })
    if (requester?.email) await mailer.sendTicketResponse(requester.email, t, opts.message)
  }

  return created
}

export const addPrivateNote = async (ticketId: string, opts: { note: string; user?: any }) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const created = await prisma.ticketHistory.create({
    data: {
      ticketId: t.id,
      fromStatus: t.status,
      toStatus: t.status,
      changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined,
      note: opts.note,
      internal: true,
    },
  })

  await auditLog({ action: 'private_note', ticketId: t.ticketId, user: opts.user, meta: { note: opts.note } })
  return created
}

export const resolveTicketWithDetails = async (ticketId: string, opts: { resolution: string; resolutionCategory?: string; user?: any; sendEmail?: boolean }) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const from = t.status
  const updated = await prisma.ticket.update({
    where: resolveTicketWhere(ticketId),
    data: { status: 'Resolved', resolution: opts.resolution, resolutionCategory: opts.resolutionCategory || undefined, resolvedAt: new Date() },
  })

  await prisma.ticketStatusHistory.create({ data: { ticketId: t.id, oldStatus: from, newStatus: 'Resolved', changedById: typeof opts.user === 'number' ? opts.user : parseInt(String(opts.user)) || undefined } })

  await auditLog({ action: 'resolve', ticketId: updated.ticketId, user: opts.user, meta: { resolution: opts.resolution, resolutionCategory: opts.resolutionCategory } })

  if (opts.sendEmail && t.requesterId) {
    const requester = await prisma.user.findUnique({ where: { id: t.requesterId } })
    if (requester?.email) await mailer.sendTicketResolved(requester.email, updated)
  }

  return updated
}

export const updateTicket = async (ticketId: string, payload: any, user?: any) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const data: any = {}
  if (payload.subject !== undefined) data.subject = payload.subject
  if (payload.summary !== undefined && payload.subject === undefined) data.subject = payload.summary
  if (payload.description !== undefined) data.description = payload.description
  if (payload.type !== undefined) data.type = payload.type
  if (payload.priority !== undefined) data.priority = payload.priority
  if (payload.category !== undefined) data.category = payload.category
  if (payload.assigneeId !== undefined) data.assigneeId = payload.assigneeId || null
  if (payload.requesterId !== undefined) data.requesterId = payload.requesterId || null

  const updated = await prisma.ticket.update({ where: resolveTicketWhere(ticketId), data })

  await prisma.ticketHistory.create({ data: { ticketId: t.id, fromStatus: t.status, toStatus: updated.status, changedById: typeof user === 'number' ? user : parseInt(String(user)) || undefined, note: 'ticket updated' } })

  await auditLog({ action: 'update_ticket', ticketId: updated.ticketId, user, meta: { changes: data } })
  return updated
}

export const deleteTicket = async (ticketId: string, user?: any) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  // hard delete for now
  const deleted = await prisma.ticket.delete({ where: resolveTicketWhere(ticketId) })

  await prisma.ticketHistory.create({ data: { ticketId: t.id, fromStatus: t.status, toStatus: 'Deleted', changedById: typeof user === 'number' ? user : parseInt(String(user)) || undefined, note: 'deleted' } })

  await auditLog({ action: 'delete_ticket', ticketId: t.ticketId, user })
  return deleted
}

export const assignAsset = async (ticketId: string, assetId: number, user?: any) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }
  const asset = await prisma.asset.findUnique({ where: { id: assetId } })
  if (!asset) throw { status: 404, message: 'Asset not found' }

  const updated = await prisma.ticket.update({
    where: resolveTicketWhere(ticketId),
    data: { assetId: asset.id },
    include: { asset: true },
  })

  await auditLog({ action: 'assign_asset', ticketId: updated.ticketId, user, meta: { assetId: asset.id } })
  return updated
}

export const unassignAsset = async (ticketId: string, user?: any) => {
  const t = await prisma.ticket.findUnique({ where: resolveTicketWhere(ticketId) })
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const updated = await prisma.ticket.update({
    where: resolveTicketWhere(ticketId),
    data: { assetId: null },
    include: { asset: true },
  })

  await auditLog({ action: 'unassign_asset', ticketId: updated.ticketId, user })
  return updated
}
