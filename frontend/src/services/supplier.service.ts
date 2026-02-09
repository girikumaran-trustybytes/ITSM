import api from './api'

export async function listSuppliers(params: { q?: string } = {}) {
  const res = await api.get('/suppliers', { params })
  return res.data
}

export async function getSupplier(id: number) {
  const res = await api.get(`/suppliers/${id}`)
  return res.data
}

export async function createSupplier(payload: any) {
  const res = await api.post('/suppliers', payload)
  return res.data
}

export async function updateSupplier(id: number, payload: any) {
  const res = await api.put(`/suppliers/${id}`, payload)
  return res.data
}

export async function deleteSupplier(id: number) {
  const res = await api.delete(`/suppliers/${id}`)
  return res.data
}
