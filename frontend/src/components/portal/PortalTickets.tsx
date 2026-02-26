import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useEffect, useState } from 'react'
import { listTickets } from '../../services/ticket.service'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'

export default function PortalTickets() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const [filter, setFilter] = useState('All Tickets')
  const [query, setQuery] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [tickets, setTickets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/')
  }

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return
      setLoading(true)
      setError('')
      try {
        const res = await listTickets({ q: query || undefined, pageSize: 50 })
        const items = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : []
        const filtered = filter === 'Open Tickets'
          ? items.filter((t: any) => String(t.status || '').toLowerCase() !== 'closed')
          : filter === 'Closed Tickets'
            ? items.filter((t: any) => String(t.status || '').toLowerCase() === 'closed')
            : items
        setTickets(filtered)
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load tickets')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id, query, filter])

  return (
    <div className="portal-root">
      <header className="portal-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/new-ticket')}>Report an issue</button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/tickets')}>My Tickets</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/assets')}>My Devices</button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen(true)}>
            <div className="portal-profile-name">{user?.name || 'User'}</div>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      <section className="portal-page">
        <div className="portal-page-toolbar portal-page-toolbar-header">
          <div className="portal-toolbar-title-group">
            <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">&larr;</button>
            <h1>My Tickets</h1>
          </div>
        </div>
        <div className="portal-page-toolbar">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option>All Tickets</option>
            <option>Open Tickets</option>
            <option>Closed Tickets</option>
          </select>
          <div className="portal-search">
            <input
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <span className="portal-search-icon">🔎</span>
          </div>
          <button className="portal-more-btn" aria-label="More">⋯</button>
        </div>
        {loading ? (
          <div className="portal-empty-state">Loading tickets...</div>
        ) : error ? (
          <div className="portal-empty-state">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="portal-empty-state">No Tickets found</div>
        ) : (
          <div className="portal-list">
            {tickets.map((ticket) => (
              <div key={ticket.id || ticket.ticketId} className="portal-list-item">
                <div className="portal-list-main">
                  <div className="portal-list-title">{ticket.subject || ticket.summary || ticket.ticketId || 'Ticket'}</div>
                  <div className="portal-list-sub">{ticket.description || ticket.category || 'No description'}</div>
                </div>
                <div className="portal-list-meta">
                  <span>{ticket.status || 'New'}</span>
                  <span>{ticket.priority || 'Normal'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {profileOpen && (
        <div className="portal-profile-overlay" onClick={() => setProfileOpen(false)}>
          <aside className="portal-profile-panel" onClick={(e) => e.stopPropagation()}>
            <button className="portal-profile-close" onClick={() => setProfileOpen(false)} aria-label="Close">x</button>
            <div className="portal-profile-header">
              <div className="portal-profile-avatar">{initials}</div>
              <div>
                <div className="portal-profile-title">{user?.name || 'User'}</div>
                <div className="portal-profile-email">{user?.email || 'user@example.com'}</div>
                <div className="portal-profile-status">
                  <span className="portal-status-dot" />
                  Available
                </div>
              </div>
            </div>
            <div className="portal-profile-links">
              <button onClick={() => { setProfileOpen(false); navigate('/security') }}>Account &amp; Password</button>
              <button onClick={() => { setProfileOpen(false); switchToAgentApp() }}>Switch to Agent Application</button>
              <button onClick={() => { logout(); navigate('/login') }}>Log out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
