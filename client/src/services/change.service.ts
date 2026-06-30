import api from './api'

export async function listChanges(params: { q?: string } = {}) {
  const res = await api.get('/changes', { params })
  return res.data
}
