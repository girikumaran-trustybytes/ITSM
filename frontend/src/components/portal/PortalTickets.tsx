import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useEffect, useMemo, useState } from 'react'
import { getTicket, listTickets } from '../../services/ticket.service'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'

export default function PortalTickets() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const [filter, setFilter] = useState('All Tickets')
  const [query, setQuery] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState<string>('')
  const [selectedTicketDetail, setSelectedTicketDetail] = useState<any | null>(null)
  const [detailsTab, setDetailsTab] = useState<'details' | 'progress'>('progress')
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [localNotes, setLocalNotes] = useState<Record<string, any[]>>({})
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
        setTickets(items)
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load tickets')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id, query])

  const filteredTickets = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tickets.filter((t: any) => {
      const status = String(t?.status || '').toLowerCase()
      const matchFilter =
        filter === 'Open Tickets'
          ? status !== 'closed'
          : filter === 'Closed Tickets'
            ? status === 'closed'
            : true
      if (!matchFilter) return false
      if (!q) return true
      const haystack = [
        t?.subject,
        t?.summary,
        t?.description,
        t?.ticketId,
        t?.id,
        t?.status,
        t?.priority,
      ]
        .map((v: any) => String(v || '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [tickets, filter, query])

  useEffect(() => {
    if (!filteredTickets.length) {
      setSelectedTicketId('')
      setSelectedTicketDetail(null)
      return
    }
    const exists = filteredTickets.some((t: any) => String(t.id || t.ticketId) === selectedTicketId)
    if (!exists) {
      setSelectedTicketId('')
      setSelectedTicketDetail(null)
    }
  }, [filteredTickets, selectedTicketId])

  const selectedTicket = useMemo(
    () => filteredTickets.find((t: any) => String(t.id || t.ticketId) === selectedTicketId),
    [filteredTickets, selectedTicketId]
  )

  useEffect(() => {
    if (!selectedTicketId) return
    let disposed = false
    ;(async () => {
      try {
        const detail = await getTicket(selectedTicketId)
        if (!disposed) setSelectedTicketDetail(detail || null)
      } catch {
        if (!disposed) setSelectedTicketDetail(selectedTicket || null)
      }
    })()
    return () => {
      disposed = true
    }
  }, [selectedTicketId, selectedTicket])

  const formatDate = (value: any) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleString()
  }

  const totalCount = filteredTickets.length
  const selectedTicketView = selectedTicketDetail || selectedTicket
  const conversationItems = useMemo(() => {
    const key = String(selectedTicketId || '')
    const serverHistory = Array.isArray(selectedTicketDetail?.history) ? selectedTicketDetail.history : []
    const local = localNotes[key] || []
    return [...serverHistory, ...local]
      .sort((a: any, b: any) => new Date(b.createdAt || b.time || 0).getTime() - new Date(a.createdAt || a.time || 0).getTime())
  }, [selectedTicketId, selectedTicketDetail, localNotes])

  const addLocalNote = () => {
    const note = noteDraft.trim()
    if (!note || !selectedTicketId) return
    const key = String(selectedTicketId)
    const entry = {
      id: `local-${Date.now()}`,
      note,
      createdAt: new Date().toISOString(),
      internal: false,
      fromStatus: selectedTicketView?.status || '',
      toStatus: selectedTicketView?.status || '',
      _local: true,
    }
    setLocalNotes((prev) => ({ ...prev, [key]: [entry, ...(prev[key] || [])] }))
    setNoteDraft('')
    setNoteOpen(false)
    setDetailsTab('progress')
  }

  return (
    <div className="portal-root">
      <header className="portal-topbar portal-home-topbar portal-unified-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/new-ticket')}>New Ticket</button>
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
        <h1 className="portal-tickets-title">My Tickets</h1>
        <div className="portal-page-toolbar portal-tickets-toolbar portal-tickets-toolbar-row">
          <div className="portal-tickets-toolbar-left">
            <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">&larr;</button>
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
              <span className="portal-search-icon">&#x2315;</span>
            </div>
          </div>
        </div>
        {loading ? (
          <div className="portal-empty-state">Loading tickets...</div>
        ) : error ? (
          <div className="portal-empty-state">{error}</div>
        ) : filteredTickets.length === 0 ? (
          <div className="portal-empty-state">No Tickets found</div>
        ) : (
          <div className="portal-tickets-shell">
            <aside className="portal-tickets-list">
              {filteredTickets.map((ticket) => {
                const tid = String(ticket.id || ticket.ticketId)
                const active = tid === selectedTicketId
                return (
                  <button
                    key={tid}
                    className={`portal-tickets-list-item${active ? ' active' : ''}`}
                    onClick={() => setSelectedTicketId(tid)}
                  >
                    <div className="portal-tickets-list-head">
                      <div>{ticket.requesterName || user?.name || 'End User'}</div>
                      <div>ID:{ticket.ticketId || ticket.id}</div>
                    </div>
                    <div className="portal-tickets-list-type">{ticket.type || ticket.category || 'Ticket'}</div>
                    <div className="portal-tickets-list-sub">{ticket.subject || ticket.summary || '-'}</div>
                    <div className="portal-tickets-list-meta">
                      <span>{formatDate(ticket.updatedAt || ticket.dateClosed || ticket.createdAt)}</span>
                      <span className={`portal-ticket-status status-${String(ticket.status || 'new').toLowerCase().replace(/\s+/g, '-')}`}>
                        {String(ticket.status || 'New').toUpperCase()}
                      </span>
                    </div>
                  </button>
                )
              })}
            </aside>
            <section className="portal-tickets-detail">
              <div className="portal-tickets-detail-top">
                {selectedTicketView ? (
                  <button
                    type="button"
                    className="portal-ticket-unselect-btn"
                    onClick={() => {
                      setSelectedTicketId('')
                      setSelectedTicketDetail(null)
                      setNoteOpen(false)
                    }}
                    aria-label="Back to ticket list"
                    title="Back"
                  >
                    &larr;
                  </button>
                ) : null}
                <div className="portal-tickets-count">1-{totalCount} of {totalCount}</div>
              </div>
              {!selectedTicketView ? (
                <div className="portal-tickets-empty">
                  <svg viewBox="0 0 24 24" className="portal-tickets-empty-icon" aria-hidden="true">
                    <g transform="rotate(-45 12 12)">
                      <rect x="7" y="9" width="10" height="6" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
                      <path d="M8.7 12h1.4M13.9 12h1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      <rect x="10.5" y="10.7" width="3" height="2.6" rx="0.45" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    </g>
                  </svg>
                  <div>Select a Ticket to view</div>
                </div>
              ) : (
                <div className="portal-tickets-detail-card">
                  <div className="portal-tickets-detail-header">
                    <div className="portal-tickets-detail-title">{selectedTicketView.ticketId || selectedTicketView.id}</div>
                    <div className="portal-tickets-detail-sub">{selectedTicketView.subject || selectedTicketView.summary || '-'}</div>
                  </div>

                  <div className="portal-ticket-tabs">
                    <button
                      className={detailsTab === 'progress' ? 'active' : ''}
                      onClick={() => setDetailsTab('progress')}
                      type="button"
                    >
                      Progress
                    </button>
                    <button
                      className={detailsTab === 'details' ? 'active' : ''}
                      onClick={() => setDetailsTab('details')}
                      type="button"
                    >
                      Details
                    </button>
                  </div>

                  {detailsTab === 'details' ? (
                    <div className="portal-tickets-detail-grid">
                      <div>
                        <label>End-User</label>
                        <p>{selectedTicketView.requester?.name || selectedTicketView.requesterName || user?.name || '-'}</p>
                      </div>
                      <div>
                        <label>Status</label>
                        <p>{selectedTicketView.status || '-'}</p>
                      </div>
                      <div>
                        <label>Date Created</label>
                        <p>{formatDate(selectedTicketView.createdAt || selectedTicketView.dateCreated)}</p>
                      </div>
                      <div>
                        <label>Date Closed</label>
                        <p>{formatDate(selectedTicketView.dateClosed)}</p>
                      </div>
                      <div>
                        <label>Ticket Type</label>
                        <p>{selectedTicketView.type || selectedTicketView.category || '-'}</p>
                      </div>
                      <div>
                        <label>Priority</label>
                        <p>{selectedTicketView.priority || '-'}</p>
                      </div>
                      <div className="full">
                        <label>Description</label>
                        <p>{selectedTicketView.description || '-'}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="portal-ticket-progress">
                      <div className="portal-ticket-progress-toolbar">
                        <button type="button" className="portal-add-note-btn" onClick={() => setNoteOpen((v) => !v)}>
                          Add Note
                        </button>
                      </div>

                      {noteOpen && (
                        <div className="portal-add-note-box">
                          <textarea
                            value={noteDraft}
                            onChange={(e) => setNoteDraft(e.target.value)}
                            placeholder="Write a note..."
                          />
                          <div className="portal-add-note-actions">
                            <button type="button" onClick={addLocalNote}>Save Note</button>
                          </div>
                        </div>
                      )}

                      <div className="portal-conversation-list">
                        {conversationItems.length === 0 ? (
                          <div className="portal-conversation-empty">No conversation yet.</div>
                        ) : (
                          conversationItems.map((item: any) => (
                            <article key={String(item.id || `${item.note}-${item.createdAt}`)} className="portal-conversation-item">
                              <div className="portal-conversation-avatar">{initials}</div>
                              <div className="portal-conversation-body">
                                <div className="portal-conversation-head">
                                  <strong>{selectedTicketView.requester?.name || user?.name || 'User'}</strong>
                                  <span>{formatDate(item.createdAt || item.time)}</span>
                                </div>
                                <div className="portal-conversation-tag">
                                  {item.internal ? 'Internal Note' : 'Conversation'}
                                </div>
                                <p>{item.note || item.text || '-'}</p>
                              </div>
                            </article>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
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
