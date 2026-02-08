import api from './api'

export async function listServices(params: { q?: string } = {}) {
  const res = await api.get('/v1/services', { params })
  return res.data
}
