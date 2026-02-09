import api from './api'

export async function listTickets(params: any = {}) {
  const res = await api.get('/tickets', { params })
  return res.data
}

export async function transitionTicket(id: string, to: string) {
  const res = await api.post(`/tickets/${encodeURIComponent(id)}/transition`, { to })
  return res.data
}

export async function createHistory(id: string, payload: { note: string }) {
  const res = await api.post(`/tickets/${encodeURIComponent(id)}/history`, payload)
  return res.data
}

export async function createTicket(payload: any) {
  const res = await api.post('/tickets', payload)
  return res.data
}

export async function getTicket(id: string) {
  const res = await api.get(`/tickets/${encodeURIComponent(id)}`)
  return res.data
}

export async function respond(id: string, payload: { message: string; sendEmail?: boolean }) {
  const res = await api.post(`/tickets/${encodeURIComponent(id)}/respond`, payload)
  return res.data
}

export async function privateNote(id: string, payload: { note: string }) {
  const res = await api.post(`/tickets/${encodeURIComponent(id)}/private-note`, payload)
  return res.data
}

export async function resolveTicketWithDetails(id: string, payload: { resolution: string; resolutionCategory?: string; sendEmail?: boolean }) {
  const res = await api.post(`/tickets/${encodeURIComponent(id)}/resolve`, payload)
  return res.data
}

export async function updateTicket(id: string, payload: any) {
  const res = await api.patch(`/tickets/${encodeURIComponent(id)}`, payload)
  return res.data
}

export async function deleteTicket(id: string) {
  const res = await api.delete(`/tickets/${encodeURIComponent(id)}`)
  return res.data
}

export async function assignAsset(id: string, assetId: number) {
  const res = await api.post(`/tickets/${encodeURIComponent(id)}/asset`, { assetId })
  return res.data
}

export async function unassignAsset(id: string) {
  const res = await api.delete(`/tickets/${encodeURIComponent(id)}/asset`)
  return res.data
}
