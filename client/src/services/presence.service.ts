import api from './api'
import { normalizePresenceStatus, type PresenceStatus } from '../utils/presence'

export async function getMyPresence(): Promise<{ status: PresenceStatus }> {
  const res = await api.get('/users/me/presence')
  return { status: normalizePresenceStatus(res?.data?.status) }
}

export async function putMyPresence(status: PresenceStatus): Promise<{ status: PresenceStatus }> {
  const res = await api.put('/users/me/presence', { status })
  return { status: normalizePresenceStatus(res?.data?.status) }
}
