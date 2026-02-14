import React, { useEffect, useMemo, useState } from 'react'
import api from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import * as userService from '../services/user.service'

export default function Dashboard() {
  const { user } = useAuth()
  const [tickets, setTickets] = useState<any[]>([])
  const [assets, setAssets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
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

        try {
          const usersData = await userService.listUsers({ limit: 500 })
          setUsers(Array.isArray(usersData) ? usersData : [])
        } catch (e) {
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
    return { total, open, withSupplier, byStatus }
  }, [tickets])

  const assetStats = useMemo(() => {
    const total = assets.length
    const faulty = assets.filter((a) => {
      const s = (a.status || '').toLowerCase()
      return s.includes('fault') || s.includes('repair')
    }).length
    return { total, faulty }
  }, [assets])

  const userStats = useMemo(() => {
    return { total: users.length }
  }, [users])

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
      </div>

      <div className="dashboard-content">
        {error && <p className="error-message">{error}</p>}

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

        <div className="dash-panels">
          <div className="dash-panel wide">
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
        </div>
      </div>
    </div>
  )
}
