import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'

const activity = [
  {
    author: 'Mohamed Azeez',
    ticket: '#1010752 - Fault-Close new',
    detail: 'Fault [ADX#1010752] has been resolved. Please find pictures attached.',
  },
  {
    author: 'Girikumaran',
    ticket: '#1010752 - First Response',
    detail: 'Your request is currently being investigated by our team.',
  },
]

export default function PortalHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initials = getUserInitials(user, 'G')
  const avatarUrl = getUserAvatarUrl(user)

  return (
    <div className="portal-root">
      <header className="portal-topbar">
        <div className="portal-logo">ADXBA</div>
        <div className="portal-top-actions">
          <button className="portal-link" onClick={() => navigate('/tickets')}>My Tickets</button>
          <button className="portal-link portal-primary" onClick={() => navigate('/tickets')}>New Ticket</button>
          <div className="portal-avatar unified-user-avatar">
            {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
          </div>
        </div>
      </header>

      <section className="portal-hero">
        <h1>How can we help you today?</h1>
        <div className="portal-cards">
          <button className="portal-card" onClick={() => navigate('/tickets')}>
            <div className="portal-card-icon">T</div>
            <div className="portal-card-title">My Tickets</div>
            <div className="portal-card-sub">View open and closed tickets, track progress or update.</div>
          </button>
          <button className="portal-card" onClick={() => navigate('/tickets')}>
            <div className="portal-card-icon">!</div>
            <div className="portal-card-title">New Ticket</div>
            <div className="portal-card-sub">Click here to create a new ticket.</div>
          </button>
        </div>
      </section>

      <section className="portal-activity">
        <h2>Recent Activity</h2>
        <div className="portal-activity-list">
          {activity.map((item, idx) => (
            <div key={`${item.ticket}-${idx}`} className="portal-activity-item">
              <div className="portal-activity-avatar">{item.author.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}</div>
              <div>
                <div className="portal-activity-title">{item.author}</div>
                <div className="portal-activity-ticket">{item.ticket}</div>
                <div className="portal-activity-detail">{item.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <aside className="portal-account-panel">
        <div className="portal-account-header">
          <div className="portal-account-title">My account</div>
          <button className="portal-account-close" aria-label="Close">x</button>
        </div>
        <div className="portal-account-body">
          <div className="portal-account-row">
            <div className="portal-account-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
            <div>
              <div className="portal-account-name">{user?.name || 'User'}</div>
              <div className="portal-account-email">{user?.email || 'user@example.com'}</div>
            </div>
          </div>
          <div className="portal-account-links">
            <button onClick={() => navigate('/settings')}>Settings</button>
            <button onClick={() => navigate('/security')}>Password &amp; Security</button>
            <button onClick={() => navigate('/')}>Switch to Staff Application</button>
            <button onClick={() => { logout(); navigate('/login') }}>Log out</button>
          </div>
          <div className="portal-account-language">
            <label>Language</label>
            <select defaultValue="English (United Kingdom)">
              <option>English (United Kingdom)</option>
              <option>English (United States)</option>
              <option>Deutsch</option>
            </select>
          </div>
        </div>
      </aside>

      <div className="portal-floating">
        <button className="portal-floating-chat">Live Chat</button>
      </div>
    </div>
  )
}
