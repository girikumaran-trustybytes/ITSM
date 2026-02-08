import api from './api'

export async function listChanges(params: { q?: string } = {}) {
  const res = await api.get('/v1/changes', { params })
  return res.data
}
