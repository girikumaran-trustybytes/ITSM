import React from 'react'

type PortalNavButtonProps = {
  label: string
  icon: 'home' | 'newTicket' | 'tickets' | 'devices'
  active?: boolean
  onClick: () => void
}

const iconMap: Record<PortalNavButtonProps['icon'], React.ReactNode> = {
  home: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5L12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5a1 1 0 0 1-1-1v-4.5h-3V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.5z" />
    </svg>
  ),
  newTicket: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v14M5 12h14" />
      <rect x="5" y="5" width="14" height="14" rx="3" />
    </svg>
  ),
  tickets: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M4 17h16" />
      <path d="M7 7v10M12 7v10M17 7v10" />
      <path d="M20 7v10" />
    </svg>
  ),
  devices: (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="12" rx="2.5" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
    </svg>
  ),
}

export default function PortalNavButton({ label, icon, active = false, onClick }: PortalNavButtonProps) {
  return (
    <button
      type="button"
      className={`portal-nav-link${active ? ' active' : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span className="portal-nav-link-icon">{iconMap[icon]}</span>
    </button>
  )
}
