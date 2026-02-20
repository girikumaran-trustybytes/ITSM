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
import AccountsView from './components/AccountsView'
import Login from './app/Login'
import ProtectedRoute from './app/ProtectedRoute'
import Unauthorized from './app/Unauthorized'
import { useAuth } from './contexts/AuthContext'
import PortalHome from './components/portal/PortalHome'
import AssetDetailView from './components/AssetDetailView'
import UserDetailView from './components/UserDetailView'
import SupplierDetailView from './components/SupplierDetailView'
import AccountSecurityView from './components/AccountSecurityView'
import { logout } from './services/auth.service'
import NotificationsPanel from './components/panels/NotificationsPanel'
import TodoPanel from './components/panels/TodoPanel'
import FeedPanel, { FEED_FILTERS, type FeedFilter } from './components/panels/FeedPanel'
import SearchPanel from './components/panels/SearchPanel'
import { listNotifications as fetchNotifications } from './services/notifications.service'
import { loadNotificationState } from './utils/notificationsState'
import { getUserAvatarUrl, getUserInitials } from './utils/avatar'
import { PRESENCE_CHANGED_EVENT, getStoredPresenceStatus, presenceStatuses, setStoredPresenceStatus, type PresenceStatus } from './utils/presence'

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
  accounts: 'Accounts',
  reports: 'Reports',
  admin: 'Admin',
}
const navPaths: Record<string, string> = {
  dashboard: '/dashboard',
  tickets: '/tickets',
  assets: '/assets',
  users: '/users',
  suppliers: '/supplier',
  accounts: '/accounts',
  reports: '/reports',
  admin: '/admin',
}

