import api from './api'

export async function listSuppliers(params: { q?: string } = {}) {
  const res = await api.get('/v1/suppliers', { params })
  return res.data
}

export async function getSupplier(id: number) {
  const res = await api.get(`/v1/suppliers/${id}`)
  return res.data
}

export async function createSupplier(payload: any) {
  const res = await api.post('/v1/suppliers', payload)
  return res.data
}

export async function updateSupplier(id: number, payload: any) {
  const res = await api.put(`/v1/suppliers/${id}`, payload)
  return res.data
}

export async function deleteSupplier(id: number) {
  const res = await api.delete(`/v1/suppliers/${id}`)
  return res.data
}
