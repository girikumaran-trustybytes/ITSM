import React, { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { AlertTriangle, CheckCircle2, Package, UserMinus, Wrench, BadgeCheck } from 'lucide-react'

export default function Dashboard() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
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
          } catch (e) {
            setAssets([])
          }
        } else {
          setAssets([])
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
    tickets.forEach((t) => {
      const key = (t.status || 'Unknown').toString()
      byStatus[key] = (byStatus[key] || 0) + 1
    })
    const open = tickets.filter((t) => {
      const s = (t.status || '').toLowerCase()
      return s !== 'closed' && s !== 'resolved'
    }).length
    const withSupplier = tickets.filter((t) => {
      const s = (t.status || '').toLowerCase()
      return s.includes('supplier')
    }).length
    const closed = tickets.filter((t) => (t.status || '').toLowerCase() === 'closed').length
    return { total, open, withSupplier, closed, byStatus }
  }, [tickets])

  const assetStats = useMemo(() => {
    const total = assets.length
    const byType: Record<string, number> = {}
    assets.forEach((a) => {
      const key = (a.assetType || a.category || 'Unknown').toString()
      byType[key] = (byType[key] || 0) + 1
    })
    const faulty = assets.filter((a) => {
      const s = (a.status || '').toLowerCase()
      return s.includes('fault') || s.includes('repair')
    }).length
    const unassigned = assets.filter((a) => !a.assignedToId).length
    const inUse = assets.filter((a) => (a.status || '').toLowerCase() === 'in use').length
    const available = assets.filter((a) => (a.status || '').toLowerCase() === 'available').length
    const retired = assets.filter((a) => (a.status || '').toLowerCase() === 'retired').length
    return { total, byType, faulty, unassigned, inUse, available, retired }
  }, [assets])

  const priorityStats = useMemo(() => {
    const byPriority: Record<string, number> = {}
    tickets.forEach((t) => {
      const key = (t.priority || 'Unspecified').toString()
      byPriority[key] = (byPriority[key] || 0) + 1
    })
    return byPriority
  }, [tickets])

  const recentTickets = useMemo(() => {
    return [...tickets]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 5)
  }, [tickets])

  const getTicketDate = (t: any) => t.createdAt || t.dateReported || t.created || t.created_on
  const getAssetDate = (a: any) => a.createdAt || a.purchaseDate || a.updatedAt

  const dailySeries = useMemo(() => {
    const days = 7
    const today = new Date()
    const labels: string[] = []
    const keys: string[] = []
    const counts = new Array(days).fill(0)

    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      d.setHours(0, 0, 0, 0)
      const key = d.toISOString().slice(0, 10)
      keys.push(key)
      labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
    }

    const indexByKey = new Map(keys.map((k, idx) => [k, idx]))
    tickets.forEach((t) => {
      const raw = getTicketDate(t)
      if (!raw) return
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return
      const key = d.toISOString().slice(0, 10)
      const idx = indexByKey.get(key)
      if (idx !== undefined) counts[idx] += 1
    })

    const max = Math.max(1, ...counts)
    return { labels, counts, max }
  }, [tickets])

  const weeklySeries = useMemo(() => {
    const weeks = 6
    const today = new Date()
    const labels: string[] = []
    const keys: string[] = []
    const counts = new Array(weeks).fill(0)

    const startOfWeek = (date: Date) => {
      const d = new Date(date)
      const day = d.getDay()
      const diff = (day + 6) % 7
      d.setDate(d.getDate() - diff)
      d.setHours(0, 0, 0, 0)
      return d
    }

    const base = startOfWeek(today)
    for (let i = weeks - 1; i >= 0; i -= 1) {
      const d = new Date(base)
      d.setDate(base.getDate() - i * 7)
      const key = d.toISOString().slice(0, 10)
      keys.push(key)
      labels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
    }

    const indexByKey = new Map(keys.map((k, idx) => [k, idx]))
    tickets.forEach((t) => {
      const raw = getTicketDate(t)
      if (!raw) return
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return
      const wk = startOfWeek(d)
      const key = wk.toISOString().slice(0, 10)
      const idx = indexByKey.get(key)
      if (idx !== undefined) counts[idx] += 1
    })

    const max = Math.max(1, ...counts)
    return { labels, counts, max }
  }, [tickets])

  const topClients = useMemo(() => {
    const map: Record<string, number> = {}
    tickets.forEach((t) => {
      const name =
        t.client?.name ||
        t.clientName ||
        t.company?.name ||
        t.accountName ||
        t.account?.name ||
        'Unknown'
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [tickets])

  const topCategories = useMemo(() => {
    const map: Record<string, number> = {}
    tickets.forEach((t) => {
      const cat = t.category || t.type || t.subCategory || 'Uncategorized'
      map[cat] = (map[cat] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [tickets])

  const agentWorkload = useMemo(() => {
    const map: Record<string, number> = {}
    tickets.forEach((t) => {
      const name =
        t.assignedTo?.name ||
        t.assignee?.name ||
        t.assignedAgentName ||
        t.assignedToName ||
        'Unassigned'
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [tickets])

  const queueDistribution = useMemo(() => {
    const map: Record<string, number> = {}
    tickets.forEach((t) => {
      const name =
        t.queue?.name ||
        t.team?.name ||
        t.group?.name ||
        t.queueName ||
        t.teamName ||
        'General'
      map[name] = (map[name] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [tickets])

  const assetTrend = useMemo(() => {
    const months = 6
    const labels: string[] = []
    const keys: string[] = []
    const series = {
      inUse: new Array(months).fill(0),
      available: new Array(months).fill(0),
      retired: new Array(months).fill(0),
    }

    const today = new Date()
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      keys.push(key)
      labels.push(d.toLocaleDateString(undefined, { month: 'short' }))
    }

    const indexByKey = new Map(keys.map((k, idx) => [k, idx]))
    assets.forEach((a) => {
      const raw = getAssetDate(a)
      if (!raw) return
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const idx = indexByKey.get(key)
      if (idx === undefined) return
      const status = (a.status || '').toLowerCase()
      if (status === 'in use') series.inUse[idx] += 1
      else if (status === 'available') series.available[idx] += 1
      else if (status === 'retired') series.retired[idx] += 1
    })

    const totals = labels.map((_, idx) => series.inUse[idx] + series.available[idx] + series.retired[idx])
    const max = Math.max(1, ...totals)
    return { labels, series, max }
  }, [assets])

  const incidentFeed = useMemo(() => {
    return [...tickets]
      .filter((t) => {
        const s = (t.status || '').toLowerCase()
        return s !== 'closed' && s !== 'resolved'
      })
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 8)
  }, [tickets])

  const formatShort = (value?: string) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString()
  }

  const priorityTone = (value?: string) => {
    const v = (value || '').toLowerCase()
    if (v.includes('urgent') || v.includes('high')) return 'high'
    if (v.includes('medium')) return 'medium'
    return 'low'
  }

  const buildDonutSegments = (parts: { value: number; color: string }[]) => {
    const total = parts.reduce((sum, p) => sum + p.value, 0) || 1
    const radius = 42
    const circumference = 2 * Math.PI * radius
    let offset = 0
    return parts.map((p) => {
      const length = (p.value / total) * circumference
      const segment = {
        color: p.color,
        dasharray: `${length} ${circumference - length}`,
        dashoffset: -offset,
      }
      offset += length
      return segment
    })
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
          <h1>Operational Overview</h1>
          <div className="dashboard-subtitle">Current status across tickets and assets</div>
        </div>
              </div>

      <div className="dashboard-content">
        {error && <p className="error-message">{error}</p>}

        <div className="dash-top-cards">
          <div className="dash-metric">
            <div className="metric-label">Total Tickets</div>
            <div className="metric-value">{ticketStats.total}</div>
            <div className="metric-sub">Open {ticketStats.open}</div>
          </div>
          <div className="dash-metric">
            <div className="metric-label">Closed Today</div>
            <div className="metric-value">{ticketStats.closed}</div>
            <div className="metric-sub">With Supplier {ticketStats.withSupplier}</div>
          </div>
          <div className="dash-metric">
            <div className="metric-label">Assets In Use</div>
            <div className="metric-value">{assetStats.inUse}</div>
            <div className="metric-sub">Unassigned {assetStats.unassigned}</div>
          </div>
          <div className="dash-metric">
            <div className="metric-label">Faulty Assets</div>
            <div className="metric-value">{assetStats.faulty}</div>
            <div className="metric-sub">Retired {assetStats.retired}</div>
          </div>
        </div>

        <div className="dash-panels">
          <div className="dash-panel">
            <div className="panel-head">
              <h2>Ticket Health</h2>
              <span className="dash-pill">Total {ticketStats.total}</span>
            </div>
            <div className="donut-wrap">
              <div className="donut">
                <svg viewBox="0 0 120 120" role="img" aria-label="Ticket status distribution">
                  <circle cx="60" cy="60" r="42" stroke="#e5e7eb" strokeWidth="16" fill="none" />
                  {buildDonutSegments([
                    { value: ticketStats.open, color: '#f97316' },
                    { value: ticketStats.withSupplier, color: '#6366f1' },
                    { value: ticketStats.closed, color: '#10b981' },
                  ]).map((seg, idx) => (
                    <circle
                      key={`ticket-${idx}`}
                      cx="60"
                      cy="60"
                      r="42"
                      stroke={seg.color}
                      strokeWidth="16"
                      fill="none"
                      strokeDasharray={seg.dasharray}
                      strokeDashoffset={seg.dashoffset}
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
              </div>
              <div className="donut-legend">
                <div className="donut-item">
                  <span className="dot dot-open" />
                  <span>Open</span>
                  <strong>{ticketStats.open}</strong>
                </div>
                <div className="donut-item">
                  <span className="dot dot-supplier" />
                  <span>With Supplier</span>
                  <strong>{ticketStats.withSupplier}</strong>
                </div>
                <div className="donut-item">
                  <span className="dot dot-closed" />
                  <span>Closed</span>
                  <strong>{ticketStats.closed}</strong>
                </div>
              </div>
            </div>
            <div className="dash-kpis">
              <div className="dash-kpi">
                <div className="kpi-icon kpi-open"><AlertTriangle size={18} /></div>
                <div>
                  <div className="kpi-label">Open</div>
                  <div className="kpi-value">{ticketStats.open}</div>
                </div>
              </div>
              <div className="dash-kpi">
                <div className="kpi-icon kpi-supplier"><Package size={18} /></div>
                <div>
                  <div className="kpi-label">With Supplier</div>
                  <div className="kpi-value">{ticketStats.withSupplier}</div>
                </div>
              </div>
              <div className="dash-kpi">
                <div className="kpi-icon kpi-closed"><CheckCircle2 size={18} /></div>
                <div>
                  <div className="kpi-label">Closed</div>
                  <div className="kpi-value">{ticketStats.closed}</div>
                </div>
              </div>
            </div>
            <div className="dash-chart">
              <div className="chart-title">Status Breakdown</div>
              <div className="stat-list">
                {Object.entries(ticketStats.byStatus).map(([k, v]) => (
                  <div key={k} className="stat-row">
                    <span>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="panel-head">
              <h2>Asset Health</h2>
              <span className="dash-pill">Total {assetStats.total}</span>
            </div>
            <div className="donut-wrap">
              <div className="donut">
                <svg viewBox="0 0 120 120" role="img" aria-label="Asset lifecycle distribution">
                  <circle cx="60" cy="60" r="42" stroke="#e5e7eb" strokeWidth="16" fill="none" />
                  {buildDonutSegments([
                    { value: assetStats.inUse, color: '#22c55e' },
                    { value: assetStats.available, color: '#60a5fa' },
                    { value: assetStats.retired, color: '#f97316' },
                  ]).map((seg, idx) => (
                    <circle
                      key={`asset-${idx}`}
                      cx="60"
                      cy="60"
                      r="42"
                      stroke={seg.color}
                      strokeWidth="16"
                      fill="none"
                      strokeDasharray={seg.dasharray}
                      strokeDashoffset={seg.dashoffset}
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
              </div>
              <div className="donut-legend">
                <div className="donut-item">
                  <span className="dot dot-inuse" />
                  <span>In Use</span>
                  <strong>{assetStats.inUse}</strong>
                </div>
                <div className="donut-item">
                  <span className="dot dot-available" />
                  <span>Available</span>
                  <strong>{assetStats.available}</strong>
                </div>
                <div className="donut-item">
                  <span className="dot dot-retired" />
                  <span>Retired</span>
                  <strong>{assetStats.retired}</strong>
                </div>
              </div>
            </div>
            <div className="dash-kpis">
              <div className="dash-kpi">
                <div className="kpi-icon kpi-unassigned"><UserMinus size={18} /></div>
                <div>
                  <div className="kpi-label">Unassigned</div>
                  <div className="kpi-value">{assetStats.unassigned}</div>
                </div>
              </div>
              <div className="dash-kpi">
                <div className="kpi-icon kpi-faulty"><Wrench size={18} /></div>
                <div>
                  <div className="kpi-label">Faulty</div>
                  <div className="kpi-value">{assetStats.faulty}</div>
                </div>
              </div>
              <div className="dash-kpi">
                <div className="kpi-icon kpi-inuse"><BadgeCheck size={18} /></div>
                <div>
                  <div className="kpi-label">In Use</div>
                  <div className="kpi-value">{assetStats.inUse}</div>
                </div>
              </div>
            </div>
            <div className="dash-chart">
              <div className="chart-title">Type Breakdown</div>
              <div className="stat-list">
                {Object.entries(assetStats.byType).map(([k, v]) => (
                  <div key={k} className="stat-row">
                    <span>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dash-chart">
              <div className="chart-title">Status</div>
              <div className="stat-list">
                <div className="stat-row"><span>Available</span><span>{assetStats.available}</span></div>
                <div className="stat-row"><span>Retired</span><span>{assetStats.retired}</span></div>
              </div>
            </div>
          </div>

          <div className="dash-panel wide">
            <div className="panel-head">
              <h2>Ticket Volume Over Time</h2>
              <span className="dash-pill">Daily & Weekly</span>
            </div>
            <div className="dash-split">
              <div className="mini-bar-chart">
                <div className="chart-title">Daily (7d)</div>
                <div className="mini-bars">
                  {dailySeries.counts.map((v, idx) => (
                    <span
                      key={dailySeries.labels[idx]}
                      className="mini-bar"
                      style={{ height: `${(v / dailySeries.max) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="mini-labels">
                  {dailySeries.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>
              <div className="mini-bar-chart">
                <div className="chart-title">Weekly (6w)</div>
                <div className="mini-bars alt">
                  {weeklySeries.counts.map((v, idx) => (
                    <span
                      key={weeklySeries.labels[idx]}
                      className="mini-bar alt"
                      style={{ height: `${(v / weeklySeries.max) * 100}%` }}
                    />
                  ))}
                </div>
                <div className="mini-labels">
                  {weeklySeries.labels.map((label) => (
                    <span key={label}>{label}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="panel-head">
              <h2>Top Clients & Categories</h2>
              <span className="dash-pill">Top 6</span>
            </div>
            <div className="dash-split">
              <div>
                <div className="chart-title">Clients</div>
                <div className="dash-list">
                  {topClients.map(([k, v]) => (
                    <div key={k} className="dash-list-row">
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                  {topClients.length === 0 && <div className="dash-empty">No data</div>}
                </div>
              </div>
              <div>
                <div className="chart-title">Categories</div>
                <div className="dash-list">
                  {topCategories.map(([k, v]) => (
                    <div key={k} className="dash-list-row">
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                  {topCategories.length === 0 && <div className="dash-empty">No data</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="dash-panel">
            <div className="panel-head">
              <h2>Agent Workload & Queues</h2>
              <span className="dash-pill">Assignments</span>
            </div>
            <div className="dash-split">
              <div>
                <div className="chart-title">Agent Workload</div>
                <div className="dash-list">
                  {agentWorkload.map(([k, v]) => (
                    <div key={k} className="workload-row">
                      <span>{k}</span>
                      <div className="workload-bar">
                        <span style={{ width: `${Math.min(100, (v / Math.max(1, ticketStats.total)) * 100)}%` }} />
                      </div>
                      <strong>{v}</strong>
                    </div>
                  ))}
                  {agentWorkload.length === 0 && <div className="dash-empty">No data</div>}
                </div>
              </div>
              <div>
                <div className="chart-title">Queue Distribution</div>
                <div className="dash-list">
                  {queueDistribution.map(([k, v]) => (
                    <div key={k} className="workload-row">
                      <span>{k}</span>
                      <div className="workload-bar alt">
                        <span style={{ width: `${Math.min(100, (v / Math.max(1, ticketStats.total)) * 100)}%` }} />
                      </div>
                      <strong>{v}</strong>
                    </div>
                  ))}
                  {queueDistribution.length === 0 && <div className="dash-empty">No data</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="dash-panel wide">
            <div className="panel-head">
              <h2>Asset Lifecycle Trend</h2>
              <span className="dash-pill">Last 6 months</span>
            </div>
            <div className="trend-chart">
              {assetTrend.labels.map((label, idx) => {
                const inUse = assetTrend.series.inUse[idx]
                const available = assetTrend.series.available[idx]
                const retired = assetTrend.series.retired[idx]
                return (
                  <div key={label} className="trend-group">
                    <div className="trend-bars">
                      <span className="trend-seg retired" style={{ height: `${(retired / assetTrend.max) * 100}%` }} />
                      <span className="trend-seg available" style={{ height: `${(available / assetTrend.max) * 100}%` }} />
                      <span className="trend-seg inuse" style={{ height: `${(inUse / assetTrend.max) * 100}%` }} />
                    </div>
                    <div className="trend-label">{label}</div>
                  </div>
                )
              })}
            </div>
            <div className="trend-legend">
              <span><i className="legend-dot inuse" />In Use</span>
              <span><i className="legend-dot available" />Available</span>
              <span><i className="legend-dot retired" />Retired</span>
            </div>
          </div>

          <div className="dash-panel wide">
            <div className="panel-head">
              <h2>Live Incidents & Alerts</h2>
              <span className="dash-pill">Open tickets</span>
            </div>
            <div className="alert-list">
              {incidentFeed.map((t) => (
                <div key={t.id} className="alert-row">
                  <div>
                    <div className="alert-title">{t.subject || t.description || 'Ticket'}</div>
                    <div className="alert-meta">{t.ticketId || t.id} · {formatShort(getTicketDate(t))}</div>
                  </div>
                  <span className={`alert-badge ${priorityTone(t.priority)}`}>{t.priority || 'Normal'}</span>
                </div>
              ))}
              {incidentFeed.length === 0 && <div className="activity-empty">No open incidents</div>}
            </div>
          </div>

          <div className="dash-panel wide">
            <div className="panel-head">
              <h2>Priority Distribution</h2>
              <span className="dash-pill">All tickets</span>
            </div>
            <div className="priority-grid">
              {Object.entries(priorityStats).map(([k, v]) => (
                <div key={k} className="priority-row">
                  <span>{k}</span>
                  <div className="priority-bar">
                    <span style={{ width: `${Math.min(100, (v / Math.max(1, ticketStats.total)) * 100)}%` }} />
                  </div>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="dash-panel wide">
            <div className="panel-head">
              <h2>Recent Activity</h2>
              <span className="dash-pill">Latest updates</span>
            </div>
            <div className="activity-list">
              {recentTickets.map((t) => (
                <div key={t.id} className="activity-row">
                  <div className="activity-title">{t.subject || t.description || 'Ticket'}</div>
                  <div className="activity-meta">{t.ticketId || t.id} · {formatShort(t.createdAt)}</div>
                </div>
              ))}
              {recentTickets.length === 0 && <div className="activity-empty">No recent tickets</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

