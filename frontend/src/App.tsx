import React, { useEffect, useMemo, useState } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import PrimarySidebar from './components/PrimarySidebar'
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
import SearchPanel from './components/panels/SearchPanel'
import NotificationsPanel from './components/panels/NotificationsPanel'
import TodoPanel from './components/panels/TodoPanel'
import FeedPanel from './components/panels/FeedPanel'
import ProfilePanel from './components/panels/ProfilePanel'
import PortalHome from './components/portal/PortalHome'
import AssetDetailView from './components/AssetDetailView'
import UserDetailView from './components/UserDetailView'
import SupplierDetailView from './components/SupplierDetailView'

type PanelType = 'search' | 'notifications' | 'todo' | 'feed' | 'profile'

const navLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  tickets: 'Tickets',
  assets: 'Assets',
  users: 'Users',
  suppliers: 'Suppliers',
  admin: 'Admin',
}

function getNavFromPath(pathname: string) {
  if (pathname.startsWith('/tickets')) return 'tickets'
  if (pathname.startsWith('/assets')) return 'assets'
  if (pathname.startsWith('/users')) return 'users'
  if (pathname.startsWith('/supplier')) return 'suppliers'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'dashboard'
}

function MainShell() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [activePanel, setActivePanel] = useState<PanelType | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    setActiveNav(getNavFromPath(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    if (!user?.role) return
    if (user.role === 'USER' && !location.pathname.startsWith('/tickets')) {
      navigate('/tickets', { replace: true })
    }
    if (user.role === 'AGENT' && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/users'))) {
      navigate('/tickets', { replace: true })
    }
  }, [user?.role, location.pathname, navigate])

  const togglePanel = (panel: PanelType) => {
    setActivePanel(prev => (prev === panel ? null : panel))
  }

  const handleNavSelect = (id: string) => {
    setActiveNav(id)
    if (id === 'dashboard') {
      navigate('/dashboard')
      return
    }
    if (id === 'suppliers') {
      navigate('/supplier')
      return
    }
    navigate(`/${id}`)
  }

  const breadcrumb = useMemo(() => {
    if (location.pathname.startsWith('/tickets/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return `Tickets > ${id}`
    }
    if (location.pathname.startsWith('/assets/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return `Assets > ${id}`
    }
    if (location.pathname.startsWith('/users/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return `Users > ${id}`
    }
    if (location.pathname.startsWith('/supplier/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return `Suppliers > ${id}`
    }
    return activeNav === 'tickets' ? 'Tickets' : (navLabels[activeNav] || 'Dashboard')
  }, [activeNav, location.pathname])

  return (
    <div className="app-root">
      <PrimarySidebar activeNav={activeNav} setActiveNav={handleNavSelect} role={user?.role} />
      <div id="queue-sidebar-root" className="queue-sidebar-root" />
      <main className="main-area">
        <div className="app-header">
          <div className="app-header-left">
            <span className="breadcrumb">{breadcrumb}</span>
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
              <button className="app-panel-close" onClick={() => setActivePanel(null)} aria-label="Close panel">x</button>
            </div>
            <div className="app-panel-body">
              {activePanel === 'search' && (
                <>
                  <div className="app-panel-search">
                    <input
                      type="text"
                      placeholder="What are you looking for?"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        window.dispatchEvent(new CustomEvent('global-search', { detail: { query: e.target.value } }))
                      }}
                    />
                    <button className="app-panel-search-btn" aria-label="Run search">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.5" y1="16.5" x2="21" y2="21" />
                      </svg>
                    </button>
                  </div>
                  <SearchPanel query={searchQuery} />
                </>
              )}
              {activePanel === 'notifications' && <NotificationsPanel />}
              {activePanel === 'todo' && <TodoPanel />}
              {activePanel === 'feed' && <FeedPanel />}
              {activePanel === 'profile' && <ProfilePanel />}
            </div>
          </aside>
        )}
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route
            path="/tickets"
            element={
              <>
                <TicketsView />
                <div style={{ marginTop: 24 }}>
                  <TicketTimeline />
                </div>
              </>
            }
          />
          <Route
            path="/tickets/:ticketId"
            element={
              <>
                <TicketsView />
                <div style={{ marginTop: 24 }}>
                  <TicketTimeline />
                </div>
              </>
            }
          />
          <Route path="/assets" element={<AssetsView />} />
          <Route path="/assets/:assetId" element={<AssetDetailView />} />
          <Route path="/supplier" element={<SuppliersView />} />
          <Route path="/supplier/:supplierId" element={<SupplierDetailView />} />
          <Route path="/users" element={<UsersView />} />
          <Route path="/users/:userId" element={<UserDetailView />} />
          <Route path="/admin" element={<AdminView />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/portal/login" element={<Login />} />
      <Route path="/portal/dashboard" element={<PortalHome />} />
      <Route path="/portal/tickets" element={<TicketsView />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route
        path="/portal/home"
        element={
          <ProtectedRoute>
            <PortalHome />
          </ProtectedRoute>
        }
      />
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <MainShell />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}
