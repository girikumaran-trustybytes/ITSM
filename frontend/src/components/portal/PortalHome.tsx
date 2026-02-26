import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'

export default function PortalHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const [profileOpen, setProfileOpen] = useState(false)
  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/')
  }

  return (
    <div className="portal-root portal-home portal-home-exact">
      <header className="portal-topbar portal-home-topbar portal-unified-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link active" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/new-ticket')}>New Ticket</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>My Tickets</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/assets')}>My Devices</button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen((v) => !v)}>
            <div className="portal-profile-name">{user?.name || 'User'}</div>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>
      <section className="portal-home-hero-strip">
        <h1>How can we help you today?</h1>
      </section>
      <section className="portal-home-cards-wrap">
        <div className="portal-home-cards-exact">
          <button className="portal-home-card-exact" onClick={() => navigate('/portal/tickets')}>
            <div className="portal-home-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="portal-home-card-icon-svg">
                <g transform="rotate(-45 12 12)">
                  <rect x="7" y="9" width="10" height="6" rx="1.1" fill="none" stroke="currentColor" strokeWidth="1.8" />
                  <path d="M8.7 12h1.4M13.9 12h1.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <rect x="10.5" y="10.7" width="3" height="2.6" rx="0.45" fill="none" stroke="currentColor" strokeWidth="1.4" />
                </g>
              </svg>
            </div>
            <div className="portal-home-card-title">My Tickets</div>
            <div className="portal-home-card-sub">View your open and recently closed Tickets, and view their progress or update them.</div>
          </button>
          <button className="portal-home-card-exact" onClick={() => navigate('/portal/new-ticket')}>
            <div className="portal-home-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="portal-home-card-icon-svg">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <path d="M12 7v7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="17.5" r="1.2" fill="currentColor" />
              </svg>
            </div>
            <div className="portal-home-card-title">New Ticket</div>
            <div className="portal-home-card-sub">Click here to create a new Ticket.</div>
          </button>
          <button className="portal-home-card-exact" onClick={() => navigate('/portal/assets')}>
            <div className="portal-home-card-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="portal-home-card-icon-svg">
                <rect x="7" y="4.5" width="10" height="15" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
                <circle cx="12" cy="16.8" r="0.9" fill="currentColor" />
              </svg>
            </div>
            <div className="portal-home-card-title">My Devices</div>
            <div className="portal-home-card-sub">View the devices assigned to you and check their details.</div>
          </button>
        </div>
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
