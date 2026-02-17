import api from './api'

export type RealtimeEvent = {
  id: number
  event_type: string
  entity_name: string
  entity_id: string | null
  operation: string
  business_key: string | null
  payload: any
  created_at: string
}

export async function pollRealtimeEvents(params: { sinceId?: number; limit?: number } = {}) {
  const res = await api.get('/events', { params })
  return res.data as { items: RealtimeEvent[]; nextCursor: number }
}

