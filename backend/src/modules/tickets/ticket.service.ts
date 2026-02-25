import { query, queryOne } from '../../db'
import { workflowEngine } from '../workflows/workflow.service'
import { auditLog } from '../../common/logger/logger'
import mailer from '../../services/mailer.service'
import fs from 'fs/promises'
import path from 'path'

const isNumericId = (value: string) => /^\d+$/.test(value)
const MAX_ATTACHMENT_SIZE_BYTES = 32 * 1024 * 1024
const MAX_ATTACHMENT_BATCH_BYTES = 32 * 1024 * 1024
const ATTACHMENT_BASE_DIR = path.resolve(process.cwd(), 'uploads', 'tickets')
let attachmentSchemaReady: Promise<void> | null = null
let slaSchemaReady: Promise<void> | null = null
let slaConfigSchemaReady: Promise<void> | null = null
let ticketOriginSchemaReady: Promise<void> | null = null

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

function normalizePriority(value: any) {
  const v = String(value || '').trim().toLowerCase()
  if (v === 'p1') return 'Critical'
  if (v === 'p2') return 'High'
  if (v === 'p3') return 'Medium'
  if (v === 'p4') return 'Low'
  if (v === 'critical') return 'Critical'
  if (v === 'high') return 'High'
  if (v === 'medium') return 'Medium'
  return 'Low'
}

function priorityRank(value: any) {
  const normalized = normalizePriority(value)
  if (normalized === 'Critical') return 1
  if (normalized === 'High') return 2
  if (normalized === 'Medium') return 3
  return 4
}

function formatSlaClock(ms: number) {
  const sign = ms < 0 ? '-' : ''
  const abs = Math.abs(ms)
  const totalMinutes = Math.floor(abs / 60000)
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return `${sign}${hh}:${mm}`
}

async function ensureSlaTrackingSchema() {
  if (!slaSchemaReady) {
    slaSchemaReady = (async () => {
      await query('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "responseTargetAt" TIMESTAMP(3)')
      await query('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "resolutionTargetAt" TIMESTAMP(3)')
      await query('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "firstRespondedAt" TIMESTAMP(3)')
      await query('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "firstRespondedById" INTEGER')
      await query('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3)')
      await query('ALTER TABLE "SlaTracking" ADD COLUMN IF NOT EXISTS "policyId" INTEGER')
    })()
  }
  await slaSchemaReady
}

async function ensureSlaConfigSchema() {
  if (!slaConfigSchemaReady) {
    slaConfigSchemaReady = (async () => {
      await query('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "priorityRank" INTEGER')
      await query('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "format" TEXT')
      await query('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "timeZone" TEXT')
      await query('ALTER TABLE "SlaConfig" ADD COLUMN IF NOT EXISTS "businessSchedule" JSONB')
    })()
  }
  await slaConfigSchemaReady
}

async function getSlaPolicyByPriority(priority: string) {
  await ensureSlaConfigSchema()
  const normalized = normalizePriority(priority)
  const rank = priorityRank(priority)
  const byPriority = await queryOne<any>(
    `SELECT *
     FROM "SlaConfig"
     WHERE "active" = TRUE
       AND (
         "priorityRank" = $1
         OR LOWER("priority") = LOWER($2)
       )
     ORDER BY "updatedAt" DESC
     LIMIT 1`,
    [rank, normalized]
  )
  if (byPriority) return byPriority
  const fallback = await queryOne<any>(
    `SELECT *
     FROM "SlaConfig"
     WHERE "active" = TRUE
     ORDER BY "updatedAt" DESC
     LIMIT 1`
  )
  return fallback
}

function fallbackSlaMinutes(priority: string) {
  const normalized = normalizePriority(priority)
  if (normalized === 'Critical') return { responseTimeMin: 15, resolutionTimeMin: 2 * 60 }
  if (normalized === 'High') return { responseTimeMin: 30, resolutionTimeMin: 4 * 60 }
  if (normalized === 'Medium') return { responseTimeMin: 60, resolutionTimeMin: 8 * 60 }
  return { responseTimeMin: 240, resolutionTimeMin: 24 * 60 }
}

