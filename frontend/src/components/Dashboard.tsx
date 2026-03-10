import React, { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import * as userService from '../services/user.service'

const PRIORITY_COLORS: Record<string, string> = {
  low: '#2563eb',
  high: '#0ea5e9',
  critical: '#22c55e',
  medium: '#f59e0b',
  default: '#94a3b8',
}

const STATUS_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444']
const TYPE_COLORS = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b']
const TEAM_COLORS = ['#2563eb', '#0ea5e9', '#22c55e']

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
      const statusKey = titleCase(String(t.status || 'Unknown'))
      byStatus[statusKey] = (byStatus[statusKey] || 0) + 1

      const priorityKey = titleCase(String(t.priority || 'Unspecified'))
      byPriority[priorityKey] = (byPriority[priorityKey] || 0) + 1

      const typeKey = titleCase(String(t.type || t.category || 'Unknown'))
      byType[typeKey] = (byType[typeKey] || 0) + 1

      const statusLower = normalizeKey(t.status)
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
    const faulty = assets.filter((a) => normalizeKey(a.status).includes('fault') || normalizeKey(a.status).includes('repair')).length
    const retired = assets.filter((a) => normalizeKey(a.status).includes('retire')).length
    const inStock = assets.filter((a) => normalizeKey(a.status).includes('stock')).length
    const unassigned = assets.filter((a) => !(a.assignedToId || a.assignedUserId || a.assignedTo || a.assigneeId || a.assignee)).length

    const statusBreakdown = [
      { label: 'Faulty', value: faulty, color: '#2563eb' },
      { label: 'Unassigned', value: unassigned, color: '#0ea5e9' },
      { label: 'Retired', value: retired, color: '#22c55e' },
      { label: 'In Stock', value: inStock, color: '#f59e0b' },
    ]

    const ownershipBreakdown = [
      { label: 'Company Owned', value: assets.filter((a) => normalizeKey(a.ownership || a.ownershipType || a.ownerType).includes('company')).length, color: '#2563eb' },
      { label: 'Rental', value: assets.filter((a) => normalizeKey(a.ownership || a.ownershipType || a.ownerType).includes('rent')).length, color: '#0ea5e9' },
    ]

    return { total, assigned, statusBreakdown, ownershipBreakdown }
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

  const statusSegments = useMemo(() => {
    return Object.entries(ticketStats.byStatus).map(([label, value], idx) => ({
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

        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-title">Total Tickets</div>
            <div className="kpi-value">{ticketStats.total}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v6.5a3 3 0 0 1-3 3H9l-4.5 3v-3H7a3 3 0 0 1-3-3V6.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Open Tickets</div>
            <div className="kpi-value">{ticketStats.open}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M4 7a3 3 0 0 1 3-3h7l6 5v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                <path d="M14 4v5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Tickets On Hold</div>
            <div className="kpi-value">{ticketStats.onHold}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M9 9v6M15 9v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Overdue Tickets</div>
            <div className="kpi-value">{ticketStats.overdue}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M12 7.5v5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Unassigned Tickets</div>
            <div className="kpi-value">{ticketStats.unassigned}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M5 19.5c1.8-3 11.2-3 14 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">With Supplier</div>
            <div className="kpi-value">{ticketStats.withSupplier}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M5 19V6.5L12 4l7 2.5V19H5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/>
                <path d="M9 10h2M9 13h2M13 10h2M13 13h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">With User</div>
            <div className="kpi-value">{ticketStats.withUser}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M2.5 19.5c1.7-3 10.3-3 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M17 7.5v4M15 9.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="kpi-card">
            <div className="kpi-title">Tickets I'm Watching</div>
            <div className="kpi-value">{ticketStats.watching}</div>
            <div className="kpi-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" stroke="currentColor" strokeWidth="1.6"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6"/>
              </svg>
            </div>
          </div>
        </div>

        <div className="panel-grid-4">
          <div className="panel-card">
            <h3 className="panel-title">Open Tickets by Priority</h3>
            <div className="panel-body">
              <DonutChart segments={openPrioritySegments} thickness={24} />
              <LegendList items={openPrioritySegments} />
            </div>
          </div>

          <div className="panel-card">
            <h3 className="panel-title">Tickets by Status</h3>
            <div className="panel-body">
              <DonutChart segments={statusSegments} thickness={24} />
              <LegendList items={statusSegments} />
            </div>
          </div>

          <div className="panel-card">
            <h3 className="panel-title">Tickets by Types</h3>
            <div className="panel-body">
              <BarList items={typeSegments} />
            </div>
          </div>

          <div className="panel-card">
            <h3 className="panel-title">Open Tickets by Team</h3>
            <div className="panel-body">
              <BarList items={teamStats} />
            </div>
          </div>
        </div>

        <div className="panel-grid-4">
          <div className="panel-card">
            <h3 className="panel-title">Assets</h3>
            <div className="panel-body">
              <DonutChart
                segments={[
                  { label: 'Assigned', value: assetStats.assigned, color: '#2563eb' },
                  { label: 'Unassigned', value: Math.max(0, assetStats.total - assetStats.assigned), color: '#0ea5e9' },
                  ...assetStats.statusBreakdown,
                ]}
                thickness={26}
                centerLabel={`${assetStats.total}`}
              />
              <LegendList
                items={[
                  { label: 'Total Assets', value: assetStats.total, color: '#111827' },
                  { label: 'Assigned', value: assetStats.assigned, color: '#2563eb' },
                  { label: 'Unassigned', value: Math.max(0, assetStats.total - assetStats.assigned), color: '#0ea5e9' },
                  ...assetStats.statusBreakdown,
                ]}
              />
            </div>
          </div>
          <div className="panel-card">
            <h3 className="panel-title">Total Users</h3>
            <div className="panel-body">
              <DonutChart
                segments={[
                  { label: 'Employee', value: userStats.employee, color: '#2563eb' },
                  { label: 'Interns', value: userStats.interns, color: '#0ea5e9' },
                ]}
                thickness={24}
              />
              <LegendList
                items={[
                  { label: 'Employee', value: userStats.employee, color: '#2563eb' },
                  { label: 'Interns', value: userStats.interns, color: '#0ea5e9' },
                ]}
              />
            </div>
          </div>

          <div className="panel-card">
            <h3 className="panel-title">Assigned Status</h3>
            <div className="panel-body">
              <DonutChart
                segments={[
                  { label: 'Assets Assigned Users', value: userStats.assignedUsers, color: '#2563eb' },
                  { label: 'Unassigned Users', value: userStats.unassignedUsers, color: '#0ea5e9' },
                ]}
                thickness={24}
              />
              <LegendList
                items={[
                  { label: 'Assets Assigned Users', value: userStats.assignedUsers, color: '#2563eb' },
                  { label: 'Unassigned Users', value: userStats.unassignedUsers, color: '#0ea5e9' },
                ]}
              />
            </div>
          </div>

          <div className="panel-card">
            <h3 className="panel-title">Ownership</h3>
            <div className="panel-body">
              <DonutChart segments={assetStats.ownershipBreakdown} thickness={24} />
              <LegendList items={assetStats.ownershipBreakdown} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
