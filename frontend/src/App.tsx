import React, { useEffect, useState } from 'react'
import { Routes, Route } from 'react-router-dom'
import PrimarySidebar from './components/PrimarySidebar'
import SecondarySidebar from './components/SecondarySidebar'
import Dashboard from './components/Dashboard'
import AssetsView from './components/AssetsView'
import TicketsView from './components/TicketsView'
import TicketTimeline from './components/TicketTimeline'
import AdminView from './components/AdminView'
import UsersView from './components/UsersView'
import SuppliersView from './components/SuppliersView'
import Login from './app/Login'
import ProtectedRoute from './app/ProtectedRoute'
import Unauthorized from './app/Unauthorized'
import { useAuth } from './contexts/AuthContext'

export default function App() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [activePanel, setActivePanel] = useState<null | 'search' | 'notifications' | 'todo' | 'feed' | 'profile'>(null)
  const { user } = useAuth()

  useEffect(() => {
    // Assets tab is now empty - no API fetch
  }, [])

  useEffect(() => {
    if (user?.role === 'USER' && activeNav !== 'tickets') {
      setActiveNav('tickets')
    }
    if (user?.role === 'AGENT' && ['admin', 'users'].includes(activeNav)) {
      setActiveNav('tickets')
    }
    if (user?.role === 'ADMIN' && activeNav === 'tickets') {
      // keep as is
    }
  }, [user?.role, activeNav])

  const togglePanel = (panel: 'search' | 'notifications' | 'todo' | 'feed' | 'profile') => {
    setActivePanel(prev => (prev === panel ? null : panel))
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <div className="app-root">
              <PrimarySidebar activeNav={activeNav} setActiveNav={setActiveNav} role={user?.role} />
              <div id="queue-sidebar-root" className="queue-sidebar-root" />
              <main className="main-area">
                <div className="app-header">
                  <div className="app-header-left">
                    <span className="breadcrumb">
                      {activeNav === 'tickets' ? 'Tickets > 1st Line Support' : activeNav.charAt(0).toUpperCase() + activeNav.slice(1)}
                    </span>
                  </div>
                  <div className="app-header-right">
                    <button className="app-pill-btn" onClick={() => window.dispatchEvent(new CustomEvent('open-new-ticket'))}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      New Ticket
                    </button>
                    <button
                      className={`app-icon-btn${activePanel === 'search' ? ' app-icon-btn-active' : ''}`}
                      title="Search"
                      aria-label="Search"
                      onClick={() => togglePanel('search')}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.5" y1="16.5" x2="21" y2="21" />
                      </svg>
                    </button>
                    <button
                      className={`app-icon-btn${activePanel === 'notifications' ? ' app-icon-btn-active' : ''}`}
                      title="Notifications"
                      aria-label="Notifications"
                      onClick={() => togglePanel('notifications')}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                      </svg>
                    </button>
                    <button
                      className={`app-icon-btn${activePanel === 'todo' ? ' app-icon-btn-active' : ''}`}
                      title="To Do"
                      aria-label="To Do"
                      onClick={() => togglePanel('todo')}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="4" width="16" height="16" rx="3" />
                        <line x1="8" y1="9" x2="16" y2="9" />
                        <line x1="8" y1="13" x2="16" y2="13" />
                        <line x1="8" y1="17" x2="13" y2="17" />
                      </svg>
                    </button>
                    <button
                      className={`app-icon-btn${activePanel === 'feed' ? ' app-icon-btn-active' : ''}`}
                      title="Feed"
                      aria-label="Feed"
                      onClick={() => togglePanel('feed')}
                    >
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16v6H4z" />
                        <path d="M4 14h16v6H4z" />
                      </svg>
                    </button>
                    <button
                      className={`app-icon-btn app-profile-btn${activePanel === 'profile' ? ' app-icon-btn-active' : ''}`}
                      title="Profile"
                      aria-label="Profile"
                      onClick={() => togglePanel('profile')}
                    >
                      {user?.name ? user.name.trim()[0]?.toUpperCase() : 'G'}
                    </button>
                  </div>
                </div>
                {activePanel && (
                  <aside className="app-panel">
                    <div className="app-panel-header">
                      <div className="app-panel-title">
                        {activePanel === 'search' && 'Search'}
                        {activePanel === 'notifications' && 'Notifications'}
                        {activePanel === 'todo' && 'To-Do'}
                        {activePanel === 'feed' && 'Feed'}
                        {activePanel === 'profile' && 'My Account'}
                      </div>
                      <button className="app-panel-close" onClick={() => setActivePanel(null)} aria-label="Close panel">×</button>
                    </div>
                    <div className="app-panel-body">
                      {activePanel === 'search' && (
                        <div className="app-panel-search">
                          <input
                            type="text"
                            placeholder="What are you looking for?"
                            onChange={(e) => window.dispatchEvent(new CustomEvent('global-search', { detail: { query: e.target.value } }))}
                          />
                          <button className="app-panel-search-btn" aria-label="Run search">
                            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                              <circle cx="11" cy="11" r="7" />
                              <line x1="16.5" y1="16.5" x2="21" y2="21" />
                            </svg>
                          </button>
                        </div>
                      )}
                      {activePanel === 'notifications' && (
                        <div className="app-panel-empty">Nothing to report at the moment</div>
                      )}
                      {activePanel === 'todo' && (
                        <div className="app-panel-todo">
                          <input type="date" />
                          <div className="app-panel-empty">Nothing to do at the moment</div>
                          <button className="app-panel-ghost-btn">+ Add</button>
                        </div>
                      )}
                      {activePanel === 'feed' && (
                        <div className="app-panel-feed">
                          <div className="app-panel-feed-item">
                            <div className="feed-avatar">AN</div>
                            <div>
                              <div className="feed-title">AWS Notifications</div>
                              <div className="feed-sub">#1029723 — New Ticket Logged</div>
                            </div>
                          </div>
                          <div className="app-panel-feed-item">
                            <div className="feed-avatar">UP</div>
                            <div>
                              <div className="feed-title">#1029722</div>
                              <div className="feed-sub">New Ticket Logged</div>
                            </div>
                          </div>
                        </div>
                      )}
                      {activePanel === 'profile' && (
                        <div className="app-panel-profile">
                          <div className="profile-row">
                            <div className="profile-avatar">{user?.name ? user.name.trim()[0]?.toUpperCase() : 'G'}</div>
                            <div>
                              <div className="profile-name">{user?.name || 'User'}</div>
                              <div className="profile-email">{user?.email || 'user@example.com'}</div>
                            </div>
                          </div>
                          <div className="profile-links">
                            <button>My account</button>
                            <button>Password &amp; Security</button>
                            <button>Switch to End-User Portal</button>
                            <button>Log out</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </aside>
                )}
                {activeNav === 'dashboard' && <Dashboard />}
                {activeNav === 'tickets' && (
                  <>
                    <TicketsView />
                    <div style={{ marginTop: 24 }}>
                      <TicketTimeline />
                    </div>
                  </>
                )}
                {activeNav === 'assets' && <AssetsView />}
                {activeNav === 'suppliers' && <SuppliersView />}
                {activeNav === 'users' && user?.role === 'ADMIN' && <UsersView />}
                {activeNav === 'admin' && user?.role === 'ADMIN' && <AdminView />}
              </main>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
