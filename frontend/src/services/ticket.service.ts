import api from './api'

export async function listTickets(params: any = {}) {
  const res = await api.get('/api/v1/tickets', { params })
  return res.data
}

export async function transitionTicket(id: string, to: string) {
  const res = await api.post(`/api/v1/tickets/${encodeURIComponent(id)}/transition`, { to })
  return res.data
}

export async function createTicket(payload: any) {
  const res = await api.post('/api/v1/tickets', payload)
  return res.data
}

export async function getTicket(id: string) {
  const res = await api.get(`/api/v1/tickets/${encodeURIComponent(id)}`)
  return res.data
}
