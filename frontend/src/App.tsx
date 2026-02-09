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
                    <button className="app-icon-btn" title="Search" aria-label="Search">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="7" />
                        <line x1="16.5" y1="16.5" x2="21" y2="21" />
                      </svg>
                    </button>
                    <button className="app-icon-btn" title="Notifications" aria-label="Notifications">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
                        <path d="M13.73 21a2 2 0 01-3.46 0" />
                      </svg>
                    </button>
                    <button className="app-icon-btn" title="To Do" aria-label="To Do">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="4" y="4" width="16" height="16" rx="3" />
                        <line x1="8" y1="9" x2="16" y2="9" />
                        <line x1="8" y1="13" x2="16" y2="13" />
                        <line x1="8" y1="17" x2="13" y2="17" />
                      </svg>
                    </button>
                    <button className="app-icon-btn" title="Feed" aria-label="Feed">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4h16v6H4z" />
                        <path d="M4 14h16v6H4z" />
                      </svg>
                    </button>
                    <button className="app-icon-btn app-profile-btn" title="Profile" aria-label="Profile">G</button>
                  </div>
                </div>
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
