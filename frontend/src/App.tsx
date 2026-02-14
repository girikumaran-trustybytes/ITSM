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
import ReportsView from './components/ReportsView'
import Login from './app/Login'
import ProtectedRoute from './app/ProtectedRoute'
import Unauthorized from './app/Unauthorized'
import { useAuth } from './contexts/AuthContext'
import PortalHome from './components/portal/PortalHome'
import AssetDetailView from './components/AssetDetailView'
import UserDetailView from './components/UserDetailView'
import SupplierDetailView from './components/SupplierDetailView'
import { logout } from './services/auth.service'
import NotificationsPanel from './components/panels/NotificationsPanel'
import TodoPanel from './components/panels/TodoPanel'
import FeedPanel from './components/panels/FeedPanel'
import SearchPanel from './components/panels/SearchPanel'

const emptyPagination = {
  page: 1,
  totalPages: 1,
  totalRows: 0,
  rangeStart: 0,
  rangeEnd: 0,
}

const navLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  tickets: 'Tickets',
  assets: 'Assets',
  users: 'Users',
  suppliers: 'Suppliers',
  reports: 'Reports',
  admin: 'Admin',
}

function getNavFromPath(pathname: string) {
  if (pathname.startsWith('/tickets')) return 'tickets'
  if (pathname.startsWith('/assets')) return 'assets'
  if (pathname.startsWith('/users')) return 'users'
  if (pathname.startsWith('/supplier')) return 'suppliers'
  if (pathname.startsWith('/reports')) return 'reports'
  if (pathname.startsWith('/admin')) return 'admin'
  return 'dashboard'
}

