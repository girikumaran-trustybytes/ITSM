import api from './api'

export async function listNotifications(params: { limit?: number } = {}) {
  const res = await api.get('/notifications', { params })
  return res.data
}

export async function getNotificationState() {
  const res = await api.get('/notifications/state')
  return res.data
}

export async function putNotificationState(state: { readIds: number[]; deletedIds: number[]; clearedAt?: number }) {
  const res = await api.put('/notifications/state', state)
  return res.data
}
