import React from 'react'

type NavItem = {
  id: string
  label: string
  icon: React.ReactNode
}

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="7" height="9" x="3" y="3" rx="1" />
        <rect width="7" height="5" x="14" y="3" rx="1" />
        <rect width="7" height="9" x="14" y="12" rx="1" />
        <rect width="7" height="5" x="3" y="16" rx="1" />
      </svg>
    )
  },
  {
    id: 'tickets',
    label: 'Tickets',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
        <path d="m9.5 14.5 5-5" />
        <path d="m9.5 9.5 5 5" />
      </svg>
    )
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
        <path d="M12 22V12" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <path d="m7.5 4.27 9 5.15" />
      </svg>
    )
  },
  {
    id: 'users',
    label: 'Users',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    )
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="1" y="6" width="13" height="10" rx="1" />
        <path d="M14 9h4l3 3v4h-7z" />
        <circle cx="6" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    )
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2h8l4 4v16H8z" />
        <path d="M16 2v4h4" />
        <rect x="2" y="3" width="8" height="10" rx="1.5" />
        <path d="M4 6h4" />
        <path d="M4 9h1" />
        <path d="M6 9h1" />
        <path d="M4 11h1" />
        <path d="M6 11h1" />
        <circle cx="12" cy="17" r="2.5" />
        <path d="M11 17h2" />
        <path d="M12 15.5v3" />
        <path d="M15.5 20.5 20 16" />
        <path d="M19 17l1 1" />
      </svg>
    )
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 19h16" />
        <rect x="6" y="10" width="3" height="6" rx="1" />
        <rect x="11" y="6" width="3" height="10" rx="1" />
        <rect x="16" y="12" width="3" height="4" rx="1" />
      </svg>
    )
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: (
      <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }
]

export const primarySidebarModules = navItems.map((item) => ({
  id: item.id,
  label: item.label,
}))

export default function PrimarySidebar({ activeNav, setActiveNav, role }: { activeNav: string; setActiveNav: (id: string) => void; role?: string }) {
  const visibleNavItems = navItems.filter((item) => {
    if (role === 'ADMIN') return ['dashboard', 'tickets', 'assets', 'users', 'suppliers', 'accounts', 'reports', 'admin'].includes(item.id)
    if (role === 'AGENT') return ['dashboard', 'tickets', 'assets', 'suppliers', 'accounts', 'reports'].includes(item.id)
    if (role === 'USER') return ['tickets', 'reports'].includes(item.id)
    return ['tickets', 'reports'].includes(item.id)
  })
  return (
    <aside className="primary-left-panel">
      <div className="sidebar-header-text">ITAM</div>

      <nav className="nav-items">
        {visibleNavItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeNav === item.id ? 'active' : ''}`}
            onClick={() => setActiveNav(item.id)}
            title={item.label}
          >
            <div className="nav-icon-container">
              <span className="nav-icon">{item.icon}</span>
            </div>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  )
}