function MainShell() {
  const [activeNav, setActiveNav] = useState('dashboard')
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  const [activePanel, setActivePanel] = useState<null | 'search' | 'notifications' | 'todo' | 'feed'>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [tabToolbarSearch, setTabToolbarSearch] = useState('')
  const [usersPage, setUsersPage] = useState(1)
  const [usersPagination, setUsersPagination] = useState(emptyPagination)
  const [assetsPage, setAssetsPage] = useState(1)
  const [assetsPagination, setAssetsPagination] = useState(emptyPagination)
  const [suppliersPage, setSuppliersPage] = useState(1)
  const [suppliersPagination, setSuppliersPagination] = useState(emptyPagination)
  const [adminPage, setAdminPage] = useState(1)
  const [adminPagination, setAdminPagination] = useState(emptyPagination)
  const panelWidth = activePanel ? 360 : (showProfileMenu ? 300 : 0)
  const profileRef = React.useRef<HTMLDivElement | null>(null)
  const profilePanelRef = React.useRef<HTMLDivElement | null>(null)
  const panelRef = React.useRef<HTMLDivElement | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setActiveNav(getNavFromPath(location.pathname))
  }, [location.pathname])

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (showProfileMenu) {
        const insideTrigger = profileRef.current && profileRef.current.contains(target)
        const insidePanel = profilePanelRef.current && profilePanelRef.current.contains(target)
        if (!insideTrigger && !insidePanel) {
          setShowProfileMenu(false)
        }
      }
      if (activePanel && panelRef.current && !panelRef.current.contains(target)) {
        const button = (target as HTMLElement).closest?.('[data-panel-toggle]')
        if (!button) {
          setActivePanel(null)
        }
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showProfileMenu, activePanel])

  useEffect(() => {
    if (activePanel === 'search' && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [activePanel])

  useEffect(() => {
    if (!user?.role) return
    if (
      user.role === 'USER' &&
      !location.pathname.startsWith('/tickets') &&
      !location.pathname.startsWith('/reports')
    ) {
      navigate('/tickets', { replace: true })
    }
    if (user.role === 'AGENT' && (location.pathname.startsWith('/admin') || location.pathname.startsWith('/users'))) {
      navigate('/tickets', { replace: true })
    }
  }, [user?.role, location.pathname, navigate])

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
    if (id === 'reports') {
      navigate('/reports')
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
    if (location.pathname.startsWith('/admin')) {
      return 'Admin > Settings'
    }
    return activeNav === 'tickets' ? 'Tickets' : (navLabels[activeNav] || 'Dashboard')
  }, [activeNav, location.pathname])

  const isTicketsRoute = location.pathname.startsWith('/tickets')
  const isDashboardRoute = location.pathname.startsWith('/dashboard')
  const isReportsRoute = location.pathname.startsWith('/reports')
  const isUsersListRoute = location.pathname === '/users'
  const isAssetsListRoute = location.pathname === '/assets'
  const isSuppliersListRoute = location.pathname === '/supplier'
  const isAdminListRoute = location.pathname === '/admin'
  const showSharedToolbar = !isTicketsRoute && !isDashboardRoute && !isReportsRoute
  const toolbarPagination =
    isUsersListRoute ? usersPagination :
    isAssetsListRoute ? assetsPagination :
    isSuppliersListRoute ? suppliersPagination :
    isAdminListRoute ? adminPagination :
    null

  useEffect(() => {
    if (isUsersListRoute) {
      setUsersPage(1)
    }
    if (isAssetsListRoute) {
      setAssetsPage(1)
    }
    if (isSuppliersListRoute) {
      setSuppliersPage(1)
    }
    if (isAdminListRoute) {
      setAdminPage(1)
    }
  }, [tabToolbarSearch, isUsersListRoute, isAssetsListRoute, isSuppliersListRoute, isAdminListRoute])

  const toolbarTarget =
    isUsersListRoute ? 'users' :
    isAssetsListRoute ? 'assets' :
    isSuppliersListRoute ? 'suppliers' :
    isAdminListRoute ? 'admin' :
    null

  return (
    <div className="app-root">
      <PrimarySidebar activeNav={activeNav} setActiveNav={handleNavSelect} role={user?.role} />
      <div id="ticket-left-panel" className="ticket-left-panel" />
      <main className="main-area" style={panelWidth ? { marginRight: panelWidth } : undefined}>
        <div className="app-header">
          <div className="app-header-left">
            <span className="breadcrumb">{breadcrumb}</span>
          </div>
          <div className="app-header-right">
            <button
              className="app-pill-btn"
              onClick={() => {
                if (!location.pathname.startsWith('/tickets')) {
                  sessionStorage.setItem('openNewTicket', '1')
                  navigate('/tickets')
                  return
                }
                window.dispatchEvent(new CustomEvent('open-new-ticket'))
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New Ticket
            </button>
            <button
              className={`app-icon-btn ${activePanel === 'search' ? 'app-icon-btn-active' : ''}`}
              data-panel-toggle
              aria-label="Search"
              onClick={() => setActivePanel(activePanel === 'search' ? null : 'search')}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
            <button
              className={`app-icon-btn ${activePanel === 'todo' ? 'app-icon-btn-active' : ''}`}
              data-panel-toggle
              aria-label="To-Do"
              onClick={() => setActivePanel(activePanel === 'todo' ? null : 'todo')}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="4" y="5" width="16" height="15" rx="2" />
                <path d="M8 9h8M8 13h8M8 17h5" />
              </svg>
            </button>
            <button
              className={`app-icon-btn ${activePanel === 'feed' ? 'app-icon-btn-active' : ''}`}
              data-panel-toggle
              aria-label="Feed"
              onClick={() => setActivePanel(activePanel === 'feed' ? null : 'feed')}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </button>
            <button
              className={`app-icon-btn ${activePanel === 'notifications' ? 'app-icon-btn-active' : ''}`}
              data-panel-toggle
              aria-label="Notifications"
              onClick={() => setActivePanel(activePanel === 'notifications' ? null : 'notifications')}
            >
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 17h12l-1.5-2.5V11a4.5 4.5 0 0 0-9 0v3.5L6 17z" />
                <path d="M10 19a2 2 0 0 0 4 0" />
              </svg>
            </button>
            <div className="profile-menu" ref={profileRef}>
              <button
                className="profile-avatar-btn"
                aria-label="Profile menu"
                onClick={() => setShowProfileMenu((v) => !v)}
              >
                {user?.name ? user.name.trim()[0]?.toUpperCase() : 'G'}
              </button>
            </div>
          </div>
        </div>
        {showProfileMenu && (
          <div className="profile-panel" ref={profilePanelRef}>
            <div className="profile-panel-header">
              <div className="profile-panel-title">My account</div>
              <button className="profile-panel-close" onClick={() => setShowProfileMenu(false)} aria-label="Close">
                ×
              </button>
            </div>
            <div className="profile-panel-body">
              <div className="profile-panel-user">
                <div className="profile-panel-avatar">
                  {user?.name ? user.name.trim()[0]?.toUpperCase() : 'G'}
                  <span className="profile-panel-status-dot" />
                </div>
                <div>
                  <div className="profile-panel-name">{user?.name || 'User'}</div>
                  <div className="profile-panel-email">{user?.email || 'user@example.com'}</div>
                  <div className="profile-panel-status">Available</div>
                </div>
              </div>
              <div className="profile-panel-links">
                <button onClick={() => setShowProfileMenu(false)}>My account</button>
                <button onClick={() => setShowProfileMenu(false)}>Password &amp; Security</button>
                <button
                  onClick={() => {
                    setShowProfileMenu(false)
                    navigate('/portal/home')
                  }}
                >
                  Switch to End-User Portal
                </button>
                <button onClick={() => logout()}>Log out</button>
              </div>
            </div>
          </div>
        )}
        {activePanel && (
          <div className="app-panel" ref={panelRef}>
            <div className="app-panel-header">
              <div className="app-panel-title">
                {activePanel === 'search' && 'Search'}
                {activePanel === 'notifications' && 'Notifications'}
                {activePanel === 'todo' && 'To-Do'}
                {activePanel === 'feed' && 'Feed'}
              </div>
              <button className="app-panel-close" onClick={() => setActivePanel(null)} aria-label="Close panel">
                ×
              </button>
            </div>
            <div className="app-panel-body">
              {activePanel === 'search' && (
                <>
                  <div className="app-panel-search">
                    <input
                      ref={searchInputRef}
                      placeholder="Search tickets, assets, users, suppliers..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button className="app-panel-search-btn" aria-label="Search">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <circle cx="11" cy="11" r="7" />
                        <path d="M20 20l-3.5-3.5" />
                      </svg>
                    </button>
                  </div>
                  <SearchPanel query={searchQuery} />
                </>
              )}
              {activePanel === 'notifications' && <NotificationsPanel />}
              {activePanel === 'todo' && <TodoPanel />}
              {activePanel === 'feed' && <FeedPanel />}
            </div>
          </div>
        )}
        {showSharedToolbar && (
          <div className="tickets-table-bar">
            <div className="tickets-table-left">
              <button
                className="table-icon-btn toolbar-left-panel-toggle"
                title="Toggle Left Panel"
                aria-label="Toggle Left Panel"
                onClick={() => {
                  if (!toolbarTarget) return
                  window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'toggle-left-panel', target: toolbarTarget } }))
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </button>
              <div className="global-search">
                <input
                  type="text"
                  placeholder="Search..."
                  value={tabToolbarSearch}
                  onChange={(e) => setTabToolbarSearch(e.target.value)}
                />
                <span className="search-icon">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="16.5" y1="16.5" x2="21" y2="21" />
                  </svg>
                </span>
              </div>
            </div>
            <div className="tickets-table-right">
              {isAdminListRoute ? (
                <>
                  <div className="admin-settings-footer-meta">
                    <span>Last updated by Admin • 2 mins ago</span>
                    <span>Platform version 3.8.2</span>
                  </div>
                  <div className="admin-settings-footer-actions">
                    <button
                      className="admin-settings-ghost"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'admin-cancel', target: 'admin' } }))
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="admin-settings-primary"
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'admin-save', target: 'admin' } }))
                      }}
                    >
                      Save Changes
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <span className="pagination">
                    {toolbarPagination
                      ? `${toolbarPagination.rangeStart}-${toolbarPagination.rangeEnd} of ${toolbarPagination.totalRows}`
                      : ''}
                  </span>
                  {toolbarPagination && (
                    <div className="toolbar-pagination-group">
                      <button
                        className="users-page-btn"
                        onClick={() => {
                          if (isUsersListRoute) setUsersPage((p) => Math.max(1, p - 1))
                          else if (isAssetsListRoute) setAssetsPage((p) => Math.max(1, p - 1))
                          else if (isSuppliersListRoute) setSuppliersPage((p) => Math.max(1, p - 1))
                          else if (isAdminListRoute) setAdminPage((p) => Math.max(1, p - 1))
                        }}
                        disabled={toolbarPagination.page <= 1}
                        aria-label="Previous page"
                      >
                        {'<'}
                      </button>
                      <button className="users-page-btn active" aria-label="Current page">
                        {toolbarPagination.page}
                      </button>
                      <button
                        className="users-page-btn"
                        onClick={() => {
                          if (isUsersListRoute) setUsersPage((p) => Math.min(usersPagination.totalPages, p + 1))
                          else if (isAssetsListRoute) setAssetsPage((p) => Math.min(assetsPagination.totalPages, p + 1))
                          else if (isSuppliersListRoute) setSuppliersPage((p) => Math.min(suppliersPagination.totalPages, p + 1))
                          else if (isAdminListRoute) setAdminPage((p) => Math.min(adminPagination.totalPages, p + 1))
                        }}
                        disabled={toolbarPagination.page >= toolbarPagination.totalPages}
                        aria-label="Next page"
                      >
                        {'>'}
                      </button>
                    </div>
                  )}
                  <button
                    className="table-primary-btn"
                    onClick={() => {
                      if (!toolbarTarget) return
                      window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'new', target: toolbarTarget } }))
                    }}
                  >
                    + New
                  </button>
                  <button
                    className="table-icon-btn"
                    title="Filter"
                    aria-label="Filter"
                    onClick={() => {
                      if (!toolbarTarget) return
                      window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'filter', target: toolbarTarget } }))
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        )}
        <Routes>
          <Route path="/dashboard" element={<div className="work-main"><Dashboard /></div>} />
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
          <Route
            path="/assets"
            element={
              <div className="work-main">
                <AssetsView
                  toolbarSearch={tabToolbarSearch}
                  controlledPage={assetsPage}
                  onPageChange={setAssetsPage}
                  onPaginationMetaChange={setAssetsPagination}
                />
              </div>
            }
          />
          <Route path="/assets/:assetId" element={<div className="work-main"><AssetDetailView /></div>} />
          <Route
            path="/supplier"
            element={
              <div className="work-main">
                <SuppliersView
                  toolbarSearch={tabToolbarSearch}
                  controlledPage={suppliersPage}
                  onPageChange={setSuppliersPage}
                  onPaginationMetaChange={setSuppliersPagination}
                />
              </div>
            }
          />
          <Route path="/supplier/:supplierId" element={<div className="work-main"><SupplierDetailView /></div>} />
          <Route
            path="/users"
            element={
              <div className="work-main">
                <UsersView
                  toolbarSearch={tabToolbarSearch}
                  controlledPage={usersPage}
                  onPageChange={setUsersPage}
                  onPaginationMetaChange={setUsersPagination}
                />
              </div>
            }
          />
          <Route path="/users/:userId" element={<div className="work-main"><UserDetailView /></div>} />
          <Route path="/reports" element={<div className="work-main"><ReportsView /></div>} />
          <Route
            path="/admin"
            element={
              <div className="work-main">
                <AdminView
                  toolbarSearch={tabToolbarSearch}
                  controlledPage={adminPage}
                  onPageChange={setAdminPage}
                  onPaginationMetaChange={setAdminPagination}
                />
              </div>
            }
          />
          <Route path="*" element={<div className="work-main"><Dashboard /></div>} />
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

