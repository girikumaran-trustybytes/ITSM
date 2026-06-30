import api from './api'

export type AnnouncementType = 'maintenance' | 'general'
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'expired'
export type AnnouncementRepeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'on_login'

export type Announcement = {
  id: number
  title: string
  body: string
  type: AnnouncementType
  status: AnnouncementStatus
  repeatInterval?: AnnouncementRepeat
  publishAt?: string | null
  expireAt?: string | null
  createdAt?: string
  updatedAt?: string
}

export async function listAnnouncements() {
  const res = await api.get('/announcements')
  return res.data
}

export async function createAnnouncement(payload: Partial<Announcement>) {
  const res = await api.post('/announcements', payload)
  return res.data
}

export async function updateAnnouncement(id: number, payload: Partial<Announcement>) {
  const res = await api.put(`/announcements/${id}`, payload)
  return res.data
}

export async function deleteAnnouncement(id: number) {
  const res = await api.delete(`/announcements/${id}`)
  return res.data
}

export async function repostAnnouncement(id: number) {
  const res = await api.post(`/announcements/${id}/repost`)
  return res.data
}
