import api from './api'

export async function listProblems(params: { q?: string } = {}) {
  const res = await api.get('/v1/problems', { params })
  return res.data
}
