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

// Simple seed (kept minimal and compatible with frontend demo values)
export const TICKETS_INITIAL: Ticket[] = [
  {
    id: '#002994',
    subject: 'PC stuck on Windows loading screen',
    type: 'Incident',
    status: 'New',
    priority: 'High',
    category: 'Hardware>Desktop',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    slaDue: null,
    comments: []
  }
]
