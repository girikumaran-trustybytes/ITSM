import React from 'react'

type NavItem = {
  id: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  { id: 'tickets', label: 'Tickets', icon: '🎫' },
  { id: 'assets', label: 'Assets', icon: '📦' },
  { id: 'users', label: 'Users', icon: '👥' },
  { id: 'vendors', label: 'Vendors', icon: '🏪' }
]

export default function PrimarySidebar({ activeNav, setActiveNav }: { activeNav: string; setActiveNav: (id: string) => void }) {
  return (
    <aside className="primary-sidebar">
      <div className="sidebar-header-text">ITAM</div>

      <nav className="nav-items">
        {navItems.map((item) => (
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
