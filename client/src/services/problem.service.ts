import api from './api'

export async function listProblems(params: { q?: string } = {}) {
  const res = await api.get('/problems', { params })
  return res.data
}
