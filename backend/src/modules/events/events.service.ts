import { query } from '../../db'

export type AppEventRow = {
  id: number
  event_type: string
  entity_name: string
  entity_id: string | null
  operation: string
  business_key: string | null
  payload: any
  created_at: string
}

export async function listEvents(opts: { sinceId?: number; limit?: number } = {}) {
  const sinceId = Number(opts.sinceId || 0)
  const limit = Math.max(1, Math.min(500, Number(opts.limit || 100)))
  return query<AppEventRow>(
    `SELECT id, event_type, entity_name, entity_id, operation, business_key, payload, created_at
     FROM app_event_outbox
     WHERE id > $1
     ORDER BY id ASC
     LIMIT $2`,
    [sinceId, limit]
  )
}

