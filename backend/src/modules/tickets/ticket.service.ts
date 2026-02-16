import { query, queryOne } from '../../db'
import { workflowEngine } from '../workflows/workflow.service'
import { auditLog } from '../../common/logger/logger'
import mailer from '../../services/mailer.service'

const isNumericId = (value: string) => /^\d+$/.test(value)

function buildTicketWhere(idOrTicketId: string, alias = 't', startIndex = 1) {
  if (isNumericId(idOrTicketId)) {
    return { clause: `${alias}."id" = $${startIndex}`, params: [Number(idOrTicketId)] }
  }
  return { clause: `${alias}."ticketId" = $${startIndex}`, params: [idOrTicketId] }
}

async function getTicketRecord(idOrTicketId: string) {
  const where = buildTicketWhere(idOrTicketId, 't', 1)
  return queryOne<any>(`SELECT * FROM "Ticket" t WHERE ${where.clause}`, where.params)
}

async function resolveChangedById(user: any): Promise<number | null> {
  const parsed = typeof user === 'number' ? user : parseInt(String(user), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  const exists = await queryOne<{ id: number }>('SELECT "id" FROM "User" WHERE "id" = $1', [parsed])
  return exists?.id ?? null
}

function buildInsert(table: string, data: Record<string, any>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined)
  const cols = keys.map((k) => `"${k}"`)
  const params = keys.map((_, i) => `$${i + 1}`)
  const values = keys.map((k) => data[k])
  const text = `INSERT INTO "${table}" (${cols.join(', ')}, "createdAt", "updatedAt") VALUES (${params.join(', ')}, NOW(), NOW()) RETURNING *`
  return { text, values }
}

async function getNextTicketTag(): Promise<string> {
  await query('CREATE SEQUENCE IF NOT EXISTS ticket_id_seq START 1')
  await query(
    `SELECT setval(
      'ticket_id_seq',
      GREATEST(
        (SELECT last_value FROM ticket_id_seq),
        (SELECT COALESCE(MAX((regexp_match("ticketId", '^TB#([0-9]+)$'))[1]::INTEGER), 0) FROM "Ticket")
      )
    )`
  )
  const row = await queryOne<{ next_id: string }>(
    `SELECT nextval('ticket_id_seq')::text AS next_id`
  )
  const num = Number(row?.next_id || 1)
  return `TB#${String(num).padStart(5, '0')}`
}

