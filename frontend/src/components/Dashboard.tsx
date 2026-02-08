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
        const ticketsRes = await api.get('/v1/tickets?pageSize=500')
        const ticketsData = ticketsRes.data
        const allTickets = ticketsData.items || []
        setTickets(allTickets)

        if (user?.role !== 'USER') {
          try {
            const assetsRes = await api.get('/v1/assets?pageSize=500')
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
      return s.includes('supplier') || s.includes('vendor')
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
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
      </div>

      <div className="dashboard-content">
        {error && <p className="error-message">{error}</p>}

        <div className="dashboard-grid">
          <div className="dash-card">
            <div className="dash-card-header">
              <h2>Tickets</h2>
              <span className="dash-pill">Total {ticketStats.total}</span>
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
            <div className="dash-section">
              <div className="section-title">Status Breakdown</div>
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

          <div className="dash-card">
            <div className="dash-card-header">
              <h2>Assets</h2>
              <span className="dash-pill">Total {assetStats.total}</span>
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
            <div className="dash-section">
              <div className="section-title">Type Breakdown</div>
              <div className="stat-list">
                {Object.entries(assetStats.byType).map(([k, v]) => (
                  <div key={k} className="stat-row">
                    <span>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="dash-section">
              <div className="section-title">Status</div>
              <div className="stat-list">
                <div className="stat-row"><span>Available</span><span>{assetStats.available}</span></div>
                <div className="stat-row"><span>Retired</span><span>{assetStats.retired}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
