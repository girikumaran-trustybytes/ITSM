import React, { useEffect, useMemo, useState } from 'react'
import * as ticketService from '../services/ticket.service'
import * as assetService from '../services/asset.service'
import * as userService from '../services/user.service'
import * as supplierService from '../services/supplier.service'

const donutColors = ['#2563eb', '#14b8a6', '#f97316', '#8b5cf6', '#0ea5e9', '#f43f5e']

export default function ReportsView() {
  const today = new Date()
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }
  const [startDate, setStartDate] = useState(() => {
    const d = new Date(today)
    d.setDate(today.getDate() - 30)
    d.setHours(0, 0, 0, 0)
    return toLocalInput(d)
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date(today)
    d.setHours(23, 59, 59, 0)
    return toLocalInput(d)
  })
  const [showRangePicker, setShowRangePicker] = useState(false)
  const [showRefreshMenu, setShowRefreshMenu] = useState(false)
  const [quickSearch, setQuickSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState<'Off' | 'Auto' | '5s' | '10s' | '30s' | '1m' | '5m' | '15m' | '30m' | '1h' | '2h' | '1d'>('Off')
  const [recentRanges, setRecentRanges] = useState<string[]>([])
  const rangeRef = React.useRef<HTMLDivElement | null>(null)
  const refreshRef = React.useRef<HTMLDivElement | null>(null)
  const [tickets, setTickets] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [exportBusy, setExportBusy] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const ticketsData: any = await ticketService.listTickets({ page: 1, pageSize: 500 })
        const ticketItems = Array.isArray(ticketsData) ? ticketsData : (ticketsData?.items || [])
        setTickets(ticketItems)

        const assetsData: any = await assetService.listAssets({ page: 1, pageSize: 500 })
        const assetItems = Array.isArray(assetsData) ? assetsData : (assetsData?.items || [])
        setAssets(assetItems)

        const usersData: any = await userService.listUsers({ limit: 500 })
        setUsers(Array.isArray(usersData) ? usersData : [])

        const suppliersData: any = await supplierService.listSuppliers()
        setSuppliers(Array.isArray(suppliersData) ? suppliersData : [])
      } catch (e) {
        // ignore errors for now; keep empty datasets
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (showRangePicker && rangeRef.current && !rangeRef.current.contains(target)) {
        setShowRangePicker(false)
      }
      if (showRefreshMenu && refreshRef.current && !refreshRef.current.contains(target)) {
        setShowRefreshMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showRangePicker, showRefreshMenu])

  const filtersLabel = useMemo(() => {
    const from = startDate ? startDate.replace('T', ' ') : 'Start'
    const to = endDate ? endDate.replace('T', ' ') : 'End'
    return `${from} to ${to}`
  }, [startDate, endDate])

  const quickRanges = [
    { label: 'Last 5 minutes', minutes: 5 },
    { label: 'Last 15 minutes', minutes: 15 },
    { label: 'Last 30 minutes', minutes: 30 },
    { label: 'Last 1 hour', minutes: 60 },
    { label: 'Last 3 hours', minutes: 180 },
    { label: 'Last 6 hours', minutes: 360 },
    { label: 'Last 12 hours', minutes: 720 },
    { label: 'Last 24 hours', minutes: 1440 },
    { label: 'Last 2 days', minutes: 2880 },
    { label: 'Last 7 days', minutes: 10080 },
    { label: 'Last 30 days', minutes: 43200 },
  ]

  const applyQuickRange = (minutes: number) => {
    const end = new Date()
    const start = new Date(end.getTime() - minutes * 60 * 1000)
    setStartDate(toLocalInput(start))
    setEndDate(toLocalInput(end))
    setShowRangePicker(false)
  }

  const applyRange = () => {
    if (startDate && endDate) {
      setRecentRanges((prev) => {
        const label = `${startDate.replace('T', ' ')} to ${endDate.replace('T', ' ')}`
        const next = [label, ...prev.filter((v) => v !== label)]
        return next.slice(0, 5)
      })
    }
    setShowRangePicker(false)
  }

  const ticketStats = useMemo(() => {
    const total = tickets.length
    const open = tickets.filter((t) => {
      const s = String(t.status || '').toLowerCase()
      return s !== 'closed' && s !== 'resolved'
    }).length
    const withSupplier = tickets.filter((t) => String(t.status || '').toLowerCase().includes('supplier')).length
    const byStatus = tickets.reduce<Record<string, number>>((acc, t) => {
      const key = t.status || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const byPriority = tickets.reduce<Record<string, number>>((acc, t) => {
      const key = t.priority || 'Unspecified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return { total, open, withSupplier, byStatus, byPriority }
  }, [tickets])

  const assetStats = useMemo(() => {
    const total = assets.length
    const inUse = assets.filter((a) => String(a.status || '').toLowerCase() === 'in use').length
    const available = assets.filter((a) => String(a.status || '').toLowerCase() === 'available').length
    const retired = assets.filter((a) => String(a.status || '').toLowerCase() === 'retired').length
    const faulty = assets.filter((a) => {
      const s = String(a.status || '').toLowerCase()
      return s.includes('fault') || s.includes('repair')
    }).length
    const byType = assets.reduce<Record<string, number>>((acc, a) => {
      const key = a.assetType || a.category || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return { total, inUse, available, retired, faulty, byType }
  }, [assets])

  const userStats = useMemo(() => {
    const total = users.length
    const byDept = users.reduce<Record<string, number>>((acc, u) => {
      const key = u.department || u.departmentName || 'Unassigned'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const byWorkMode = users.reduce<Record<string, number>>((acc, u) => {
      const key = u.workMode || 'Unspecified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return { total, byDept, byWorkMode }
  }, [users])

  const supplierStats = useMemo(() => ({ total: suppliers.length }), [suppliers])
  const executiveSummary = useMemo(() => {
    const slaRisk = tickets.filter((t) => {
      const status = String(t.status || '').toLowerCase()
      return status.includes('breach') || status.includes('overdue') || status.includes('hold')
    }).length
    const unassigned = tickets.filter((t) => !t.assigneeId).length
    return {
      totalTickets: ticketStats.total,
      openTickets: ticketStats.open,
      slaRisk,
      unassigned,
    }
  }, [ticketStats.open, ticketStats.total, tickets])

  const availabilityStats = useMemo(() => ([
    { label: 'Total Assets', value: assetStats.total, icon: 'stack' },
    { label: 'In Use', value: assetStats.inUse, icon: 'check' },
    { label: 'Near License Expires', value: 0, icon: 'license' },
    { label: 'Repair', value: assetStats.faulty, icon: 'tool' },
    { label: 'Near ASM Expires', value: 0, icon: 'bell' },
    { label: 'Overall Cost', value: 0, icon: 'cash' },
    { label: 'Maintenance', value: 0, icon: 'wrench' },
    { label: 'Decommissioned', value: assetStats.retired, icon: 'x' },
  ]), [assetStats])

  const topEntries = (record: Record<string, number>, limit = 6) =>
    Object.entries(record)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)

  const assetLocationCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const key = a.location || a.site || a.region || 'Unknown'
      map[key] = (map[key] || 0) + 1
    })
    return topEntries(map)
  }, [assets])

  const assetVendorCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const key = a.supplier || a.manufacturer || 'Unknown'
      map[key] = (map[key] || 0) + 1
    })
    return topEntries(map)
  }, [assets])

  const assetImpactCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const raw = (a.riskLevel || a.dataSensitivity || a.securityClassification || 'Normal').toString()
      const key = raw.toUpperCase()
      map[key] = (map[key] || 0) + 1
    })
    return topEntries(map)
  }, [assets])

  const assetOsCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const key = a.os || a.osVersion || 'Unknown'
      map[key] = (map[key] || 0) + 1
    })
    return topEntries(map)
  }, [assets])

  const assetStateCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const key = a.status || 'Unknown'
      map[key] = (map[key] || 0) + 1
    })
    return topEntries(map, 4)
  }, [assets])

  const assetTypeCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const key = a.assetType || a.category || 'Unknown'
      map[key] = (map[key] || 0) + 1
    })
    return topEntries(map, 6)
  }, [assets])

  const assetComponentCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const list: string[] = Array.isArray(a.installedSoftware)
        ? a.installedSoftware
        : (typeof a.installedSoftwareText === 'string' ? a.installedSoftwareText.split(',') : [])
      list.map((s) => s.trim()).filter(Boolean).forEach((item) => {
        map[item] = (map[item] || 0) + 1
      })
    })
    return topEntries(map, 12)
  }, [assets])

  const assetServiceCounts = useMemo(() => {
    const map: Record<string, number> = {}
    assets.forEach((a) => {
      const ids: number[] = Array.isArray(a.serviceIds) ? a.serviceIds : []
      if (ids.length === 0) {
        map.Unknown = (map.Unknown || 0) + 1
      } else {
        ids.forEach((id) => {
          const key = `Service ${id}`
          map[key] = (map[key] || 0) + 1
        })
      }
    })
    return topEntries(map, 6)
  }, [assets])

  const costSeries = useMemo(() => {
    const values = assets
      .map((a) => Number(a.purchaseCost || a.cost || 0))
      .filter((v) => Number.isFinite(v) && v > 0)
      .slice(0, 12)
    return values.length ? values : [10, 18, 24, 12, 28, 34, 16, 20, 26, 14, 22, 30]
  }, [assets])

  const totalFor = (entries: Array<[string, number]>) => entries.reduce((s, [, v]) => s + v, 0) || 1

  const exportSummaryCsv = async () => {
    try {
      setExportBusy(true)
      const rows = [
        ['metric', 'value'],
        ['total_tickets', String(executiveSummary.totalTickets)],
        ['open_tickets', String(executiveSummary.openTickets)],
        ['sla_risk', String(executiveSummary.slaRisk)],
        ['unassigned', String(executiveSummary.unassigned)],
        ['total_assets', String(assetStats.total)],
        ['total_users', String(userStats.total)],
      ]
      const csv = rows.map((r) => r.join(',')).join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `itsm-report-summary-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setExportBusy(false)
    }
  }

  return (
    <div className="reports-view">
      <div className="reports-header reports-command-bar">
        <div>
          <h2>Reports</h2>
          <p>Grafana-style reporting workspace with flexible date ranges</p>
        </div>
        <div className="reports-actions">
          <div className="reports-range" ref={rangeRef}>
            <button className="reports-range-btn" onClick={() => setShowRangePicker((v) => !v)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6l4 2" />
              </svg>
              {filtersLabel}
              <span className="reports-utc">UTC</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showRangePicker && (
              <div className="reports-range-panel">
                <div className="range-left">
                  <div className="range-title">Absolute time range</div>
                  <label>From</label>
                  <input type="date" value={startDate.slice(0, 10)} onChange={(e) => setStartDate(`${e.target.value}T00:00`)} />
                  <label>To</label>
                  <input type="date" value={endDate.slice(0, 10)} onChange={(e) => setEndDate(`${e.target.value}T23:59`)} />
                  <div className="range-actions">
                    <button className="range-apply" onClick={applyRange}>Apply time range</button>
                  </div>
                  <div className="range-recent-title">Recently used absolute ranges</div>
                  <div className="range-recent">
                    {recentRanges.length === 0 && <div className="range-empty">No recent ranges</div>}
                    {recentRanges.map((r) => (
                      <button key={r} onClick={() => {
                        const [from, to] = r.split(' to ')
                        setStartDate(from.replace(' ', 'T'))
                        setEndDate(to.replace(' ', 'T'))
                        setShowRangePicker(false)
                      }}>{r}</button>
                    ))}
                  </div>
                </div>
                <div className="range-right">
                  <div className="range-search">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="7" />
                      <line x1="16.5" y1="16.5" x2="21" y2="21" />
                    </svg>
                    <input
                      placeholder="Search quick ranges"
                      value={quickSearch}
                      onChange={(e) => setQuickSearch(e.target.value)}
                    />
                  </div>
                  <div className="range-list">
                    {quickRanges
                      .filter((r) => r.label.toLowerCase().includes(quickSearch.toLowerCase()))
                      .map((r) => (
                        <button key={r.label} onClick={() => applyQuickRange(r.minutes)}>{r.label}</button>
                      ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="reports-refresh" ref={refreshRef}>
            <button className="reports-refresh-btn" onClick={() => setShowRefreshMenu((v) => !v)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-3-6.7" />
                <path d="M21 3v6h-6" />
              </svg>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {showRefreshMenu && (
              <div className="reports-refresh-menu">
                {['Off', 'Auto', '5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '1d'].map((opt) => (
                  <button key={opt} onClick={() => { setAutoRefresh(opt as any); setShowRefreshMenu(false) }}>
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="reports-open-btn" onClick={exportSummaryCsv} disabled={exportBusy}>
            {exportBusy ? 'Exporting...' : 'Export Summary CSV'}
          </button>
        </div>
      </div>
      {loading && <div className="reports-loading">Loading data…</div>}

      <section className="reports-executive-strip">
        <article className="reports-exec-card">
          <h4>Total Tickets</h4>
          <strong>{executiveSummary.totalTickets}</strong>
        </article>
        <article className="reports-exec-card">
          <h4>Open Tickets</h4>
          <strong>{executiveSummary.openTickets}</strong>
        </article>
        <article className="reports-exec-card">
          <h4>SLA At Risk</h4>
          <strong>{executiveSummary.slaRisk}</strong>
        </article>
        <article className="reports-exec-card">
          <h4>Unassigned</h4>
          <strong>{executiveSummary.unassigned}</strong>
        </article>
      </section>

      <section className="reports-availability">
        <div className="reports-section-title">Availability</div>
        <div className="reports-metrics">
          {availabilityStats.map((stat) => (
            <div key={stat.label} className="reports-metric">
              <div className="reports-metric-icon">
                {stat.icon === 'stack' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 7h16M4 12h16M4 17h16" />
                  </svg>
                )}
                {stat.icon === 'check' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {stat.icon === 'license' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M8 9h8M8 13h6" />
                  </svg>
                )}
                {stat.icon === 'tool' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.7 6.3a5 5 0 1 0 3 3l-7.4 7.4-2.8-2.8 7.4-7.4z" />
                  </svg>
                )}
                {stat.icon === 'bell' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                    <path d="M13.7 21a2 2 0 01-3.4 0" />
                  </svg>
                )}
                {stat.icon === 'cash' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M9 12h6M12 9v6" />
                  </svg>
                )}
                {stat.icon === 'wrench' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19l-6-6" />
                    <path d="M14 7a4 4 0 1 0 3 3" />
                  </svg>
                )}
                {stat.icon === 'x' && (
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                )}
              </div>
              <div className="reports-metric-value">{stat.value}</div>
              <div className="reports-metric-label">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="reports-grid">
        <div className="report-card">
          <div className="report-card-title">Assets by Location</div>
          <div className="report-card-visual donut">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="42" stroke="#e5e7eb" strokeWidth="16" fill="none" />
              {assetLocationCounts.map(([label, value], idx) => {
                const circumference = 2 * Math.PI * 42
                const length = (value / totalFor(assetLocationCounts)) * circumference
                const offset = assetLocationCounts.slice(0, idx).reduce((s, [, v]) => s + v, 0)
                return (
                  <circle
                    key={label}
                    cx="70"
                    cy="70"
                    r="42"
                    stroke={donutColors[idx % donutColors.length]}
                    strokeWidth="16"
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-(offset / totalFor(assetLocationCounts)) * circumference}
                  />
                )
              })}
            </svg>
            <div className="report-legend">
              {assetLocationCounts.map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by Vendors</div>
          <div className="report-card-visual donut">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="42" stroke="#e5e7eb" strokeWidth="16" fill="none" />
              {assetVendorCounts.map(([label, value], idx) => {
                const circumference = 2 * Math.PI * 42
                const length = (value / totalFor(assetVendorCounts)) * circumference
                const offset = assetVendorCounts.slice(0, idx).reduce((s, [, v]) => s + v, 0)
                return (
                  <circle
                    key={label}
                    cx="70"
                    cy="70"
                    r="42"
                    stroke={donutColors[idx % donutColors.length]}
                    strokeWidth="16"
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-(offset / totalFor(assetVendorCounts)) * circumference}
                  />
                )
              })}
            </svg>
            <div className="report-legend single">
              {assetVendorCounts.slice(0, 3).map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by Business Impact</div>
          <div className="report-card-visual donut">
            <svg viewBox="0 0 140 140">
              <circle cx="70" cy="70" r="42" stroke="#e5e7eb" strokeWidth="16" fill="none" />
              {assetImpactCounts.map(([label, value], idx) => {
                const circumference = 2 * Math.PI * 42
                const length = (value / totalFor(assetImpactCounts)) * circumference
                const offset = assetImpactCounts.slice(0, idx).reduce((s, [, v]) => s + v, 0)
                return (
                  <circle
                    key={label}
                    cx="70"
                    cy="70"
                    r="42"
                    stroke={donutColors[idx % donutColors.length]}
                    strokeWidth="16"
                    fill="none"
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-(offset / totalFor(assetImpactCounts)) * circumference}
                  />
                )
              })}
            </svg>
            <div className="report-legend">
              {assetImpactCounts.map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by OS</div>
          <div className="report-card-visual bar">
            <div className="report-bars">
              {assetOsCounts.map(([label, value], idx) => (
                <span
                  key={label}
                  className="bar a"
                  style={{ height: `${Math.max(20, (value / totalFor(assetOsCounts)) * 100)}%`, background: donutColors[idx % donutColors.length] }}
                />
              ))}
            </div>
            <div className="report-legend single">
              {assetOsCounts.slice(0, 3).map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by Overall Components Cost</div>
          <div className="report-card-visual bar thin">
            <div className="report-bars dense">
              {costSeries.map((value, idx) => (
                <span
                  key={idx}
                  className="bar a"
                  style={{ height: `${Math.max(20, (value / Math.max(1, Math.max(...costSeries))) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by State</div>
          <div className="report-card-visual bar">
            <div className="report-bars">
              {assetStateCounts.map(([label, value], idx) => (
                <span
                  key={label}
                  className="bar a"
                  style={{ height: `${Math.max(25, (value / totalFor(assetStateCounts)) * 100)}%`, background: donutColors[idx % donutColors.length] }}
                />
              ))}
            </div>
            <div className="report-legend single">
              {assetStateCounts.map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by Types</div>
          <div className="report-card-visual bar">
            <div className="report-bars">
              {assetTypeCounts.map(([label, value], idx) => (
                <span
                  key={label}
                  className="bar a"
                  style={{ height: `${Math.max(25, (value / totalFor(assetTypeCounts)) * 100)}%`, background: donutColors[idx % donutColors.length] }}
                />
              ))}
            </div>
            <div className="report-legend">
              {assetTypeCounts.map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by Components</div>
          <div className="report-card-visual stack">
            <div className="report-stack dense">
              {assetComponentCounts.slice(0, 8).map(([label], idx) => (
                <div key={idx} className="stack-row">
                  <span className="stack a" />
                  <span className="stack b" />
                  <span className="stack c" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets by Business Services</div>
          <div className="report-card-visual bar">
            <div className="report-bars">
              {assetServiceCounts.map(([label, value], idx) => (
                <span
                  key={label}
                  className="bar a"
                  style={{ height: `${Math.max(25, (value / totalFor(assetServiceCounts)) * 100)}%`, background: donutColors[idx % donutColors.length] }}
                />
              ))}
            </div>
            <div className="report-legend single">
              {assetServiceCounts.map(([label], idx) => (
                <span key={label}>
                  <i style={{ background: donutColors[idx % donutColors.length] }} />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="reports-data-grid">
        <div className="report-card">
          <div className="report-card-title">Tickets Summary</div>
          <div className="report-micro">
            <div><strong>Total:</strong> {ticketStats.total}</div>
            <div><strong>Open:</strong> {ticketStats.open}</div>
            <div><strong>With Supplier:</strong> {ticketStats.withSupplier}</div>
          </div>
          <div className="report-mini-list">
            {Object.entries(ticketStats.byStatus).slice(0, 6).map(([k, v]) => (
              <div key={k} className="mini-bar-row">
                <span>{k}</span>
                <div className="mini-bar-track">
                  <div className="mini-bar-fill medium" style={{ width: `${Math.min(100, (v / Math.max(1, ticketStats.total)) * 100)}%` }} />
                </div>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Ticket Priority Mix</div>
          <div className="report-mini-list">
            {Object.entries(ticketStats.byPriority).slice(0, 6).map(([k, v]) => (
              <div key={k} className="mini-bar-row">
                <span>{k}</span>
                <div className="mini-bar-track">
                  <div className="mini-bar-fill high" style={{ width: `${Math.min(100, (v / Math.max(1, ticketStats.total)) * 100)}%` }} />
                </div>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Assets Summary</div>
          <div className="report-micro">
            <div><strong>Total:</strong> {assetStats.total}</div>
            <div><strong>In Use:</strong> {assetStats.inUse}</div>
            <div><strong>Available:</strong> {assetStats.available}</div>
            <div><strong>Retired:</strong> {assetStats.retired}</div>
          </div>
          <div className="report-mini-list">
            {Object.entries(assetStats.byType).slice(0, 6).map(([k, v]) => (
              <div key={k} className="mini-bar-row">
                <span>{k}</span>
                <div className="mini-bar-track">
                  <div className="mini-bar-fill low" style={{ width: `${Math.min(100, (v / Math.max(1, assetStats.total)) * 100)}%` }} />
                </div>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
        <div className="report-card">
          <div className="report-card-title">Users Summary</div>
          <div className="report-micro">
            <div><strong>Total Users:</strong> {userStats.total}</div>
            <div><strong>Suppliers:</strong> {supplierStats.total}</div>
          </div>
          <div className="report-mini-list">
            {Object.entries(userStats.byWorkMode).slice(0, 6).map(([k, v]) => (
              <div key={k} className="mini-bar-row">
                <span>{k}</span>
                <div className="mini-bar-track">
                  <div className="mini-bar-fill medium" style={{ width: `${Math.min(100, (v / Math.max(1, userStats.total)) * 100)}%` }} />
                </div>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