const weekdayByShortName: Record<string, string> = {
  Sun: 'Sunday',
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
}

const timeFormatterByZone = new Map<string, Intl.DateTimeFormat>()

function getTimeFormatter(timeZone: string) {
  const key = String(timeZone || 'UTC')
  if (!timeFormatterByZone.has(key)) {
    timeFormatterByZone.set(
      key,
      new Intl.DateTimeFormat('en-US', {
        timeZone: key,
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    )
  }
  return timeFormatterByZone.get(key)!
}

function parseMinuteOfDay(value: any) {
  const text = String(value || '')
  const [hRaw, mRaw] = text.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

function isBusinessMinute(date: Date, timeZone: string, schedule: any) {
  const parts = getTimeFormatter(timeZone).formatToParts(date)
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value || 'Mon'
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || '0')
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || '0')
  const dayName = weekdayByShortName[weekdayShort] || 'Monday'
  const dayConfig = schedule?.[dayName]
  if (!dayConfig?.enabled) return false
  const currentMinute = hour * 60 + minute
  const slots = Array.isArray(dayConfig?.slots) ? dayConfig.slots : []
  return slots.some((slot: any) => {
    const start = parseMinuteOfDay(slot?.start)
    const end = parseMinuteOfDay(slot?.end)
    if (start === null || end === null || end <= start) return false
    return currentMinute >= start && currentMinute < end
  })
}

function addBusinessMinutes(start: Date, totalMinutes: number, timeZone: string, schedule: any) {
  let remaining = Math.max(0, Math.floor(totalMinutes))
  let cursor = new Date(start)
  let guard = 0
  while (remaining > 0 && guard < 2_000_000) {
    cursor = new Date(cursor.getTime() + 60 * 1000)
    if (isBusinessMinute(cursor, timeZone, schedule)) remaining -= 1
    guard += 1
  }
  return cursor
}

async function upsertSlaTrackingForTicket(ticket: any, options?: { keepFirstResponse?: boolean; keepResolvedAt?: boolean }) {
  await ensureSlaTrackingSchema()
  const policy = await getSlaPolicyByPriority(ticket.priority)
  const fallback = fallbackSlaMinutes(ticket.priority)
  const responseMin = Number(policy?.responseTimeMin ?? fallback.responseTimeMin)
  const resolutionMin = Number(policy?.resolutionTimeMin ?? fallback.resolutionTimeMin)
  const startTime = ticket.slaStart ? new Date(ticket.slaStart) : (ticket.createdAt ? new Date(ticket.createdAt) : new Date())
  const businessHoursEnabled = Boolean(policy?.businessHours)
  const businessTimeZone = String(policy?.timeZone || 'UTC')
  const businessSchedule = policy?.businessSchedule && typeof policy.businessSchedule === 'object' ? policy.businessSchedule : null
  const responseTargetAt = businessHoursEnabled && businessSchedule
    ? addBusinessMinutes(startTime, responseMin, businessTimeZone, businessSchedule)
    : new Date(startTime.getTime() + responseMin * 60 * 1000)
  const resolutionTargetAt = businessHoursEnabled && businessSchedule
    ? addBusinessMinutes(startTime, resolutionMin, businessTimeZone, businessSchedule)
    : new Date(startTime.getTime() + resolutionMin * 60 * 1000)
  const status = ['Resolved', 'Closed'].includes(String(ticket.status || '')) ? 'resolved' : 'running'
  await query(
    `INSERT INTO "SlaTracking" (
      "ticketId", "slaName", "startTime", "breachTime", "status", "policyId",
      "responseTargetAt", "resolutionTargetAt", "firstRespondedAt", "firstRespondedById", "resolvedAt", "createdAt", "updatedAt"
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL, NULL, NOW(), NOW())
    ON CONFLICT ("ticketId") DO UPDATE
    SET
      "slaName" = EXCLUDED."slaName",
      "startTime" = EXCLUDED."startTime",
      "breachTime" = EXCLUDED."breachTime",
      "status" = EXCLUDED."status",
      "policyId" = EXCLUDED."policyId",
      "responseTargetAt" = EXCLUDED."responseTargetAt",
      "resolutionTargetAt" = EXCLUDED."resolutionTargetAt",
      "firstRespondedAt" = CASE WHEN $9 THEN "SlaTracking"."firstRespondedAt" ELSE EXCLUDED."firstRespondedAt" END,
      "firstRespondedById" = CASE WHEN $9 THEN "SlaTracking"."firstRespondedById" ELSE EXCLUDED."firstRespondedById" END,
      "resolvedAt" = CASE WHEN $10 THEN "SlaTracking"."resolvedAt" ELSE EXCLUDED."resolvedAt" END,
      "updatedAt" = NOW()`,
    [
      ticket.id,
      policy?.name || `${normalizePriority(ticket.priority)} SLA`,
      startTime,
      resolutionTargetAt,
      status,
      policy?.id || null,
      responseTargetAt,
      resolutionTargetAt,
      Boolean(options?.keepFirstResponse),
      Boolean(options?.keepResolvedAt),
    ]
  )
}

function toIsoOrNull(value: any) {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function buildSlaSnapshot(ticket: any, tracking: any) {
  if (!tracking) return null
  const now = Date.now()
  const responseTargetMs = tracking.responseTargetAt ? new Date(tracking.responseTargetAt).getTime() : null
  const resolutionTargetMs = tracking.resolutionTargetAt ? new Date(tracking.resolutionTargetAt).getTime() : null
  const responseDone = Boolean(tracking.firstRespondedAt && tracking.firstRespondedById)
  const resolutionDone = Boolean(tracking.resolvedAt) || ['Resolved', 'Closed'].includes(String(ticket.status || ''))
  const responseCompletedMs = tracking.firstRespondedAt ? new Date(tracking.firstRespondedAt).getTime() : null
  const resolutionCompletedMs = tracking.resolvedAt
    ? new Date(tracking.resolvedAt).getTime()
    : ticket.resolvedAt
      ? new Date(ticket.resolvedAt).getTime()
      : null
  const responseRemainingMs = responseTargetMs === null ? null : responseTargetMs - now
  const resolutionRemainingMs = resolutionTargetMs === null ? null : resolutionTargetMs - now
  const responseBreached = responseDone
    ? responseTargetMs !== null && responseCompletedMs !== null && responseCompletedMs > responseTargetMs
    : responseRemainingMs !== null && responseRemainingMs < 0
  const resolutionBreached = resolutionDone
    ? resolutionTargetMs !== null && resolutionCompletedMs !== null && resolutionCompletedMs > resolutionTargetMs
    : resolutionRemainingMs !== null && resolutionRemainingMs < 0
  const responseStatus = responseDone ? (responseBreached ? 'MISSED' : 'MET') : 'RUNNING'
  const resolutionStatus = resolutionDone ? (resolutionBreached ? 'MISSED' : 'MET') : 'RUNNING'

  return {
    policyName: tracking.slaName || null,
    priority: normalizePriority(ticket.priority),
    responseSlaStatus: responseStatus,
    resolutionSlaStatus: resolutionStatus,
    response: {
      targetAt: toIsoOrNull(tracking.responseTargetAt),
      completedAt: toIsoOrNull(tracking.firstRespondedAt),
      completedById: tracking.firstRespondedById || null,
      breached: responseBreached,
      met: responseDone && !responseBreached,
      status: responseStatus,
      remainingMs: responseRemainingMs,
      remainingLabel: responseRemainingMs === null ? '--:--' : formatSlaClock(responseRemainingMs),
    },
    resolution: {
      targetAt: toIsoOrNull(tracking.resolutionTargetAt),
      completedAt: toIsoOrNull(tracking.resolvedAt || ticket.resolvedAt),
      breached: resolutionBreached,
      met: resolutionDone && !resolutionBreached,
      status: resolutionStatus,
      remainingMs: resolutionRemainingMs,
      remainingLabel: resolutionRemainingMs === null ? '--:--' : formatSlaClock(resolutionRemainingMs),
    },
    breached: responseBreached || resolutionBreached,
    state: resolutionDone ? 'resolved' : responseDone ? 'responded' : 'running',
  }
}

function deriveSlaTimeLeft(snapshot: any) {
  if (!snapshot) return '--:--'
  if (!snapshot?.response?.completedAt || !snapshot?.response?.completedById) {
    return snapshot?.response?.remainingLabel || '--:--'
  }
  return snapshot?.resolution?.remainingLabel || '--:--'
}

async function attachSlaData(items: any[]) {
  if (!Array.isArray(items) || items.length === 0) return items
  await ensureSlaTrackingSchema()
  const ids = items.map((t) => Number(t.id)).filter((id) => Number.isFinite(id))
  if (!ids.length) return items
  const rows = await query<any>(
    'SELECT * FROM "SlaTracking" WHERE "ticketId" = ANY($1::int[])',
    [ids]
  )
  const map = new Map<number, any>()
  rows.forEach((row) => map.set(Number(row.ticketId), row))
  items.forEach((ticket) => {
    const tracking = map.get(Number(ticket.id))
    const snapshot = buildSlaSnapshot(ticket, tracking)
    ;(ticket as any).sla = snapshot
    ;(ticket as any).slaTimeLeft = deriveSlaTimeLeft(snapshot)
  })
  return items
}

async function ensureAttachmentSchema() {
  if (!attachmentSchemaReady) {
    attachmentSchemaReady = (async () => {
      await query('ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "sizeBytes" INTEGER')
      await query('ALTER TABLE "Attachment" ADD COLUMN IF NOT EXISTS "contentType" TEXT')
    })()
  }
  await attachmentSchemaReady
}

async function ensureTicketOriginSchema() {
  if (!ticketOriginSchemaReady) {
    ticketOriginSchemaReady = (async () => {
      await query('ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "createdFrom" TEXT')
    })()
  }
  await ticketOriginSchemaReady
}

function sanitizeFilename(name: string) {
  return String(name || 'file').replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').slice(0, 180) || 'file'
}

function decodeBase64Payload(input: string) {
  const raw = String(input || '')
  const cleaned = raw.includes(',') ? raw.split(',').pop() || '' : raw
  return Buffer.from(cleaned, 'base64')
}

async function resolveChangedById(user: any): Promise<number | null> {
  const candidateIdRaw = (() => {
    if (typeof user === 'number' || typeof user === 'string') return user
    if (user && typeof user === 'object') return user.id ?? user.sub ?? user.userId ?? null
    return null
  })()
  const parsed = typeof candidateIdRaw === 'number' ? candidateIdRaw : parseInt(String(candidateIdRaw), 10)

  if (Number.isFinite(parsed) && parsed > 0) {
    // Primary path: auth id directly matches "User"."id"
    const direct = await queryOne<{ id: number }>('SELECT "id" FROM "User" WHERE "id" = $1', [parsed])
    if (direct?.id) return direct.id

    // Compatibility fallback: token subject may be "ServiceAccounts"."id"
    const serviceAccount = await queryOne<{ userId: number }>(
      'SELECT "userId" FROM "ServiceAccounts" WHERE "id" = $1 AND "enabled" = TRUE',
      [parsed]
    )
    if (serviceAccount?.userId) return serviceAccount.userId
  }

  // Fallback path when token subject is non-numeric (UUID/email-based providers).
  const rawEmail = typeof user === 'string'
    ? (String(user).includes('@') ? user : '')
    : (user && typeof user === 'object' ? String(user.email || '').trim() : '')
  if (rawEmail) {
    const byEmail = await queryOne<{ id: number }>(
      'SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1) LIMIT 1',
      [rawEmail]
    )
    if (byEmail?.id) return byEmail.id
  }

  return null
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
  await attachSlaData(items)

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
  const tracking = await queryOne<any>('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [t.id])
  t.attachments = attachments
  t.history = history
  t.sla = buildSlaSnapshot(t, tracking)
  t.slaTimeLeft = deriveSlaTimeLeft(t.sla)
  return t
}

export const createTicket = async (payload: any, creator = 'system') => {
  await ensureTicketOriginSchema()
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
    const hoursByPriority: Record<string, number> = { Critical: 4, High: 8, Medium: 24, Low: 72 }
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
    createdFrom: String(payload.createdFrom || '').trim() || 'ITSM Platform',
  }
  if (category) data.category = category
  if (payload.requesterId) data.requesterId = payload.requesterId
  if (payload.assigneeId) data.assigneeId = payload.assigneeId

  const { text, values } = buildInsert('Ticket', data)
  const createdRows = await query(text, values)
  const created = createdRows[0]

  // start SLA tracking record
  try {
    await upsertSlaTrackingForTicket(created)
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

  const tracking = await queryOne<any>('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [created.id])
  created.sla = buildSlaSnapshot(created, tracking)
  created.slaTimeLeft = deriveSlaTimeLeft(created.sla)
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
  if (['Resolved', 'Closed'].includes(String(toState || ''))) {
    await ensureSlaTrackingSchema()
    await query(
      'UPDATE "SlaTracking" SET "resolvedAt" = COALESCE("resolvedAt", NOW()), "status" = $1, "updatedAt" = NOW() WHERE "ticketId" = $2',
      ['resolved', t.id]
    )
  }

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
  const tracking = await queryOne<any>('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [updated.id])
  updated.sla = buildSlaSnapshot(updated, tracking)
  updated.slaTimeLeft = deriveSlaTimeLeft(updated.sla)
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

async function resolveAttachmentRows(ticketDbId: number, attachmentIds: number[] = []) {
  if (!attachmentIds.length) return []
  const unique = Array.from(new Set(attachmentIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (!unique.length) return []
  const rows = await query<any>(
    `SELECT * FROM "Attachment"
     WHERE "ticketId" = $1
       AND "id" = ANY($2::int[])`,
    [ticketDbId, unique]
  )
  if (rows.length !== unique.length) {
    throw { status: 400, message: 'One or more attachments are invalid for this ticket' }
  }
  return rows
}

function appendAttachmentSummary(text: string, rows: any[]) {
  if (!rows.length) return text
  const names = rows.map((r) => String(r.filename || `Attachment #${r.id}`)).join(', ')
  return `${text}\nAttachments: ${names}`
}

export const addResponse = async (
  ticketId: string,
  opts: { message: string; user?: any; sendEmail?: boolean; to?: string; cc?: string; bcc?: string; subject?: string; attachmentIds?: number[] }
) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }
  const attachmentRows = await resolveAttachmentRows(t.id, opts.attachmentIds || [])
  const messageWithAttachments = appendAttachmentSummary(opts.message, attachmentRows)
  const persistedMessage = opts.sendEmail
    ? `[EMAIL]\n${messageWithAttachments}`
    : messageWithAttachments

  const changedById = await resolveChangedById(opts.user)
  const rows = await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      t.id,
      t.status,
      t.status,
      changedById,
      persistedMessage,
      false,
    ]
  )
  const created = rows[0]

  await auditLog({
    action: 'respond',
    ticketId: t.ticketId,
    user: opts.user,
    meta: { message: opts.message, attachmentIds: attachmentRows.map((a) => a.id) },
  })

  if (opts.sendEmail) {
    let targetEmail = String(opts.to || '').trim()
    if (!targetEmail && t.requesterId) {
      const requester = await queryOne<any>('SELECT * FROM "User" WHERE "id" = $1', [t.requesterId])
      targetEmail = String(requester?.email || '').trim()
    }
    if (!targetEmail) {
      throw { status: 400, message: 'Recipient email is required for sending response' }
    }
    await mailer.sendTicketResponseStrict(
      targetEmail,
      t,
      messageWithAttachments,
      opts.subject,
      opts.cc,
      opts.bcc,
      attachmentRows.map((a: any) => ({
        filename: String(a.filename || `attachment-${a.id}`),
        path: String(a.path || ''),
        contentType: String(a.contentType || ''),
      }))
    )
  }

  return created
}

export const markResponseSlaMet = async (ticketId: string, user: any = 'system') => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const changedById = await resolveChangedById(user)
  const actorRole = String((user && typeof user === 'object' ? user.role : '') || '').trim().toUpperCase()
  const hasAgentPrivileges = actorRole === 'AGENT' || actorRole === 'ADMIN'
  const isInternalResponder = Boolean(changedById) && (
    hasAgentPrivileges ||
    !t.requesterId ||
    Number(changedById) !== Number(t.requesterId)
  )
  if (!isInternalResponder) {
    throw { status: 403, message: 'Only internal agent actions can mark response SLA' }
  }

  await ensureSlaTrackingSchema()
  await query(
    'UPDATE "SlaTracking" SET "firstRespondedAt" = COALESCE("firstRespondedAt", NOW()), "firstRespondedById" = COALESCE("firstRespondedById", $2), "status" = CASE WHEN "status" = \'resolved\' THEN "status" ELSE \'responded\' END, "updatedAt" = NOW() WHERE "ticketId" = $1',
    [t.id, changedById]
  )
  await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [t.id, t.status, t.status, changedById, 'Response SLA marked as responded', false]
  )
  await auditLog({
    action: 'mark_response_sla',
    ticketId: t.ticketId,
    user,
    meta: { changedById },
  })

  const updated = await getTicketRecord(ticketId)
  const tracking = updated ? await queryOne<any>('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [updated.id]) : null
  if (!updated) throw { status: 404, message: 'Ticket not found' }
  updated.sla = buildSlaSnapshot(updated, tracking)
  updated.slaTimeLeft = deriveSlaTimeLeft(updated.sla)
  return updated
}

export const addPrivateNote = async (ticketId: string, opts: { note: string; user?: any; attachmentIds?: number[] }) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }
  const attachmentRows = await resolveAttachmentRows(t.id, opts.attachmentIds || [])
  const noteWithAttachments = appendAttachmentSummary(opts.note, attachmentRows)

  const changedById = await resolveChangedById(opts.user)
  const rows = await query(
    'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING *',
    [
      t.id,
      t.status,
      t.status,
      changedById,
      noteWithAttachments,
      true,
    ]
  )
  const created = rows[0]

  await auditLog({
    action: 'private_note',
    ticketId: t.ticketId,
    user: opts.user,
    meta: { note: opts.note, attachmentIds: attachmentRows.map((a) => a.id) },
  })
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
  await ensureSlaTrackingSchema()
  await query(
    'UPDATE "SlaTracking" SET "resolvedAt" = NOW(), "status" = $1, "updatedAt" = NOW() WHERE "ticketId" = $2',
    ['resolved', t.id]
  )

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

export const uploadTicketAttachments = async (
  ticketId: string,
  opts: {
    files: Array<{ name: string; type?: string; size: number; contentBase64: string }>
    user?: any
    note?: string
    internal?: boolean
  }
) => {
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }
  await ensureAttachmentSchema()

  const files = Array.isArray(opts.files) ? opts.files : []
  if (!files.length) throw { status: 400, message: 'No files selected' }
  const totalDeclared = files.reduce((sum, f) => sum + Number(f?.size || 0), 0)
  if (totalDeclared > MAX_ATTACHMENT_BATCH_BYTES) {
    throw { status: 400, message: 'Total attachment size must be 32MB or less' }
  }

  const changedById = await resolveChangedById(opts.user)
  const ticketDir = path.join(ATTACHMENT_BASE_DIR, String(t.ticketId || t.id))
  await fs.mkdir(ticketDir, { recursive: true })

  const saved: any[] = []
  for (const file of files) {
    const declaredSize = Number(file?.size || 0)
    if (declaredSize <= 0) throw { status: 400, message: 'Attachment size is invalid' }
    if (declaredSize > MAX_ATTACHMENT_SIZE_BYTES) {
      throw { status: 400, message: `Attachment "${file?.name || 'file'}" exceeds 32MB` }
    }
    const binary = decodeBase64Payload(file.contentBase64)
    if (binary.length !== declaredSize) {
      throw { status: 400, message: `Attachment "${file?.name || 'file'}" is corrupted` }
    }
    const safe = sanitizeFilename(file.name)
    const storedName = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}-${safe}`
    const fullPath = path.join(ticketDir, storedName)
    await fs.writeFile(fullPath, binary)
    const created = await queryOne<any>(
      `INSERT INTO "Attachment" ("filename", "path", "ticketId", "uploadedById", "sizeBytes", "contentType", "createdAt")
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [safe, fullPath, t.id, changedById, declaredSize, String(file.type || '') || null]
    )
    if (created) saved.push(created)
  }

  if (opts.note && String(opts.note).trim()) {
    await query(
      'INSERT INTO "TicketHistory" ("ticketId", "fromStatus", "toStatus", "changedById", "note", "internal", "createdAt") VALUES ($1, $2, $3, $4, $5, $6, NOW())',
      [
        t.id,
        t.status,
        t.status,
        changedById,
        appendAttachmentSummary(String(opts.note).trim(), saved),
        Boolean(opts.internal),
      ]
    )
  }

  await auditLog({
    action: 'upload_attachments',
    ticketId: t.ticketId,
    user: opts.user,
    meta: { count: saved.length, names: saved.map((s) => s.filename) },
  })

  return {
    items: saved.map((row) => ({
      id: row.id,
      filename: row.filename,
      sizeBytes: row.sizeBytes ?? null,
      contentType: row.contentType ?? null,
      createdAt: row.createdAt,
    })),
  }
}

export const updateTicket = async (ticketId: string, payload: any, user?: any) => {
  await ensureTicketOriginSchema()
  const t = await getTicketRecord(ticketId)
  if (!t) throw { status: 404, message: 'Ticket not found' }

  const data: any = {}
  if (payload.subject !== undefined) data.subject = payload.subject
  if (payload.summary !== undefined && payload.subject === undefined) data.subject = payload.summary
  if (payload.description !== undefined) data.description = payload.description
  if (payload.type !== undefined) data.type = payload.type
  if (payload.priority !== undefined) data.priority = payload.priority
  if (payload.category !== undefined) data.category = payload.category
  if (payload.createdFrom !== undefined) data.createdFrom = payload.createdFrom
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
  if (payload.priority !== undefined || payload.slaStart !== undefined) {
    await upsertSlaTrackingForTicket(updated, { keepFirstResponse: true, keepResolvedAt: true })
  }

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
  const tracking = await queryOne<any>('SELECT * FROM "SlaTracking" WHERE "ticketId" = $1', [updated.id])
  updated.sla = buildSlaSnapshot(updated, tracking)
  updated.slaTimeLeft = deriveSlaTimeLeft(updated.sla)
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
