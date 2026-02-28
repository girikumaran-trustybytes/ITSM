import api from './api'

export async function listUsers(params: { q?: string; limit?: number; role?: string } = {}) {
  const res = await api.get('/users', { params })
  return res.data
}

export async function getUser(id: number) {
  const res = await api.get(`/users/${id}`)
  return res.data
}

export async function createUser(payload: any) {
  const res = await api.post('/users', payload)
  return res.data
}

export async function updateUser(id: number, payload: any) {
  const res = await api.patch(`/users/${id}`, payload)
  return res.data
}

export async function deleteUser(id: number) {
  const res = await api.delete(`/users/${id}`)
  return res.data
}
