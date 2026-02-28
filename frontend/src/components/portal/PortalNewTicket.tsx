import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import SubmitTicketForm from '../shared/SubmitTicketForm'

export default function PortalNewTicket() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/dashboard',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/dashboard')
  }

  return (
    <div className="portal-root portal-new-ticket">
      <header className="portal-topbar portal-home-topbar portal-unified-topbar">
        <div className="portal-home-brand">
          <button
            type="button"
            className="portal-mobile-nav-toggle"
            aria-label="Open navigation menu"
            onClick={() => setMobileNavOpen(true)}
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="portal-logo">TB ITSM</div>
        </div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/new-ticket')}>New Ticket</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>My Tickets</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/assets')}>My Devices</button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen(true)}>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      {mobileNavOpen && (
        <div className="portal-mobile-nav-overlay" onClick={() => setMobileNavOpen(false)}>
          <aside className="portal-mobile-nav-panel" onClick={(e) => e.stopPropagation()}>
            <div className="portal-mobile-nav-head">
              <div className="portal-logo">TB ITSM</div>
              <button
                type="button"
                className="portal-mobile-nav-close"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
              >
                x
              </button>
            </div>
            <button className={`portal-mobile-nav-link${location.pathname === '/portal/home' ? ' active' : ''}`} onClick={() => { setMobileNavOpen(false); navigate('/portal/home') }}>Home</button>
            <button className={`portal-mobile-nav-link${location.pathname === '/portal/new-ticket' ? ' active' : ''}`} onClick={() => { setMobileNavOpen(false); navigate('/portal/new-ticket') }}>New Ticket</button>
            <button className={`portal-mobile-nav-link${location.pathname === '/portal/tickets' ? ' active' : ''}`} onClick={() => { setMobileNavOpen(false); navigate('/portal/tickets') }}>My Tickets</button>
            <button className={`portal-mobile-nav-link${location.pathname === '/portal/assets' ? ' active' : ''}`} onClick={() => { setMobileNavOpen(false); navigate('/portal/assets') }}>My Devices</button>
          </aside>
        </div>
      )}

      <section className="portal-page portal-submit-ticket-page">
        <div className="portal-page-toolbar portal-tickets-toolbar portal-tickets-toolbar-row portal-new-ticket-toolbar">
          <div className="portal-tickets-toolbar-left portal-new-ticket-toolbar-left">
            <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">&larr;</button>
            <div className="portal-new-ticket-toolbar-title">New Ticket</div>
          </div>
        </div>
        <SubmitTicketForm
          className="portal-submit-ticket-form"
          createdFrom="User portal"
          requesterId={user?.id}
          requesterEmail={user?.email}
          submitLabel="Submit"
          onSubmitted={() => navigate('/portal/tickets')}
          onDiscard={() => navigate('/portal/home')}
        />
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
