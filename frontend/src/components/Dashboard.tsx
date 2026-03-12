import React, { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import * as userService from '../services/user.service'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#3b82f6',
  medium: '#06b6d4',
  high: '#f59e0b',
  critical: '#ef4444',
  default: '#94a3b8',
}

const STATUS_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b', '#ef4444']
const TYPE_COLORS = ['#3b82f6', '#06b6d4', '#22c55e', '#f59e0b']
const TEAM_COLORS = ['#3b82f6', '#06b6d4', '#22c55e']

function normalizeKey(value: string) {
  return String(value || '').trim().toLowerCase()
}

function titleCase(value: string) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
}

function DonutChart({
  segments,
  size = 150,
  thickness = 32,
  centerLabel,
}: {
  segments: { label: string; value: number; color: string }[]
  size?: number
  thickness?: number
  centerLabel?: string
}) {
  const total = segments.reduce((acc, seg) => acc + seg.value, 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  const gap = 0
  let offset = 0

  return (
    <svg width={size} height={size} className="donut-chart" viewBox={`0 0 ${size} ${size}`}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#e2e8f0"
        strokeWidth={thickness}
      />
      {segments.map((seg) => {
        const length = total > 0 ? (seg.value / total) * circumference : 0
        const adjusted = Math.max(0, length - gap)
        const dasharray = `${adjusted} ${circumference - adjusted}`
        const dashoffset = -(offset + gap / 2)
        offset += length
        return (
          <circle
            key={seg.label}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth={thickness}
            strokeDasharray={dasharray}
            strokeDashoffset={dashoffset}
            strokeLinecap="butt"
          />
        )
      })}
      {centerLabel && (
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          className="donut-center-label"
        >
          {centerLabel}
        </text>
      )}
    </svg>
  )
}

function LegendList({ items }: { items: { label: string; value: number; color: string }[] }) {
  return (
    <div className="donut-legend">
      {items.map((item) => (
        <div key={item.label} className="donut-legend-row">
          <span className="legend-dot" style={{ background: item.color }} />
          <span className="legend-label">{item.label}</span>
          <span className="legend-value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function BarList({ items }: { items: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div key={item.label} className="bar-row">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track">
            <span
              className="bar-dot"
              style={{ background: item.color }}
              aria-hidden="true"
            />
            <span
              className="bar-fill"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                background: item.color,
              }}
            />
          </div>
          <span className="bar-value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}

function StackedBar({
  segments,
}: {
  segments: { label: string; value: number; color: string }[]
}) {
  const total = segments.reduce((acc, seg) => acc + seg.value, 0)
  return (
    <div className="stacked-bar-wrap" role="img" aria-label="Stacked distribution">
      <div className="stacked-bar">
        {segments.map((seg) => {
          const width = total > 0 ? (seg.value / total) * 100 : 0
          return (
            <span
              key={seg.label}
              className="stacked-bar-seg"
              style={{ width: `${width}%`, background: seg.color }}
              title={`${seg.label}: ${seg.value}`}
            />
          )
        })}
      </div>
      <div className="stacked-bar-total">Total {total}</div>
    </div>
  )
}

function ColoredBarList({ items }: { items: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="colored-bar-list">
      {items.map((item) => (
        <div key={item.label} className="colored-bar-row">
          <div className="colored-bar-label">{item.label}</div>
          <div className="colored-bar-track">
            <span
              className="colored-bar-fill"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                background: item.color,
              }}
            />
          </div>
          <div className="colored-bar-value">{item.value}</div>
        </div>
      ))}
    </div>
  )
}

function Heatmap({ items }: { items: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="heatmap">
      {items.map((item) => (
        <div
          key={item.label}
          className="heatmap-cell"
          style={{
            background: item.color,
            opacity: Math.max(0.25, item.value / maxValue),
          }}
        >
          <span>{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  )
}

function ColumnChart({ items }: { items: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="column-chart">
      {items.map((item) => (
        <div key={item.label} className="column-bar">
          <span
            className="column-bar-fill"
            style={{
              height: `${(item.value / maxValue) * 100}%`,
              background: item.color,
            }}
          />
          <span className="column-bar-value">{item.value}</span>
          <span className="column-bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  )
}

function Treemap({ items }: { items: { label: string; value: number; color: string }[] }) {
  const count = items.length
  return (
    <div className="treemap" role="img" aria-label="Ticket types distribution">
      {items.map((item) => {
        const weight = count > 0 ? 100 / count : 0
        return (
          <div key={item.label} className="treemap-cell" style={{ flexBasis: `${weight}%`, background: item.color }}>
            <div className="treemap-cell-inner">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          </div>
        )
      })}
    </div>
  )
}


export default function Dashboard() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [queues, setQueues] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true)
        const ticketsRes = await api.get('/tickets?pageSize=500')
        const ticketsData = ticketsRes.data
        const allTickets = ticketsData.items || []
        setTickets(allTickets)

        if (user?.role !== 'USER') {
          try {
            const assetsRes = await api.get('/assets?pageSize=500')
            const assetsData = assetsRes.data
            const allAssets = assetsData.items || []
            setAssets(allAssets)
          } catch {
            setAssets([])
          }
        } else {
          setAssets([])
        }

        try {
          const usersData = await userService.listUsers({ limit: 500 })
          setUsers(Array.isArray(usersData) ? usersData : [])
        } catch {
          setUsers([])
        }

        try {
          const queueData = await userService.listTicketQueues()
          setQueues(Array.isArray(queueData) ? queueData : [])
        } catch {
          setQueues([])
        }

        setError('')
      } catch (err: any) {
        console.error('Failed to fetch dashboard data:', err)
        setError('Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [user?.role])

  const ticketStats = useMemo(() => {
    const total = tickets.length
    const byStatus: Record<string, number> = {}
    const byPriority: Record<string, number> = {}
    const byType: Record<string, number> = {}

    let onHold = 0
    let overdue = 0
    let open = 0
    let withSupplier = 0
    let withUser = 0
    let unassigned = 0
    let watching = 0

    tickets.forEach((t) => {
      const rawStatus = String(t.status || 'Unknown')
      const statusLower = normalizeKey(rawStatus)
      const statusKey = statusLower === 'resolved' ? 'Closed' : titleCase(rawStatus)
      byStatus[statusKey] = (byStatus[statusKey] || 0) + 1

      const priorityKey = titleCase(String(t.priority || 'Unspecified'))
      byPriority[priorityKey] = (byPriority[priorityKey] || 0) + 1

      const typeKey = titleCase(String(t.type || t.category || 'Unknown'))
      byType[typeKey] = (byType[typeKey] || 0) + 1

      if (statusLower.includes('hold')) onHold += 1
      if (statusLower.includes('overdue') || statusLower.includes('breach')) overdue += 1

      const openState = !['closed', 'resolved'].includes(statusLower)
      if (openState) open += 1

      if (normalizeKey(t.status).includes('supplier')) withSupplier += 1

      const hasRequester = Boolean(t.requesterId || t.requester?.id || t.requester?.email || t.requesterEmail)
      if (hasRequester) withUser += 1

      if (!t.assigneeId && !t.assignee?.id && !t.assignee) unassigned += 1

      const watcherIds = Array.isArray(t.watchers) ? t.watchers : Array.isArray(t.watcherIds) ? t.watcherIds : []
      if (watcherIds.includes(user?.id)) watching += 1
    })

    return { total, open, onHold, overdue, unassigned, withSupplier, withUser, watching, byStatus, byPriority, byType }
  }, [tickets, user?.id])

  const teamStats = useMemo(() => {
    const coreTeams = [
      { label: 'Support Team', queueKey: 'support', color: TEAM_COLORS[0] },
      { label: 'HR Team', queueKey: 'hr', color: TEAM_COLORS[1] },
      { label: 'Management', queueKey: 'management', color: TEAM_COLORS[2] },
    ]

    const queueMap = new Map<string, string>()
    queues.forEach((queue) => {
      const key = normalizeKey(queue?.queue_key || queue?.queueKey || queue?.queue_id || queue?.queueId || queue?.queue_label || queue?.queueLabel)
      const label = String(queue?.queue_label || queue?.queueLabel || queue?.label || '').trim()
      if (key && label) queueMap.set(key, label)
    })

    const resolvedLabel = (ticket: any) => {
      const queueKey = normalizeKey(ticket.queue_key || ticket.queueKey || ticket.queue || ticket.queueName)
      const queueId = normalizeKey(ticket.queue_id || ticket.queueId)
      const queueLabel = String(ticket.queue_label || ticket.queueLabel || '').trim()
      if (queueLabel) return queueLabel
      if (queueKey && queueMap.has(queueKey)) return queueMap.get(queueKey) || ''
      if (queueId && queueMap.has(queueId)) return queueMap.get(queueId) || ''
      return ''
    }

    const counts = coreTeams.reduce<Record<string, number>>((acc, team) => {
      acc[team.label] = 0
      return acc
    }, {})

    tickets.forEach((ticket) => {
      const statusLower = normalizeKey(ticket.status)
      if (['closed', 'resolved'].includes(statusLower)) return
      const label = resolvedLabel(ticket)
      const match = coreTeams.find((team) => normalizeKey(team.label) === normalizeKey(label) || normalizeKey(team.queueKey) === normalizeKey(label))
      if (match) counts[match.label] += 1
    })

    const items = coreTeams.map((team) => ({
      label: team.label,
      value: counts[team.label] || 0,
      color: team.color,
    }))

    return items
  }, [tickets, queues])

  const assetStats = useMemo(() => {
    const total = assets.length
    const assigned = assets.filter((a) => a.assignedToId || a.assignedUserId || a.assignedTo || a.assigneeId || a.assignee).length
    const unassigned = assets.filter((a) => !(a.assignedToId || a.assignedUserId || a.assignedTo || a.assigneeId || a.assignee)).length
    const byType: Record<string, number> = {}
    assets.forEach((asset) => {
      const raw = asset.type || asset.assetType || asset.category || asset.assetCategory || 'Unknown'
      const label = titleCase(String(raw || 'Unknown'))
      byType[label] = (byType[label] || 0) + 1
    })

    const statusOrder = [
      'Assigned',
      'Unassigned',
      'In Stock',
      'Reserved',
      'Under Maintenance',
      'Faulty',
      'Damaged',
      'Lost',
      'Retired',
      'Decommissioned',
    ]
    const statusCounts = statusOrder.reduce<Record<string, number>>((acc, key) => {
      acc[key] = 0
      return acc
    }, {})
    assets.forEach((asset) => {
      const statusKey = titleCase(String(asset.status || ''))
      if (statusKey && statusKey in statusCounts) {
        statusCounts[statusKey] += 1
      }
    })
    statusCounts.Assigned = assigned
    statusCounts.Unassigned = unassigned
    const statusBreakdown = statusOrder.map((label, idx) => ({
      label,
      value: statusCounts[label] || 0,
      color: TYPE_COLORS[idx % TYPE_COLORS.length],
    }))

    const ownershipBreakdown = [
      { label: 'Company Owned', value: assets.filter((a) => normalizeKey(a.ownership || a.ownershipType || a.ownerType).includes('company')).length, color: '#3b82f6' },
      { label: 'Rental', value: assets.filter((a) => normalizeKey(a.ownership || a.ownershipType || a.ownerType).includes('rent')).length, color: '#06b6d4' },
    ]

    return { total, assigned, statusBreakdown, ownershipBreakdown, byType }
  }, [assets])

  const userStats = useMemo(() => {
    const total = users.length
    const employee = users.filter((u) => normalizeKey(u.type || u.userType || u.employmentType) === 'employee').length
    const interns = users.filter((u) => normalizeKey(u.type || u.userType || u.employmentType).includes('intern')).length

    const assignedUserIds = new Set(
      assets
        .map((a) => a.assignedToId || a.assignedUserId || a.assignedTo || a.assigneeId || a.assignee?.id)
        .filter(Boolean)
        .map(String)
    )

    const assignedUsers = assignedUserIds.size
    const unassignedUsers = Math.max(0, total - assignedUsers)

    return {
      total,
      employee,
      interns,
      assignedUsers,
      unassignedUsers,
    }
  }, [users, assets])

  const openTickets = useMemo(
    () => tickets.filter((t) => !['closed', 'resolved'].includes(normalizeKey(t.status))),
    [tickets]
  )

  const ticketRecency = useMemo(() => {
    const getTicketDate = (ticket: any) => {
      const raw =
        ticket?.createdAt ||
        ticket?.created_at ||
        ticket?.createdDate ||
        ticket?.dateCreated ||
        ticket?.createdOn ||
        ticket?.created_on
      if (!raw) return null
      const date = new Date(raw)
      if (Number.isNaN(date.getTime())) return null
      return date
    }

    const countRecent = (days: number, predicate: (ticket: any) => boolean) => {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
      let seenDate = false
      let count = 0
      tickets.forEach((ticket) => {
        const date = getTicketDate(ticket)
        if (!date) return
        seenDate = true
        if (date.getTime() >= cutoff && predicate(ticket)) count += 1
      })
      return seenDate ? count : null
    }

    const isOpen = (ticket: any) => !['closed', 'resolved'].includes(normalizeKey(ticket.status))
    const isOnHold = (ticket: any) => normalizeKey(ticket.status).includes('hold')
    const isOverdue = (ticket: any) => {
      const statusLower = normalizeKey(ticket.status)
      return statusLower.includes('overdue') || statusLower.includes('breach')
    }
    const isUnassigned = (ticket: any) => !ticket.assigneeId && !ticket.assignee?.id && !ticket.assignee
    const isSupplier = (ticket: any) => normalizeKey(ticket.status).includes('supplier')
    const hasRequester = (ticket: any) => Boolean(ticket.requesterId || ticket.requester?.id || ticket.requester?.email || ticket.requesterEmail)
    const isWatching = (ticket: any) => {
      const watcherIds = Array.isArray(ticket.watchers) ? ticket.watchers : Array.isArray(ticket.watcherIds) ? ticket.watcherIds : []
      return watcherIds.includes(user?.id)
    }

    return {
      totalWeek: countRecent(7, () => true),
      openToday: countRecent(1, isOpen),
      onHoldWeek: countRecent(7, isOnHold),
      overdueWeek: countRecent(7, isOverdue),
      unassignedWeek: countRecent(7, isUnassigned),
      withSupplierWeek: countRecent(7, isSupplier),
      withUserWeek: countRecent(7, hasRequester),
      watchingWeek: countRecent(7, isWatching),
    }
  }, [tickets, user?.id])

  const openPrioritySegments = useMemo(() => {
    const byPriority: Record<string, number> = {}
    openTickets.forEach((t) => {
      const key = titleCase(String(t.priority || 'Unspecified'))
      byPriority[key] = (byPriority[key] || 0) + 1
    })
    return Object.entries(byPriority).map(([label, value]) => {
      const key = normalizeKey(label)
      const tone = key.includes('critical') ? 'critical' : key.includes('high') ? 'high' : key.includes('medium') ? 'medium' : key.includes('low') ? 'low' : 'default'
      return { label, value, color: PRIORITY_COLORS[tone] || PRIORITY_COLORS.default }
    })
  }, [openTickets])

  const openTypeSegments = useMemo(() => {
    const byType: Record<string, number> = {}
    openTickets.forEach((t) => {
      const key = titleCase(String(t.type || t.category || 'Unknown'))
      byType[key] = (byType[key] || 0) + 1
    })
    return Object.entries(byType).map(([label, value], idx) => ({
      label,
      value,
      color: TYPE_COLORS[idx % TYPE_COLORS.length],
    }))
  }, [openTickets])

  const statusSegments = useMemo(() => {
    const order = ['New', 'In Progress', 'Awaiting Approval', 'Closed']
    const entries = Object.entries(ticketStats.byStatus)
    const ordered = [
      ...order.map((label) => [label, ticketStats.byStatus[label] || 0] as const).filter(([, value]) => value > 0),
      ...entries.filter(([label, value]) => !order.includes(label) && value > 0),
    ]
    return ordered.map(([label, value], idx) => ({
      label,
      value,
      color: STATUS_COLORS[idx % STATUS_COLORS.length],
    }))
  }, [ticketStats.byStatus])

  const typeSegments = useMemo(() => {
    return Object.entries(ticketStats.byType).map(([label, value], idx) => ({
      label,
      value,
      color: TYPE_COLORS[idx % TYPE_COLORS.length],
    }))
  }, [ticketStats.byType])


  if (loading) {
    return (
      <div className="dashboard-shell">
        <div className="dashboard-header"><h1>Dashboard</h1></div>
        <div className="dashboard-content"><p>Loading...</p></div>
      </div>
    )
  }

  return (
    <div className="dashboard-shell">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">Overview of tickets and assets</p>
        </div>
      </div>

      <div className="dashboard-content">
        {error && <p className="error-message">{error}</p>}

        <div className="dashboard-section">
          <div className="dashboard-section-title">Ticket Overview</div>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">Total Tickets</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H9l-4.5 3v-3H7a3 3 0 0 1-3-3V6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.totalWeek === null ? '--' : `+${ticketRecency.totalWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.total}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">Open Tickets</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M4 7a3 3 0 0 1 3-3h7l6 5v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                    <path d="M14 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.openToday === null ? '--' : `${ticketRecency.openToday} today`}</div>
                <div className="kpi-value">{ticketStats.open}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">Tickets On Hold</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M9 9v6M15 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.onHoldWeek === null ? '--' : `${ticketRecency.onHoldWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.onHold}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">Overdue Tickets</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M12 7.5v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.overdueWeek === null ? '--' : `${ticketRecency.overdueWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.overdue}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">Unassigned Tickets</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M5 19.5c1.8-3 11.2-3 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.unassignedWeek === null ? '--' : `${ticketRecency.unassignedWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.unassigned}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">With Supplier</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M5 19V6.5L12 4l7 2.5V19H5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                    <path d="M9 10h2M9 13h2M13 10h2M13 13h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.withSupplierWeek === null ? '--' : `${ticketRecency.withSupplierWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.withSupplier}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">With User</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
                    <path d="M2.5 19.5c1.7-3 10.3-3 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M17 7.5v4M15 9.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.withUserWeek === null ? '--' : `${ticketRecency.withUserWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.withUser}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-head">
                <div className="kpi-title">Tickets I'm Watching</div>
                <div className="kpi-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.6"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
                  </svg>
                </div>
              </div>
              <div className="kpi-body">
                <div className="kpi-trend">{ticketRecency.watchingWeek === null ? '--' : `${ticketRecency.watchingWeek} this week`}</div>
                <div className="kpi-value">{ticketStats.watching}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section-title">Ticket Analytics</div>
          <div className="panel-grid-3">
            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Ticket Status</h3>
              </div>
              <div className="panel-body">
                <DonutChart segments={statusSegments} thickness={28} />
                <LegendList items={statusSegments} />
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Open Tickets by Priority</h3>
              </div>
              <div className="panel-body">
                <ColoredBarList items={openPrioritySegments} />
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Open Tickets by Types</h3>
              </div>
              <div className="panel-body">
                <DonutChart segments={openTypeSegments} thickness={28} />
                <LegendList items={openTypeSegments} />
              </div>
            </div>

            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Open Tickets by Teams</h3>
              </div>
              <div className="panel-body">
                <BarList items={teamStats} />
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-section">
          <div className="dashboard-section-title">Assets &amp; Users</div>
          <div className="panel-grid-4">
            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Assets by Type</h3>
              </div>
              <div className="panel-body">
                <DonutChart
                  segments={Object.entries(assetStats.byType || {}).map(([label, value], idx) => ({
                    label,
                    value,
                    color: TYPE_COLORS[idx % TYPE_COLORS.length],
                  }))}
                  thickness={28}
                  centerLabel={`${assetStats.total}`}
                />
                <LegendList
                  items={Object.entries(assetStats.byType || {}).map(([label, value], idx) => ({
                    label,
                    value,
                    color: TYPE_COLORS[idx % TYPE_COLORS.length],
                  }))}
                />
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Asset Status</h3>
              </div>
              <div className="panel-body">
                <ColumnChart items={assetStats.statusBreakdown} />
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Ownership</h3>
              </div>
              <div className="panel-body">
                <Treemap items={assetStats.ownershipBreakdown} />
              </div>
            </div>
            <div className="panel-card">
              <div className="panel-head">
                <h3 className="panel-title">Users Summary</h3>
              </div>
              <div className="panel-body">
                <div className="users-summary-block">
                  <div className="users-summary-map">
                    <div className="users-summary-cell users-summary-total-cell">
                      <span>Total Users</span>
                      <strong>{userStats.total}</strong>
                    </div>
                    <div className="users-summary-cell users-summary-employee-cell">
                      <span>Employees</span>
                      <strong>{userStats.employee}</strong>
                    </div>
                    <div className="users-summary-cell users-summary-intern-cell">
                      <span>Interns</span>
                      <strong>{userStats.interns}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
