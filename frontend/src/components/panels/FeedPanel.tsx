import React from 'react'
import { listNotifications } from '../../services/notifications.service'
import { useAuth } from '../../contexts/AuthContext'

type FeedItem = {
  id: number
  ticketLabel: string
  title: string
  detail: string
  timeLabel: string
  author: string
  createdAtRaw: string
}

export const FEED_FILTERS = ['All Activity', 'My Activity', 'Today Activity'] as const
export type FeedFilter = (typeof FEED_FILTERS)[number]
const FEED_WINDOW_HOURS = 48

function toRelativeTime(value: string | undefined) {
  if (!value) return 'Just now'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`
  const hrs = Math.floor(min / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`
  return `${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) === 1 ? '' : 's'} ago`
}

function toTitle(action: string) {
  const key = String(action || '').trim().toLowerCase()
  if (key === 'create_ticket') return 'New Ticket Logged'
  if (key === 'add_history') return 'Internal Note'
  if (key === 'assign_asset') return 'Asset Assigned'
  if (key === 'unassign_asset') return 'Asset Unassigned'
  if (key === 'transition') return 'Ticket Status Updated'
  if (key === 'resolve') return 'Resolved'
  if (key === 'respond') return 'Mark As Responded'
  if (key === 'update_ticket') return 'Ticket Updated'
  if (key === 'delete_ticket') return 'Ticket Deleted'
  return String(action || 'Ticket Action')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function toDetail(item: any) {
  const action = String(item?.action || '').toLowerCase()
  if (action === 'add_history') return String(item?.meta?.note || '').trim() || 'Ticket note added.'
  if (action === 'transition') {
    const from = String(item?.meta?.from || '').trim()
    const to = String(item?.meta?.to || '').trim()
    return from || to ? `Status changed: ${from || '-'} -> ${to || '-'}` : 'Ticket status changed.'
  }
  if (action === 'assign_asset') return `Asset assigned${item?.meta?.assetId ? `: ${item.meta.assetId}` : ''}`
  if (action === 'respond') return String(item?.meta?.message || '').trim() || 'Response sent to requester.'
  if (action === 'resolve') return String(item?.meta?.resolution || '').trim() || 'Ticket resolved.'
  if (action === 'update_ticket') return 'Ticket details updated.'
  if (action === 'create_ticket') return String(item?.meta?.subject || '').trim() || 'Ticket created.'
  if (action === 'delete_ticket') return 'Ticket removed.'
  return ''
}

function toAuthor(userId: any) {
  const n = Number(userId)
  if (!Number.isFinite(n) || n <= 0) return 'SY'
  return `U${n}`
}

export default function FeedPanel({ filter }: { filter: FeedFilter }) {
  const { user } = useAuth()
  const [loading, setLoading] = React.useState(false)
  const [items, setItems] = React.useState<FeedItem[]>([])

  const loadFeed = React.useCallback(async () => {
    try {
      setLoading(true)
      const rows: any[] = await listNotifications({ limit: 300 })
      const cutoff = Date.now() - FEED_WINDOW_HOURS * 60 * 60 * 1000
      const now = new Date()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const dayEnd = dayStart + 24 * 60 * 60 * 1000
      const currentUserId = Number(user?.id)
      const mapped = (Array.isArray(rows) ? rows : [])
        .filter((row) => String(row?.entity || '').toLowerCase() === 'ticket')
        .filter((row) => {
          const createdAt = new Date(String(row?.createdAt || ''))
          return !Number.isNaN(createdAt.getTime()) && createdAt.getTime() >= cutoff
        })
        .filter((row) => {
          if (filter === 'My Activity') {
            return Number.isFinite(currentUserId) && Number(row?.userId) === currentUserId
          }
          if (filter === 'Today Activity') {
            const ts = new Date(String(row?.createdAt || '')).getTime()
            return Number.isFinite(ts) && ts >= dayStart && ts < dayEnd
          }
          return true
        })
        .sort((a, b) => new Date(String(b?.createdAt || 0)).getTime() - new Date(String(a?.createdAt || 0)).getTime())
        .map((row) => {
          const ticketRaw = String(row?.ticketId || row?.meta?.ticketId || '').trim()
          const ticketLabel = ticketRaw ? `#${ticketRaw.replace(/^TB#?/i, '')}` : '#-'
          return {
            id: Number(row?.id || 0),
            ticketLabel,
            title: toTitle(String(row?.action || '')),
            detail: toDetail(row),
            timeLabel: toRelativeTime(String(row?.createdAt || '')),
            author: toAuthor(row?.userId),
            createdAtRaw: String(row?.createdAt || ''),
          }
        })
      setItems(mapped)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [filter, user?.id])

  React.useEffect(() => {
    loadFeed()
    const timer = window.setInterval(loadFeed, 30000)
    return () => window.clearInterval(timer)
  }, [loadFeed])

  return (
    <div className="panel-feed">
      <div className="panel-list">
        {loading && items.length === 0 ? <div className="panel-empty">Loading feed...</div> : null}
        {!loading && items.length === 0 ? <div className="panel-empty">No ticket actions in last 48 hours.</div> : null}
        {items.map((item) => (
          <div key={`${item.id}-${item.createdAtRaw}`} className="panel-feed-card">
            <div className="panel-feed-avatar">{item.author}</div>
            <div className="panel-feed-body">
              <div className="panel-feed-title">
                <span className="panel-feed-id">{item.ticketLabel}</span> - {item.title}
              </div>
              {item.detail ? <div className="panel-feed-detail">{item.detail}</div> : null}
              <div className="panel-feed-time">{item.timeLabel}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
