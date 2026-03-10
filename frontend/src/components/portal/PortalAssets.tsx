import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import { useEffect, useMemo, useRef, useState } from 'react'
import { listAssets, listMyAssets } from '../../services/asset.service'
import { canShowPortalSwitchToItsm } from '../../security/policy'
import { getMyPresence, putMyPresence } from '../../services/presence.service'
import { getStoredPresenceStatus, normalizePresenceStatus, presenceStatuses, setStoredPresenceStatus, type PresenceStatus } from '../../utils/presence'

export default function PortalAssets() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const canSwitchToItsm = canShowPortalSwitchToItsm(user)
  const [profileOpen, setProfileOpen] = useState(false)
  const [showPresenceMenu, setShowPresenceMenu] = useState(false)
  const [presenceStatus, setPresenceStatus] = useState<PresenceStatus>(() => getStoredPresenceStatus())
  const presenceHydratedRef = useRef(false)
  const lastRemotePresenceRef = useRef<PresenceStatus | null>(null)
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const switchToAgentApp = () => {
    const map: Record<string, string> = {
      '/portal/home': '/',
      '/portal/tickets': '/tickets',
      '/portal/assets': '/assets',
      '/portal/new-ticket': '/tickets',
    }
    navigate(map[location.pathname] || '/')
  }

  useEffect(() => {
    setStoredPresenceStatus(presenceStatus)
    if (!presenceHydratedRef.current || !user?.id) return
    if (lastRemotePresenceRef.current === presenceStatus) return
    putMyPresence(presenceStatus)
      .then((res) => {
        lastRemotePresenceRef.current = normalizePresenceStatus(res?.status)
      })
      .catch(() => undefined)
  }, [presenceStatus, user?.id])

  useEffect(() => {
    let cancelled = false
    const hydratePresence = async () => {
      presenceHydratedRef.current = false
      lastRemotePresenceRef.current = null
      const local = getStoredPresenceStatus()
      setPresenceStatus(local)
      if (!user?.id) {
        presenceHydratedRef.current = true
        return
      }
      try {
        const res = await getMyPresence()
        if (cancelled) return
        const next = normalizePresenceStatus(res?.status)
        lastRemotePresenceRef.current = next
        setPresenceStatus(next)
        setStoredPresenceStatus(next)
      } catch {
        // fallback to local value on API failure
      } finally {
        if (!cancelled) presenceHydratedRef.current = true
      }
    }
    hydratePresence()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const activePresence = presenceStatuses.find((item) => item.value === presenceStatus) || presenceStatuses[0]
  const presenceDotClass = activePresence.style === 'ring' ? 'presence-dot-ring' : 'presence-dot-solid'

  useEffect(() => {
    let active = true
    const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
      new Promise<T>((resolve, reject) => {
        const id = window.setTimeout(() => reject(new Error('timeout')), ms)
        promise.then(
          (value) => {
            window.clearTimeout(id)
            resolve(value)
          },
          (err) => {
            window.clearTimeout(id)
            reject(err)
          }
        )
      })
    const extractItems = (payload: any) =>
      Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : []

    const load = async () => {
      if (!user?.id) return
      setLoading(true)
      setError('')
      const timeoutId = window.setTimeout(() => {
        if (!active) return
        setLoading(false)
        setError('Request timed out while loading assets. Please refresh and try again.')
      }, 15000)
      try {
        const uid = Number(user.id)
        const email = String(user?.email || '').trim().toLowerCase()
        const name = String(user?.name || '').trim().toLowerCase()
        const isMine = (asset: any) => {
          const assignedToId = Number(asset?.assignedToId || 0)
          const assignedUserEmail = String(asset?.assignedUserEmail || '').trim().toLowerCase()
          const assignedToEmail = String(asset?.assignedTo?.email || '').trim().toLowerCase()
          const assignedToName = String(asset?.assignedTo?.name || '').trim().toLowerCase()
          return (
            (uid > 0 && assignedToId === uid) ||
            (email && (assignedUserEmail === email || assignedToEmail === email)) ||
            (name && assignedToName === name)
          )
        }
        let items: any[] = []

        try {
          const result = await withTimeout(listMyAssets({ pageSize: 200, _ts: Date.now() }), 6000)
          items = extractItems(result).filter(isMine)
        } catch {}

        if (!items.length) {
          try {
            const result = await withTimeout(listAssets({ assignedToId: uid, pageSize: 200, _ts: Date.now() }), 6000)
            items = extractItems(result).filter(isMine)
          } catch {}
        }

        if (!items.length) {
          try {
            const result = await withTimeout(listAssets({ pageSize: 500, _ts: Date.now() }), 6000)
            const all = extractItems(result)
            items = all.filter(isMine)
          } catch {}
        }

        if (!items.length) throw new Error('No assets assigned.')
        if (active) setAssets(items)
      } catch (e: any) {
        if (active) {
          const message = e?.response?.data?.error || e?.message || 'Failed to load assets'
          setError(message === 'No assets assigned.' ? '' : message)
          if (message === 'No assets assigned.') setAssets([])
        }
      } finally {
        window.clearTimeout(timeoutId)
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [user?.id, user?.email, user?.name])

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter((asset: any) => {
      if (!q) return true
      const haystack = [asset?.name, asset?.assetId, asset?.assetType, asset?.category, asset?.serial, asset?.model, asset?.location, asset?.site]
        .map((v) => String(v || '').toLowerCase())
        .join(' ')
      return haystack.includes(q)
    })
  }, [assets, search])

  const getStatusTone = (status: string) => {
    const s = String(status || '').trim().toLowerCase()
    if (s.includes('repair') || s.includes('fault')) return 'warn'
    if (s.includes('stock') || s.includes('available')) return 'info'
    if (s.includes('active') || s.includes('use')) return 'ok'
    return 'neutral'
  }

  const getAssetGlyph = (asset: any) => {
    const type = String(asset?.assetType || asset?.category || '').toLowerCase()
    if (type.includes('laptop')) return 'LP'
    if (type.includes('desktop')) return 'DT'
    if (type.includes('printer')) return 'PR'
    if (type.includes('server')) return 'SV'
    if (type.includes('network')) return 'NW'
    return 'AS'
  }

  const formatDate = (value: any) => {
    const raw = String(value || '').trim()
    if (!raw) return '-'
    const date = new Date(raw)
    if (Number.isNaN(date.getTime())) return raw
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <div className="portal-root">
      <header className="portal-topbar portal-home-topbar portal-unified-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>
              Home
            </button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/new-ticket')}>
              New Ticket
            </button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>
              My Tickets
            </button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/assets')}>
              My Devices
            </button>
          </nav>
          <div className="portal-profile" onClick={() => { setProfileOpen(true); setShowPresenceMenu(false) }}>
            <div className="portal-profile-name">{user?.name || 'User'}</div>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      <section className="portal-page">
        <h1 className="portal-tickets-title">My Devices</h1>
        <div className="portal-page-toolbar portal-tickets-toolbar portal-tickets-toolbar-row">
          <div className="portal-tickets-toolbar-left">
            <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">
              &larr;
            </button>
            <div className="portal-search">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." />
              <span className="portal-search-icon">&#x2315;</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="portal-table-empty">Loading assets...</div>
        ) : error ? (
          <div className="portal-table-empty">{error}</div>
        ) : filteredAssets.length === 0 ? (
          <div className="portal-table-empty">No assets assigned.</div>
        ) : (
          <div className="portal-asset-cards">
            {filteredAssets.map((asset) => (
              <div key={asset.id} className="portal-asset-card">
                <div className="portal-asset-card-body">
                  <div className="portal-asset-header">
                    <div className="portal-asset-title-row">
                      <div className="portal-asset-title">{asset.assetId || 'Asset'}</div>
                      {!!asset.isDefault ? <span className="portal-asset-default-star" aria-label="Default">*</span> : null}
                    </div>
                    <span className={`portal-asset-status portal-asset-status-${getStatusTone(asset.status || '')}`}>{asset.status || 'Approved'}</span>
                  </div>

                  <div className="portal-asset-sub">
                    {String(asset.description || '').trim() || `${asset.assetType || asset.category || 'No description provided.'}`}
                  </div>

                  <div className="portal-asset-meta">
                    <div>{[
                      asset.assetId,
                      asset.model,
                      asset.category,
                      asset.serial,
                      asset.location || asset.site,
                    ].filter((value) => String(value || '').trim()).length} fields</div>
                    <div>Last updated: {formatDate(asset.updatedAt || asset.createdAt || asset.warrantyUntil)}</div>
                  </div>

                  <label className="portal-asset-assignment-label">Default Assignment</label>
                  <div className="portal-asset-assignment-select">
                    <span>{asset?.assignedTo?.name || asset?.assignedTo?.email || asset?.assignedUserEmail || 'No Default Assignment'}</span>
                    <span className="portal-asset-select-chevron" aria-hidden="true">v</span>
                  </div>

                  {(asset.assetId || asset.serial) ? (
                    <div className="portal-asset-default-hint">
                      <span className="portal-asset-default-star" aria-hidden="true">*</span>
                      <span>{asset.assetId || asset.serial}</span>
                    </div>
                  ) : null}
                </div>

                <div className="portal-asset-card-footer">
                  <button type="button" className="portal-asset-icon-btn" aria-label="Delete asset">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M4 7h16" />
                      <path d="M9 7V5h6v2" />
                      <path d="M8 7l1 12h6l1-12" />
                    </svg>
                  </button>
                  <button type="button" className="portal-asset-action-btn">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <path d="M4 20h4l10-10-4-4L4 16z" />
                      <path d="m12 6 4 4" />
                    </svg>
                    Edit
                  </button>
                  <button type="button" className="portal-asset-action-btn portal-asset-action-btn-danger">
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M12 7v6l4 2" />
                    </svg>
                    Revoke
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {profileOpen && (
        <div className="portal-profile-overlay" onClick={() => { setProfileOpen(false); setShowPresenceMenu(false) }}>
          <aside className="portal-profile-panel" onClick={(e) => e.stopPropagation()}>
            <button className="portal-profile-close" onClick={() => { setProfileOpen(false); setShowPresenceMenu(false) }} aria-label="Close">
              x
            </button>
            <div className="portal-profile-header">
              <div className="portal-profile-avatar">{initials}</div>
              <div>
                <div className="portal-profile-title">{user?.name || 'User'}</div>
                <div className="portal-profile-email">{user?.email || 'user@example.com'}</div>
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
            <div className="portal-profile-links">
              <button
                onClick={() => {
                  setProfileOpen(false)
                  setShowPresenceMenu(false)
                  navigate('/security')
                }}
              >
                <span className="portal-profile-link-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <rect x="5" y="11" width="14" height="9" rx="2" />
                    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                  </svg>
                </span>
                Account &amp; Password
              </button>
              {canSwitchToItsm ? (
                <button
                  onClick={() => {
                    setProfileOpen(false)
                    setShowPresenceMenu(false)
                    switchToAgentApp()
                  }}
                >
                  <span className="portal-profile-link-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M14 3h7v7" />
                      <path d="M10 14L21 3" />
                      <path d="M21 14v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h6" />
                    </svg>
                  </span>
                  Switch to Agent Application
                </button>
              ) : null}
              <button
                onClick={() => {
                  setShowPresenceMenu(false)
                  logout()
                  navigate('/login')
                }}
              >
                <span className="portal-profile-link-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                    <path d="M10 17l5-5-5-5" />
                    <path d="M15 12H3" />
                  </svg>
                </span>
                Log out
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
