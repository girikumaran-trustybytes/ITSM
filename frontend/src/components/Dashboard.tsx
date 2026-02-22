import React, { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import * as userService from '../modules/users/services/user.service'

export default function Dashboard() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showWidgetMenu, setShowWidgetMenu] = useState(false)
  const [visibleWidgets, setVisibleWidgets] = useState<Record<string, boolean>>({
    kpi: true,
    statusBreakdown: true,
    criticalOverdue: true,
    priorityMix: true,
    topAgents: true,
  })

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
    let pending = 0
    let dueToday = 0
    let overdue = 0
    tickets.forEach((t) => {
      const statusKey = String(t.status || 'Unknown')
      byStatus[statusKey] = (byStatus[statusKey] || 0) + 1
      const priorityKey = String(t.priority || 'Unspecified')
      byPriority[priorityKey] = (byPriority[priorityKey] || 0) + 1

      const lower = String(t.status || '').toLowerCase()
      if (lower.includes('pending')) pending += 1
      if (lower.includes('due')) dueToday += 1
      if (lower.includes('overdue') || lower.includes('breach')) overdue += 1
    })

    const open = tickets.filter((t) => {
      const s = String(t.status || '').toLowerCase()
      return s !== 'closed' && s !== 'resolved'
    }).length
    const withSupplier = tickets.filter((t) => String(t.status || '').toLowerCase().includes('supplier')).length
    const critical = tickets.filter((t) => {
      const p = String(t.priority || '').toLowerCase()
      return p.includes('critical') || p === 'p1'
    }).length
    const unassigned = tickets.filter((t) => !t.assigneeId).length

    return { total, open, withSupplier, byStatus, byPriority, pending, dueToday, overdue, critical, unassigned }
  }, [tickets])

  const assetStats = useMemo(() => {
    const total = assets.length
    const faulty = assets.filter((a) => {
      const s = String(a.status || '').toLowerCase()
      return s.includes('fault') || s.includes('repair')
    }).length
    return { total, faulty }
  }, [assets])

  const userStats = useMemo(() => ({ total: users.length }), [users])

  const criticalOverdueList = useMemo(() => {
    return tickets
      .filter((t) => {
        const priority = String(t.priority || '').toLowerCase()
        const status = String(t.status || '').toLowerCase()
        return priority.includes('critical') || priority === 'p1' || status.includes('overdue') || status.includes('breach')
      })
      .slice(0, 8)
  }, [tickets])

  const topAgents = useMemo(() => {
    const counts: Record<string, number> = {}
    tickets.forEach((t) => {
      const assignee = String(t?.assignee?.name || t?.assignee?.email || t?.assigneeId || 'Unassigned')
      counts[assignee] = (counts[assignee] || 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
  }, [tickets])

  const toggleWidget = (key: string) => {
    setVisibleWidgets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const openFullscreen = async () => {
    const el = document.documentElement as any
    if (!document.fullscreenElement && el?.requestFullscreen) await el.requestFullscreen()
    else if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen()
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
        </div>
        <div className="dashboard-content">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="dashboard-container grafana">
      <div className="dashboard-header grafana-header">
        <div>
          <h1>Overview</h1>
          <div className="dashboard-subtitle">Current status across tickets and assets</div>
        </div>
        <div className="dashboard-actions">
          <button className="dash-ghost" onClick={openFullscreen}>Enter full screen</button>
          <div className="dash-widget-menu-wrap">
            <button className="dash-ghost" onClick={() => setShowWidgetMenu((v) => !v)}>Edit widgets</button>
            {showWidgetMenu && (
              <div className="dash-widget-menu">
                {Object.entries({
                  kpi: 'KPI cards',
                  statusBreakdown: 'Status breakdown',
                  criticalOverdue: 'Critical/Overdue list',
                  priorityMix: 'Priority mix',
                  topAgents: 'Top agents',
                }).map(([key, label]) => (
                  <label key={key}>
                    <input type="checkbox" checked={Boolean(visibleWidgets[key])} onChange={() => toggleWidget(key)} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="dashboard-content">
        {error && <p className="error-message">{error}</p>}

        <div className="dashboard-status-strip">
          <div className="dashboard-status-card">
            <div className="dashboard-status-title">Ticket status</div>
            <div className="dashboard-status-items">
              <span><strong>{ticketStats.open}</strong> Open</span>
              <span><strong>{ticketStats.pending}</strong> Pending</span>
              <span><strong>{ticketStats.dueToday}</strong> Due today</span>
              <span><strong>{ticketStats.overdue}</strong> Overdue</span>
            </div>
          </div>
          <div className="dashboard-status-card">
            <div className="dashboard-status-title">Alert status</div>
            <div className="dashboard-status-items">
              <span><strong>{ticketStats.critical}</strong> Critical</span>
              <span><strong>{ticketStats.unassigned}</strong> Unassigned</span>
            </div>
          </div>
        </div>

        {visibleWidgets.kpi && (
          <div className="dash-top-cards">
            <div className="dash-metric">
              <div className="metric-label">Total Tickets</div>
              <div className="metric-value">{ticketStats.total}</div>
              <div className="metric-sub">All tickets</div>
            </div>
            <div className="dash-metric">
              <div className="metric-label">Open Tickets</div>
              <div className="metric-value">{ticketStats.open}</div>
              <div className="metric-sub">Unresolved</div>
            </div>
            <div className="dash-metric">
              <div className="metric-label">With Supplier</div>
              <div className="metric-value">{ticketStats.withSupplier}</div>
              <div className="metric-sub">External</div>
            </div>
            <div className="dash-metric">
              <div className="metric-label">Total Assets</div>
              <div className="metric-value">{assetStats.total}</div>
              <div className="metric-sub">Tracked items</div>
            </div>
            <div className="dash-metric">
              <div className="metric-label">Faulty Assets</div>
              <div className="metric-value">{assetStats.faulty}</div>
              <div className="metric-sub">Needs attention</div>
            </div>
            <div className="dash-metric">
              <div className="metric-label">Total Users</div>
              <div className="metric-value">{userStats.total}</div>
              <div className="metric-sub">Active directory</div>
            </div>
          </div>
        )}

        <div className="dash-panels">
          {visibleWidgets.statusBreakdown && (
            <div className="dash-panel">
              <div className="panel-head">
                <h2>Ticket Status Breakdown</h2>
                <span className="dash-pill">Total {ticketStats.total}</span>
              </div>
              <div className="dash-chart">
                <div className="stat-list">
                  {Object.entries(ticketStats.byStatus).map(([k, v]) => (
                    <div key={k} className="stat-row">
                      <span>{k}</span>
                      <span>{v}</span>
                    </div>
                  ))}
                  {Object.keys(ticketStats.byStatus).length === 0 && (
                    <div className="activity-empty">No ticket data</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {visibleWidgets.criticalOverdue && (
            <div className="dash-panel">
              <div className="panel-head">
                <h2>Critical and overdue tickets</h2>
                <span className="dash-pill">{criticalOverdueList.length} items</span>
              </div>
              <div className="dash-chart">
                <div className="stat-list">
                  {criticalOverdueList.length === 0 ? <div className="activity-empty">No critical or overdue tickets</div> : criticalOverdueList.map((t) => (
                    <div key={String(t.id || t.ticketId)} className="stat-row">
                      <span>{String(t.subject || t.ticketId || 'Untitled')}</span>
                      <span>{String(t.priority || t.status || '-')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {visibleWidgets.priorityMix && (
            <div className="dash-panel">
              <div className="panel-head">
                <h2>Tickets by Priority</h2>
                <span className="dash-pill">{Object.keys(ticketStats.byPriority).length} groups</span>
              </div>
              <div className="dash-chart">
                <div className="priority-grid">
                  {Object.entries(ticketStats.byPriority).map(([label, value]) => (
                    <div key={label} className="priority-row">
                      <span>{label}</span>
                      <div className="priority-bar">
                        <span style={{ width: `${Math.min(100, (value / Math.max(1, ticketStats.total)) * 100)}%` }} />
                      </div>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {visibleWidgets.topAgents && (
            <div className="dash-panel">
              <div className="panel-head">
                <h2>Support Leaderboard</h2>
                <span className="dash-pill">Top {topAgents.length}</span>
              </div>
              <div className="dash-chart">
                <div className="stat-list">
                  {topAgents.length === 0 ? <div className="activity-empty">No assignee data</div> : topAgents.map(([agent, count]) => (
                    <div key={agent} className="stat-row">
                      <span>{agent}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