export const getTickets = async (opts: { page?: number; pageSize?: number; q?: string } = {}, viewer?: any) => {
  const page = opts.page ?? 1
  const pageSize = opts.pageSize ?? 20
  const conditions: string[] = []
  const params: any[] = []
  if (opts.q) {
    params.push(`%${opts.q}%`)
    conditions.push(`(t."ticketId" ILIKE $${params.length} OR t."subject" ILIKE $${params.length} OR t."description" ILIKE $${params.length} OR t."category" ILIKE $${params.length})`)
  }
  if (viewer?.role === 'USER' && viewer?.id) {
    params.push(Number(viewer.id))
    conditions.push(`t."requesterId" = $${params.length}`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const offset = (page - 1) * pageSize

  const [items, totalRow] = await Promise.all([
    query(
      `SELECT t.*, row_to_json(r) AS "requester", row_to_json(a) AS "assignee"
       FROM "Ticket" t
       LEFT JOIN "User" r ON r."id" = t."requesterId"
       LEFT JOIN "User" a ON a."id" = t."assigneeId"
       ${where}
       ORDER BY t."createdAt" DESC
       OFFSET $${params.length + 1}
       LIMIT $${params.length + 2}`,
      [...params, offset, pageSize]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "Ticket" t ${where}`,
      params
    ),
  ])

  const total = Number(totalRow?.count || 0)
  return { items, total, page, pageSize }
}

export const getTicketById = async (id: string, viewer?: any) => {
  const where = buildTicketWhere(id, 't', 1)
  const t = await queryOne<any>(
    `SELECT t.*, row_to_json(r) AS "requester", row_to_json(a) AS "assignee", row_to_json(asset) AS "asset"
     FROM "Ticket" t
     LEFT JOIN "User" r ON r."id" = t."requesterId"
     LEFT JOIN "User" a ON a."id" = t."assigneeId"
     LEFT JOIN "Asset" asset ON asset."id" = t."assetId"
     WHERE ${where.clause}`,
    where.params
  )
  if (t && viewer?.role === 'USER' && viewer?.id && t.requesterId !== Number(viewer.id)) {
    return null
  }
  if (!t) return null

  const [attachments, history] = await Promise.all([
    query('SELECT * FROM "Attachment" WHERE "ticketId" = $1', [t.id]),
    query('SELECT * FROM "TicketHistory" WHERE "ticketId" = $1', [t.id]),
  ])
  t.attachments = attachments
  t.history = history
  return t
}

export const createTicket = async (payload: any, creator = 'system') => {
  const ticketId = await getNextTicketTag()
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

  const { text, values } = buildInsert('Ticket', data)
  const createdRows = await query(text, values)
  const created = createdRows[0]

  // start SLA tracking record
  try {
    await query(
      'INSERT INTO "SlaTracking" ("ticketId", "slaName", "startTime", "breachTime", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, NOW(), NOW())',
      [created.id, `${created.priority} SLA`, now, computeSlaBreachTime(now, priority), 'running']
    )
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
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const can = workflowEngine.canTransition(t.type, t.status, toState)
  if (!can) throw { status: 400, message: `Invalid transition from ${t.status} to ${toState}` }

  const from = t.status
  const where = buildTicketWhere(ticketId, 't', 2)
  const updatedRows = await query(
    `UPDATE "Ticket" t SET "status" = $1, "updatedAt" = NOW() WHERE ${where.clause} RETURNING *`,
    [toState, ...where.params]
  )
  const updated = updatedRows[0]

  const changedById = await resolveChangedById(user)
  await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [
      t.id,
      from,
      toState,
      changedById,
      '',
      false,
    ]
  )
  await auditLog({
    action: 'transition',
    ticketId: updated.ticketId,
    user,
    meta: { from, to: toState },
  })
  // notify requester/assignee
  try {
    const requester = updated.requesterId ? await queryOne<any>('SELECT * FROM "User" WHERE "id" = $1', [updated.requesterId]) : null
    const assignee = updated.assigneeId ? await queryOne<any>('SELECT * FROM "User" WHERE "id" = $1', [updated.assigneeId]) : null
    if (requester && requester.email) await mailer.sendStatusUpdated(requester.email, updated)
    if (assignee && assignee.email) await mailer.sendStatusUpdated(assignee.email, updated)
  } catch (e) {
    // swallow notification errors
    console.warn('Failed sending status update emails', e)
  }

  return updated
}

export const createHistoryEntry = async (ticketId: string, opts: { note: string; user?: any }) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const changedById = await resolveChangedById(opts.user)
  const rows = await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      t.id,
      t.status,
      t.status,
      changedById,
      opts.note,
      false,
    ]
  )
  const created = rows[0]

  await auditLog({
    action: 'add_history',
    ticketId: t.ticketId,
    user: opts.user,
    meta: { note: opts.note },
  })

  return created
}

export const addResponse = async (
  ticketId: string,
  opts: { message: string; user?: any; sendEmail?: boolean; to?: string; cc?: string; bcc?: string; subject?: string }
) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const changedById = await resolveChangedById(opts.user)
  const rows = await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      t.id,
      t.status,
      t.status,
      changedById,
      opts.message,
      false,
    ]
  )
  const created = rows[0]

  await auditLog({ action: 'respond', ticketId: t.ticketId, user: opts.user, meta: { message: opts.message } })

  if (opts.sendEmail) {
    let targetEmail = String(opts.to || '').trim()
    if (!targetEmail && t.requesterId) {
      const requester = await queryOne<any>('SELECT * FROM "User" WHERE "id" = $1', [t.requesterId])
      targetEmail = String(requester?.email || '').trim()
    }
    if (!targetEmail) {
      throw { status: 400, message: 'Recipient email is required for sending response' }
    }
    await mailer.sendTicketResponseStrict(targetEmail, t, opts.message, opts.subject, opts.cc, opts.bcc)
  }

  return created
}

export const addPrivateNote = async (ticketId: string, opts: { note: string; user?: any }) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const changedById = await resolveChangedById(opts.user)
  const rows = await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      t.id,
      t.status,
      t.status,
      changedById,
      opts.note,
      true,
    ]
  )
  const created = rows[0]

  await auditLog({ action: 'private_note', ticketId: t.ticketId, user: opts.user, meta: { note: opts.note } })
  return created
}

export const resolveTicketWithDetails = async (ticketId: string, opts: { resolution: string; resolutionCategory?: string; user?: any; sendEmail?: boolean }) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const from = t.status
  const where = buildTicketWhere(ticketId, 't', 4)
  const updatedRows = await query(
    `UPDATE "Ticket" t SET "status" = $1, "resolution" = $2, "resolutionCategory" = $3, "resolvedAt" = NOW(), "updatedAt" = NOW() WHERE ${where.clause} RETURNING *`,
    [
      'Resolved',
      opts.resolution,
      opts.resolutionCategory || null,
      ...where.params,
    ]
  )
  const updated = updatedRows[0]

  const changedById = await resolveChangedById(opts.user)
  await query(
    'INSERT INTO "TicketStatusHistory" ("ticketId", "oldStatus", "newStatus", "changedById", "changedAt") VALUES ($1, $2, $3, $4, NOW())',
    [
      t.id,
      from,
      'Resolved',
      changedById,
    ]
  )

  await auditLog({ action: 'resolve', ticketId: updated.ticketId, user: opts.user, meta: { resolution: opts.resolution, resolutionCategory: opts.resolutionCategory } })

  if (opts.sendEmail && t.requesterId) {
    try {
      const requester = await queryOne<any>('SELECT * FROM "User" WHERE "id" = $1', [t.requesterId])
      if (requester?.email) await mailer.sendTicketResolved(requester.email, updated)
    } catch (e) {
      console.warn('Failed sending ticket resolved email', e)
    }
  }

  return updated
}

export const updateTicket = async (ticketId: string, payload: any, user?: any) => {
  const t = await getTicketRecord(ticketId)
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

  const setParts: string[] = []
  const params: any[] = []
  for (const [key, value] of Object.entries(data)) {
    params.push(value)
    setParts.push(`"${key}" = $${params.length}`)
  }
  setParts.push('"updatedAt" = NOW()')
  const where = buildTicketWhere(ticketId, 't', params.length + 1)
  const updatedRows = await query(
    `UPDATE "Ticket" t SET ${setParts.join(', ')} WHERE ${where.clause} RETURNING *`,
    [...params, ...where.params]
  )
  const updated = updatedRows[0]

  const changedById = await resolveChangedById(user)
  await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [
      t.id,
      t.status,
      updated.status,
      changedById,
      'ticket updated',
      false,
    ]
  )

  await auditLog({ action: 'update_ticket', ticketId: updated.ticketId, user, meta: { changes: data } })
  return updated
}

export const deleteTicket = async (ticketId: string, user?: any) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  // hard delete for now
  const where = buildTicketWhere(ticketId, 't', 1)
  const deletedRows = await query(`DELETE FROM "Ticket" t WHERE ${where.clause} RETURNING *`, where.params)
  const deleted = deletedRows[0]

  const changedById = await resolveChangedById(user)
  await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [
      t.id,
      t.status,
      'Deleted',
      changedById,
      'deleted',
      false,
    ]
  )

  await auditLog({ action: 'delete_ticket', ticketId: t.ticketId, user })
  return deleted
}

export const assignAsset = async (ticketId: string, assetId: number, user?: any) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }
  const asset = await queryOne<any>('SELECT * FROM "Asset" WHERE "id" = $1', [assetId])
  if (!asset) throw { status: 404, message: 'Asset not found' }

  const where = buildTicketWhere(ticketId, 't', 2)
  await query(
    `UPDATE "Ticket" t SET "assetId" = $1, "updatedAt" = NOW() WHERE ${where.clause}`,
    [asset.id, ...where.params]
  )

  const updated = await queryOne<any>(
    `SELECT t.*, row_to_json(a) AS "asset"
     FROM "Ticket" t
     LEFT JOIN "Asset" a ON a."id" = t."assetId"
     WHERE t."id" = $1`,
    [t.id]
  )

  await auditLog({ action: 'assign_asset', ticketId: updated.ticketId, user, meta: { assetId: asset.id } })
  return updated
}

export const unassignAsset = async (ticketId: string, user?: any) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const where = buildTicketWhere(ticketId, 't', 1)
  await query(
    `UPDATE "Ticket" t SET "assetId" = NULL, "updatedAt" = NOW() WHERE ${where.clause}`,
    where.params
  )

  const updated = await queryOne<any>(
    `SELECT t.*, row_to_json(a) AS "asset"
     FROM "Ticket" t
     LEFT JOIN "Asset" a ON a."id" = t."assetId"
     WHERE t."id" = $1`,
    [t.id]
  )

  await auditLog({ action: 'unassign_asset', ticketId: updated.ticketId, user })
  return updated
}
