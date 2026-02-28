import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export default function AccountsView() {
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })

  useEffect(() => {
    document.body.classList.add('accounts-view-active')
    return () => document.body.classList.remove('accounts-view-active')
  }, [])

  useEffect(() => {
    const expandedCls = 'accounts-queue-expanded'
    const collapsedCls = 'accounts-queue-collapsed'
    if (leftPanelCollapsed) {
      document.body.classList.remove(expandedCls)
      document.body.classList.add(collapsedCls)
    } else {
      document.body.classList.add(expandedCls)
      document.body.classList.remove(collapsedCls)
    }
    return () => {
      document.body.classList.remove(expandedCls)
      document.body.classList.remove(collapsedCls)
    }
  }, [leftPanelCollapsed])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'accounts') return
      if (detail.action === 'toggle-left-panel') {
        setLeftPanelCollapsed((v) => !v)
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])

  const accountsLeftPanel = (!leftPanelCollapsed && queueRoot) ? createPortal(
    <aside className="account-left-panel">
      <div className="queue-header">
        <div className="queue-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        </div>
        <div className="queue-title">
          <div className="queue-title-top">
            <div className="queue-title-text">Accounts</div>
          </div>
        </div>
        <button className="queue-collapse-btn" title="Hide Menu" onClick={() => setLeftPanelCollapsed(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="13 18 7 12 13 6" />
            <polyline points="19 18 13 12 19 6" />
          </svg>
        </button>
      </div>
      <div className="queue-list">
        <div className="queue-item queue-item-active">
          <div className="queue-avatar">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14" />
            </svg>
          </div>
          <div className="queue-name">Will implement it later</div>
        </div>
      </div>
    </aside>,
    queueRoot
  ) : null

  return (
    <>
      {accountsLeftPanel}
      <div style={{ padding: 16 }}>
        <div className="users-empty">Will implement it later</div>
      </div>
    </>
  )
}