function getNavFromPath(pathname: string) {
  if (pathname.startsWith('/tickets')) return 'tickets'
  if (pathname.startsWith('/assets')) return 'assets'
  if (pathname.startsWith('/users')) return 'users'
  if (pathname.startsWith('/supplier')) return 'suppliers'
  if (pathname.startsWith('/accounts')) return 'accounts'
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
  const [showPresenceMenu, setShowPresenceMenu] = useState(false)
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>(() => getStoredPresenceStatus())
  const [activePanel, setActivePanel] = useState<null | 'search' | 'notifications' | 'todo' | 'feed'>(null)
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('All Activity')
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const [notificationPopup, setNotificationPopup] = useState<{ title: string; sub: string } | null>(null)
  const lastSeenNotificationIdRef = React.useRef<number>(0)
  const notificationInitRef = React.useRef(false)
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
  const [timeClock, setTimeClock] = useState('')
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
          setShowPresenceMenu(false)
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
    setStoredPresenceStatus(presenceStatus)
  }, [presenceStatus])

  useEffect(() => {
    const syncPresence = () => setPresenceStatus(getStoredPresenceStatus())
    window.addEventListener('storage', syncPresence)
    window.addEventListener(PRESENCE_CHANGED_EVENT, syncPresence as EventListener)
    return () => {
      window.removeEventListener('storage', syncPresence)
      window.removeEventListener(PRESENCE_CHANGED_EVENT, syncPresence as EventListener)
    }
  }, [])

  useEffect(() => {
    const formatTime = (tz: string) => new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: tz,
    }).format(new Date())

    const tick = () => {
      setTimeClock(`( UTC - ${formatTime('UTC')}) (IST - ${formatTime('Asia/Kolkata')})`)
    }

    tick()
    const timer = window.setInterval(tick, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (activePanel === 'search' && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [activePanel])

  useEffect(() => {
    let mounted = true
    let popupTimer: number | null = null
    const refreshUnreadCount = async () => {
      if (!user) {
        if (mounted) setUnreadNotificationCount(0)
        return
      }
      try {
        const rows: any[] = await fetchNotifications({ limit: 120 })
        const state = loadNotificationState(user)
        const visible = (Array.isArray(rows) ? rows : []).filter((n: any) => {
          const id = Number(n?.id)
          if (state.deletedIds.includes(id)) return false
          if (!state.clearedAt) return true
          const createdMs = n?.createdAt ? new Date(String(n.createdAt)).getTime() : 0
          return !Number.isFinite(createdMs) || createdMs > state.clearedAt
        })
        const unread = visible.filter((n: any) => !state.readIds.includes(Number(n?.id))).length
        if (mounted) setUnreadNotificationCount(unread)

        const sorted = visible
          .slice()
          .sort((a: any, b: any) => Number(a?.id || 0) - Number(b?.id || 0))
        const maxId = sorted.length ? Number(sorted[sorted.length - 1]?.id || 0) : 0

        if (!notificationInitRef.current) {
          notificationInitRef.current = true
          lastSeenNotificationIdRef.current = maxId
          return
        }

        const fresh = sorted.filter((n: any) => Number(n?.id || 0) > lastSeenNotificationIdRef.current)
        if (fresh.length > 0 && mounted) {
          const latest = fresh[fresh.length - 1]
          const ticketId = String(latest?.ticketId || latest?.meta?.ticketId || '')
          const title = String(latest?.entity || '').toLowerCase() === 'ticket'
            ? 'New request logged.'
            : 'New notification.'
          const sub = ticketId ? `ID:${ticketId}` : `Action: ${String(latest?.action || 'update')}`
          setNotificationPopup({ title, sub })
          if (popupTimer) window.clearTimeout(popupTimer)
          popupTimer = window.setTimeout(() => {
            setNotificationPopup(null)
          }, 3000)
        }
        lastSeenNotificationIdRef.current = maxId
      } catch {
        if (mounted) setUnreadNotificationCount(0)
      }
    }
    refreshUnreadCount()
    const timer = window.setInterval(refreshUnreadCount, 30000)
    const onStateChange = () => refreshUnreadCount()
    window.addEventListener('notifications-state-changed', onStateChange as EventListener)
    return () => {
      mounted = false
      if (popupTimer) window.clearTimeout(popupTimer)
      window.clearInterval(timer)
      window.removeEventListener('notifications-state-changed', onStateChange as EventListener)
    }
  }, [user])

  useEffect(() => {
    if (!user?.role) return
    if (
      user.role === 'USER' &&
      !location.pathname.startsWith('/tickets') &&
      !location.pathname.startsWith('/reports') &&
      !location.pathname.startsWith('/security')
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

  const breadcrumbItems = useMemo(() => {
    if (location.pathname.startsWith('/tickets/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return [
        { label: 'Tickets', path: '/tickets' },
        { label: id || 'Details', path: location.pathname },
      ]
    }
    if (location.pathname.startsWith('/assets/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return [
        { label: 'Assets', path: '/assets' },
        { label: id || 'Details', path: location.pathname },
      ]
    }
    if (location.pathname.startsWith('/users/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return [
        { label: 'Users', path: '/users' },
        { label: id || 'Details', path: location.pathname },
      ]
    }
    if (location.pathname.startsWith('/supplier/')) {
      const id = decodeURIComponent(location.pathname.split('/')[2] || '')
      return [
        { label: 'Suppliers', path: '/supplier' },
        { label: id || 'Details', path: location.pathname },
      ]
    }
    if (location.pathname.startsWith('/admin')) {
      return [
        { label: 'Admin', path: '/admin' },
        { label: 'Settings', path: '/admin' },
      ]
    }
    if (location.pathname.startsWith('/security')) {
      return [{ label: 'Account Security', path: '/security' }]
    }
    const activeKey = activeNav === 'tickets' ? 'tickets' : (activeNav || 'dashboard')
    return [{ label: navLabels[activeKey] || 'Dashboard', path: navPaths[activeKey] || '/dashboard' }]
  }, [activeNav, location.pathname])

  const isTicketsRoute = location.pathname.startsWith('/tickets')
  const isDashboardRoute = location.pathname.startsWith('/dashboard')
  const isReportsRoute = location.pathname.startsWith('/reports')
  const isUsersListRoute = location.pathname === '/users'
  const isAccountsListRoute = location.pathname === '/accounts'
  const isAssetsListRoute = location.pathname === '/assets'
  const isSuppliersListRoute = location.pathname === '/supplier'
  const isAdminListRoute = location.pathname === '/admin'
  const isSecurityRoute = location.pathname.startsWith('/security')
  const showSharedToolbar = !isTicketsRoute && !isDashboardRoute && !isReportsRoute && !isAdminListRoute && !isAccountsListRoute && !isSecurityRoute
  const toolbarPagination =
    isUsersListRoute || isAccountsListRoute ? usersPagination :
    isAssetsListRoute ? assetsPagination :
    isSuppliersListRoute ? suppliersPagination :
    isAdminListRoute ? adminPagination :
    null

  useEffect(() => {
    if (isUsersListRoute || isAccountsListRoute) {
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
  }, [tabToolbarSearch, isUsersListRoute, isAccountsListRoute, isAssetsListRoute, isSuppliersListRoute, isAdminListRoute])

  const toolbarTarget =
    isUsersListRoute ? 'users' :
    isAccountsListRoute ? 'accounts' :
    isAssetsListRoute ? 'assets' :
    isSuppliersListRoute ? 'suppliers' :
    isAdminListRoute ? 'admin' :
    null
  const sharedToolbarClass =
    toolbarTarget === 'assets' ? 'assets-tool-bar' :
    toolbarTarget === 'users' ? 'users-tool-bar' :
    toolbarTarget === 'accounts' ? 'accounts-tool-bar' :
    toolbarTarget === 'suppliers' ? 'suppliers-tool-bar' :
    toolbarTarget === 'admin' ? 'admin-tool-bar' :
    'tickets-tool-bar'
  const activePresence = presenceStatuses.find((item) => item.value === presenceStatus) || presenceStatuses[0]
  const presenceDotClass = activePresence.style === 'ring' ? 'presence-dot-ring' : 'presence-dot-solid'
  const userInitials = getUserInitials(user, 'G')
  const userAvatarUrl = getUserAvatarUrl(user)

  return (
    <div className="app-root">
      <PrimarySidebar activeNav={activeNav} setActiveNav={handleNavSelect} role={user?.role} />
      <div id="ticket-left-panel" className="ticket-left-panel" />
      <div className="nav-top-bar">
        <div className="nav-top-bar-left">
          <nav className="breadcrumb" aria-label="Breadcrumb">
            {breadcrumbItems.map((item, index) => (
              <React.Fragment key={`${item.label}-${index}`}>
                <button
                  type="button"
                  className="breadcrumb-link"
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </button>
                {index < breadcrumbItems.length - 1 && <span className="breadcrumb-sep">{'>'}</span>}
              </React.Fragment>
            ))}
          </nav>
        </div>
        <div className="nav-top-bar-right">
          <div className="app-pill-btn app-time-pill" role="status" aria-live="polite">
            {timeClock}
          </div>
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
            {unreadNotificationCount > 0 ? (
              <span className="app-icon-badge">{unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}</span>
            ) : null}
          </button>
          <div className="profile-menu-anchor" ref={profileRef}>
            <button
              className="profile-avatar-btn"
              aria-label="Profile menu"
              onClick={() => {
                setShowProfileMenu((v) => !v)
                setShowPresenceMenu(false)
              }}
              style={{ ['--presence-color' as any]: activePresence.color }}
            >
              {userAvatarUrl ? <img src={userAvatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : userInitials}
              <span className={`profile-avatar-presence-dot ${presenceDotClass}`} />
            </button>
          </div>
        </div>
      </div>
      {notificationPopup ? (
        <div className="app-notification-popup">
          <button className="app-notification-popup-close" onClick={() => setNotificationPopup(null)} aria-label="Close">
            ×
          </button>
          <div className="app-notification-popup-title">{notificationPopup.title}</div>
          <div className="app-notification-popup-sub">{notificationPopup.sub}</div>
        </div>
      ) : null}
      <main className="main-area" style={panelWidth ? { marginRight: panelWidth } : undefined}>
        {showProfileMenu && (
          <div className="profile-panel" ref={profilePanelRef}>
            <div className="profile-panel-header">
              <button className="profile-panel-close" onClick={() => { setShowProfileMenu(false); setShowPresenceMenu(false) }} aria-label="Close">
                ×
              </button>
            </div>
            <div className="profile-panel-body">
              <div className="profile-panel-user">
                <div className="profile-panel-avatar unified-user-avatar">
                  {userAvatarUrl ? <img src={userAvatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : userInitials}
                  <span
                    className={`profile-panel-status-dot ${presenceDotClass}`}
                    style={{ ['--presence-color' as any]: activePresence.color }}
                  />
                </div>
                <div className="profile-panel-user-main">
                  <div className="profile-panel-name">{user?.name || 'User'}</div>
                  <div className="profile-panel-email">{user?.email || 'user@example.com'}</div>
                  <div className="profile-panel-status-wrap">
                    <button className="profile-panel-status-btn" onClick={() => setShowPresenceMenu((v) => !v)}>
                      <span
                        className={`profile-panel-status-indicator ${presenceDotClass}`}
                        style={{ ['--presence-color' as any]: activePresence.color }}
                      />
                      {presenceStatus}
                    </button>
                    {showPresenceMenu && (
                      <div className="profile-panel-status-menu">
                        {presenceStatuses.map((item) => (
                          <button
                            key={item.value}
                            className={`profile-panel-status-option${item.value === presenceStatus ? ' active' : ''}`}
                            onClick={() => {
                              setPresenceStatus(item.value)
                              setShowPresenceMenu(false)
                            }}
                          >
                            <span
                              className={`profile-panel-status-indicator ${item.style === 'ring' ? 'presence-dot-ring' : 'presence-dot-solid'}`}
                              style={{ ['--presence-color' as any]: item.color }}
                            />
                            <span className="profile-panel-status-option-main">
                              <span className="profile-panel-status-option-title">{item.value}</span>
                            </span>
                            <span className="profile-panel-status-option-check" aria-hidden="true">
                              {item.value === presenceStatus ? '✓' : ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="profile-panel-links">
                <button
                  onClick={() => {
                    setShowProfileMenu(false)
                    setShowPresenceMenu(false)
                    navigate('/security')
                  }}
                >
                  Account &amp; Password
                </button>
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
              <div className="app-panel-header-controls">
                {activePanel === 'notifications' ? (
                  <>
                    <button
                      className="panel-icon-btn"
                      aria-label="Mark all read"
                      onClick={() => window.dispatchEvent(new CustomEvent('notifications-mark-all-read'))}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Read all
                    </button>
                    <button
                      className="panel-icon-btn"
                      aria-label="Delete all"
                      onClick={() => window.dispatchEvent(new CustomEvent('notifications-delete-all'))}
                    >
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 6 }}>
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                      </svg>
                      Delete all
                    </button>
                  </>
                ) : null}
                {activePanel === 'feed' ? (
                  <select value={feedFilter} onChange={(e) => setFeedFilter(e.target.value as FeedFilter)}>
                    {FEED_FILTERS.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : null}
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
              {activePanel === 'feed' && <FeedPanel filter={feedFilter} />}
            </div>
          </div>
        )}
        {showSharedToolbar && (
          <div className={sharedToolbarClass}>
            <div className="tool-bar-left">
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
            <div className="tool-bar-right">
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
                          if (isUsersListRoute || isAccountsListRoute) setUsersPage((p) => Math.max(1, p - 1))
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
                          if (isUsersListRoute || isAccountsListRoute) setUsersPage((p) => Math.min(usersPagination.totalPages, p + 1))
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
                    className="table-icon-btn"
                    title="Refresh"
                    aria-label="Refresh"
                    onClick={() => {
                      if (!toolbarTarget) return
                      window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'refresh', target: toolbarTarget } }))
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
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
          <Route
            path="/accounts"
            element={
              <div className="work-main">
                <AccountsView />
              </div>
            }
          />
          <Route path="/reports" element={<div className="work-main"><ReportsView /></div>} />
          <Route
            path="/admin"
            element={
              <AdminView
                toolbarSearch={tabToolbarSearch}
                controlledPage={adminPage}
                onPageChange={setAdminPage}
                onPaginationMetaChange={setAdminPagination}
              />
            }
          />
          <Route path="/security" element={<AccountSecurityView />} />
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
      <Route path="/reset-password" element={<Login />} />
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



