import api from './api'

export async function listServices(params: { q?: string } = {}) {
  const res = await api.get('/services', { params })
  return res.data
}
