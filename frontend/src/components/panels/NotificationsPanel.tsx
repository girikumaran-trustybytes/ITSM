import React from 'react'
import { getNotificationState as fetchNotificationState, listNotifications as fetchNotifications, putNotificationState as saveNotificationStateRemote } from '../../services/notifications.service'
import { useAuth } from '../../contexts/AuthContext'
import { loadNotificationState, saveNotificationState, type NotificationState } from '../../utils/notificationsState'

type NotificationRow = {
  id: number
  action?: string
  entity?: string
  entityId?: number | null
  userId?: number | null
  ticketId?: string | null
  meta?: any
  createdAt?: string
}

function toNotificationId(value: any): number | null {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

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
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function toMessage(item: NotificationRow) {
  const action = String(item.action || '').toLowerCase()
  const entity = String(item.entity || '').toLowerCase()
  const ticketId = String(item.ticketId || item.meta?.ticketId || '')
  const ticketLabel = ticketId ? `Ticket ${ticketId}` : 'Ticket'

  if (entity === 'ticket') {
    if (action.includes('create')) return { title: `New ticket logged`, sub: ticketLabel }
    if (action.includes('transition')) return { title: `${ticketLabel} status updated`, sub: `Action: ${item.action}` }
    if (action.includes('resolve')) return { title: `${ticketLabel} resolved`, sub: `Action: ${item.action}` }
    if (action.includes('delete')) return { title: `${ticketLabel} deleted`, sub: `Action: ${item.action}` }
    return { title: `${ticketLabel} updated`, sub: `Action: ${item.action}` }
  }

  if (entity === 'sla') {
    return { title: `Maintenance / SLA policy update`, sub: `Action: ${item.action}` }
  }
  if (entity === 'asset') {
    return { title: `Asset updated`, sub: `Action: ${item.action}` }
  }
  if (entity === 'change' || entity === 'problem' || entity === 'service' || entity === 'supplier') {
    return { title: `${entity[0].toUpperCase()}${entity.slice(1)} updated`, sub: `Action: ${item.action}` }
  }
  return { title: `System notification`, sub: `Action: ${item.action || 'update'}` }
}

export default function NotificationsPanel() {
  const { user } = useAuth()
  const [items, setItems] = React.useState<NotificationRow[]>([])
  const [busy, setBusy] = React.useState(false)
  const [state, setState] = React.useState<NotificationState>({ readIds: [], deletedIds: [], clearedAt: undefined })
  const hydratedRef = React.useRef(false)

  const load = React.useCallback(async () => {
    try {
      setBusy(true)
      const data = await fetchNotifications({ limit: 120 })
      setItems(Array.isArray(data) ? data : [])
    } finally {
      setBusy(false)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    hydratedRef.current = false
    const hydrate = async () => {
      const local = loadNotificationState(user)
      let next = local
      try {
        if (user) {
          const remote = await fetchNotificationState()
          next = {
            readIds: Array.isArray(remote?.readIds) ? remote.readIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0) : [],
            deletedIds: Array.isArray(remote?.deletedIds) ? remote.deletedIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v) && v > 0) : [],
            clearedAt: Number.isFinite(Number(remote?.clearedAt)) ? Number(remote.clearedAt) : undefined,
          }
        }
      } catch {
        // local cache remains source of truth if API state call fails
      }
      if (cancelled) return
      setState(next)
      saveNotificationState(user, next)
      hydratedRef.current = true
      window.dispatchEvent(new CustomEvent('notifications-state-changed'))
    }
    hydrate()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  React.useEffect(() => {
    if (!hydratedRef.current) return
    saveNotificationState(user, state)
    if (user) {
      saveNotificationStateRemote(state).catch(() => undefined)
    }
    window.dispatchEvent(new CustomEvent('notifications-state-changed'))
  }, [state, user])

  React.useEffect(() => {
    load()
    const timer = window.setInterval(load, 30000)
    return () => window.clearInterval(timer)
  }, [load])

  const visible = items.filter((n) => {
    const id = toNotificationId(n.id)
    if (!id) return false
    if (state.deletedIds.includes(id)) return false
    if (!state.clearedAt) return true
    const createdMs = n.createdAt ? new Date(n.createdAt).getTime() : 0
    return !Number.isFinite(createdMs) || createdMs > state.clearedAt
  })

  const markRead = (id: number) => {
    setState((prev) => ({
      ...prev,
      readIds: prev.readIds.includes(id) ? prev.readIds : [...prev.readIds, id],
    }))
  }

  const deleteOne = (id: number) => {
    setState((prev) => ({
      ...prev,
      deletedIds: prev.deletedIds.includes(id) ? prev.deletedIds : [...prev.deletedIds, id],
      readIds: prev.readIds.includes(id) ? prev.readIds : [...prev.readIds, id],
    }))
  }

  const markAllRead = React.useCallback(() => {
    const ids = visible.map((v) => toNotificationId(v.id)).filter((v): v is number => Boolean(v))
    setState((prev) => ({ ...prev, readIds: Array.from(new Set([...prev.readIds, ...ids])) }))
  }, [visible])

  const deleteAll = React.useCallback(() => {
    const ids = visible.map((v) => toNotificationId(v.id)).filter((v): v is number => Boolean(v))
    setState((prev) => ({
      ...prev,
      deletedIds: Array.from(new Set([...prev.deletedIds, ...ids])),
      readIds: Array.from(new Set([...prev.readIds, ...ids])),
      clearedAt: Date.now(),
    }))
  }, [visible])

  React.useEffect(() => {
    const onMarkAll = () => markAllRead()
    const onDeleteAll = () => deleteAll()
    window.addEventListener('notifications-mark-all-read', onMarkAll as EventListener)
    window.addEventListener('notifications-delete-all', onDeleteAll as EventListener)
    return () => {
      window.removeEventListener('notifications-mark-all-read', onMarkAll as EventListener)
      window.removeEventListener('notifications-delete-all', onDeleteAll as EventListener)
    }
  }, [markAllRead, deleteAll])

  return (
    <div className="panel-notifications">
      <div className="panel-list">
        {busy && visible.length === 0 ? <div className="panel-empty">Loading notifications...</div> : null}
        {!busy && visible.length === 0 ? <div className="panel-empty">No notifications</div> : null}
        {visible.map((item) => {
          const id = toNotificationId(item.id)
          if (!id) return null
          const isRead = state.readIds.includes(id)
          const message = toMessage(item)
          return (
            <div key={id} className={`panel-card${isRead ? ' panel-card-read' : ''}`}>
              <div className="panel-card-time">{toRelativeTime(item.createdAt)}</div>
              <div className="panel-card-title">{message.title}</div>
              <div className="panel-card-sub">{message.sub}</div>
              <div className="panel-card-actions">
                <button className="panel-card-btn" onClick={() => markRead(id)} disabled={isRead}>
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {isRead ? 'Read' : 'Mark read'}
                </button>
                <button className="panel-card-btn panel-card-btn-danger" onClick={() => deleteOne(id)}>
                  <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 5 }}>
                    <path d="M3 6h18" />
                    <path d="M8 6V4h8v2" />
                    <path d="M19 6l-1 14H6L5 6" />
                  </svg>
                  Delete
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
