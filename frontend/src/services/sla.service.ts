import api from './api'

export async function listSlaConfigs(params: { q?: string } = {}) {
  const res = await api.get('/sla', { params })
  return res.data
}

export async function createSlaConfig(payload: any) {
  const res = await api.post('/sla', payload)
  return res.data
}

export async function updateSlaConfig(id: number, payload: any) {
  const res = await api.patch(`/sla/${id}`, payload)
  return res.data
}

export async function deleteSlaConfig(id: number) {
  const res = await api.delete(`/sla/${id}`)
  return res.data
}
