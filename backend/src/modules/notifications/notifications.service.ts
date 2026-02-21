import { query } from '../../db'

type Viewer = { id?: string | number; role?: string } | null | undefined
export type NotificationState = {
  readIds: number[]
  deletedIds: number[]
  clearedAt?: number
}

let ensureStateTablePromise: Promise<void> | null = null

async function ensureNotificationStateTable() {
  if (!ensureStateTablePromise) {
    ensureStateTablePromise = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS "NotificationState" (
          "userId" INTEGER PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          "readIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "deletedIds" JSONB NOT NULL DEFAULT '[]'::jsonb,
          "clearedAt" TIMESTAMP(3),
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
    })().catch((err) => {
      ensureStateTablePromise = null
      throw err
    })
  }
  await ensureStateTablePromise
}

function normalizeIds(value: any): number[] {
  if (!Array.isArray(value)) return []
  return Array.from(
    new Set(
      value
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v > 0)
    )
  ).slice(0, 5000)
}

function normalizeState(input: any): NotificationState {
  const clearedAtNum = Number(input?.clearedAt)
  const clearedAt = Number.isFinite(clearedAtNum) && clearedAtNum > 0 ? clearedAtNum : undefined
  return {
    readIds: normalizeIds(input?.readIds),
    deletedIds: normalizeIds(input?.deletedIds),
    clearedAt,
  }
}

function getViewerId(viewer: Viewer): number | null {
  const viewerId = Number(viewer?.id)
  if (!Number.isFinite(viewerId) || viewerId <= 0) return null
  return viewerId
}

export async function listNotifications(viewer: Viewer, opts: { limit?: number } = {}) {
  const role = String(viewer?.role || 'USER').toUpperCase()
  const limit = Math.min(Math.max(Number(opts.limit || 100), 1), 200)
  const viewerId = Number(viewer?.id)
  const params: any[] = []
  const conditions: string[] = []

  if (role === 'ADMIN') {
    conditions.push('1=1')
  } else if (role === 'AGENT') {
    params.push(['ticket', 'asset', 'change', 'problem', 'service', 'supplier', 'sla', 'system'])
    conditions.push(`a."entity" = ANY($${params.length}::text[])`)
  } else {
    if (!Number.isFinite(viewerId) || viewerId <= 0) return []
    params.push(viewerId)
    const userParam = `$${params.length}`
    conditions.push(`(
      (a."entity" = 'ticket' AND (t."requesterId" = ${userParam} OR a."userId" = ${userParam}))
      OR a."userId" = ${userParam}
    )`)
  }

  params.push(limit)
  const rows = await query(
    `SELECT
      a."id",
      a."action",
      a."entity",
      a."entityId",
      a."userId",
      a."meta",
      a."createdAt",
      (a."meta"->>'ticketId') AS "ticketId"
     FROM "AuditLog" a
     LEFT JOIN "Ticket" t ON t."ticketId" = (a."meta"->>'ticketId')
     WHERE ${conditions.join(' AND ')}
     ORDER BY a."createdAt" DESC
     LIMIT $${params.length}`,
    params
  )

  return rows
}

export async function getNotificationState(viewer: Viewer): Promise<NotificationState> {
  const viewerId = getViewerId(viewer)
  if (!viewerId) return { readIds: [], deletedIds: [], clearedAt: undefined }
  await ensureNotificationStateTable()
  const rows = await query(
    `SELECT
      "readIds",
      "deletedIds",
      CAST(EXTRACT(EPOCH FROM "clearedAt") * 1000 AS BIGINT) AS "clearedAtMs"
     FROM "NotificationState"
     WHERE "userId" = $1
     LIMIT 1`,
    [viewerId]
  )
  const row = rows[0] as any
  if (!row) return { readIds: [], deletedIds: [], clearedAt: undefined }
  return normalizeState({
    readIds: row.readIds,
    deletedIds: row.deletedIds,
    clearedAt: row.clearedAtMs,
  })
}

export async function saveNotificationState(viewer: Viewer, input: NotificationState): Promise<NotificationState> {
  const viewerId = getViewerId(viewer)
  const normalized = normalizeState(input)
  if (!viewerId) return normalized
  await ensureNotificationStateTable()
  await query(
    `INSERT INTO "NotificationState" ("userId", "readIds", "deletedIds", "clearedAt", "updatedAt")
     VALUES (
      $1,
      to_jsonb($2::int[]),
      to_jsonb($3::int[]),
      CASE WHEN $4::bigint > 0 THEN to_timestamp($4::double precision / 1000.0) ELSE NULL END,
      CURRENT_TIMESTAMP
     )
     ON CONFLICT ("userId")
     DO UPDATE SET
      "readIds" = EXCLUDED."readIds",
      "deletedIds" = EXCLUDED."deletedIds",
      "clearedAt" = EXCLUDED."clearedAt",
      "updatedAt" = CURRENT_TIMESTAMP`,
    [viewerId, normalized.readIds, normalized.deletedIds, normalized.clearedAt || null]
  )
  return normalized
}
