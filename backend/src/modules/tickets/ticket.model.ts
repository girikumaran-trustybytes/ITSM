export interface Ticket {
  id: string
  subject: string
  type: string
  status: string
  priority: string
  category?: string
  createdAt: string
  updatedAt: string
  slaDue?: string | null
  comments?: { author: string; text: string; time: string }[]
}
