import api from './api'

export async function listNotifications(params: { limit?: number } = {}) {
  const res = await api.get('/notifications', { params })
  return res.data
}
