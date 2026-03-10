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

export async function sendUserInvite(id: number) {
  const res = await api.post(`/users/${id}/send-invite`)
  return res.data
}

export async function reinviteUser(id: number) {
  const res = await api.post(`/users/${id}/service-account/reinvite`)
  return res.data
}

export async function listTicketQueues() {
  const res = await api.get('/users/ticket-queues')
  return res.data
}

export async function createTicketQueue(payload: { label: string; queueKey?: string }) {
  const res = await api.post('/users/ticket-queues', payload)
  return res.data
}

export async function updateTicketQueue(id: number, payload: { label: string }) {
  const res = await api.patch(`/users/ticket-queues/${id}`, payload)
  return res.data
}

export async function deleteTicketQueue(id: number) {
  const res = await api.delete(`/users/ticket-queues/${id}`)
  return res.data
}
