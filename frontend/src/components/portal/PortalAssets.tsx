import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import { useEffect, useMemo, useState } from 'react'
import { listAssets, listMyAssets } from '../../services/asset.service'

export default function PortalAssets() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const [profileOpen, setProfileOpen] = useState(false)
  const [assets, setAssets] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [categoryFilter, setCategoryFilter] = useState('All Assets')

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
    let active = true
    const withTimeout = <T,>(promise: Promise<T>, ms: number) => new Promise<T>((resolve, reject) => {
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
    const extractItems = (payload: any) => (Array.isArray(payload?.items) ? payload.items : Array.isArray(payload) ? payload : [])

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
          return (uid > 0 && assignedToId === uid)
            || (email && (assignedUserEmail === email || assignedToEmail === email))
            || (name && assignedToName === name)
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
    return () => { active = false }
  }, [user?.id, user?.email, user?.name])

  const categoryOptions = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((asset: any) => {
      const c = String(asset?.category || asset?.assetType || '').trim()
      if (c) set.add(c)
    })
    return ['All Assets', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [assets])

  const statusOptions = useMemo(() => {
    const set = new Set<string>()
    assets.forEach((asset: any) => {
      const s = String(asset?.status || '').trim()
      if (s) set.add(s)
    })
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))]
  }, [assets])

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter((asset: any) => {
      const status = String(asset?.status || '').trim()
      const category = String(asset?.category || asset?.assetType || '').trim()
      if (statusFilter !== 'All' && status !== statusFilter) return false
      if (categoryFilter !== 'All Assets' && category !== categoryFilter) return false
      if (!q) return true
      const haystack = [
        asset?.name,
        asset?.assetId,
        asset?.assetType,
        asset?.category,
        asset?.serial,
        asset?.model,
        asset?.location,
        asset?.site,
      ].map((v) => String(v || '').toLowerCase()).join(' ')
      return haystack.includes(q)
    })
  }, [assets, categoryFilter, search, statusFilter])

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

  return (
    <div className="portal-root">
      <header className="portal-topbar">
        <div className="portal-logo">TB ITSM</div>
        <div className="portal-top-actions">
          <nav className="portal-nav">
            <button className="portal-nav-link" onClick={() => navigate('/portal/home')}>Home</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/new-ticket')}>Report an issue</button>
            <button className="portal-nav-link" onClick={() => navigate('/portal/tickets')}>My Tickets</button>
            <button className="portal-nav-link active" onClick={() => navigate('/portal/assets')}>My Devices</button>
          </nav>
          <div className="portal-profile" onClick={() => setProfileOpen(true)}>
            <div className="portal-profile-name">{user?.name || 'User'}</div>
            <div className="portal-avatar unified-user-avatar">
              {avatarUrl ? <img src={avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
            </div>
          </div>
        </div>
      </header>

      <section className="portal-page">
        <div className="portal-page-header">
          <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">&larr;</button>
          <h1>My Assets</h1>
        </div>

        <div className="portal-assets-toolbar">
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            {categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {statusOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <div className="portal-assets-search">
            <span aria-hidden="true">Search</span>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
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
                <div className="portal-asset-header">
                  <div className="portal-asset-headline">
                    <div className="portal-asset-media">{getAssetGlyph(asset)}</div>
                    <div>
                      <div className="portal-asset-title">{asset.name || asset.assetId || 'Asset'}</div>
                      <div className="portal-asset-sub">{asset.assetType || asset.category || 'Type not set'}</div>
                    </div>
                  </div>
                  <span className={`portal-asset-status portal-asset-status-${getStatusTone(asset.status || '')}`}>{asset.status || 'Unknown'}</span>
                </div>

                <div className="portal-asset-grid">
                  <div><span>Asset ID</span><strong>{asset.assetId || '-'}</strong></div>
                  <div><span>Model</span><strong>{asset.model || '-'}</strong></div>
                  <div><span>Category</span><strong>{asset.category || '-'}</strong></div>
                  <div><span>Serial No</span><strong>{asset.serial || '-'}</strong></div>
                  <div><span>Location</span><strong>{asset.location || asset.site || '-'}</strong></div>
                  <div><span>Assigned To</span><strong>{asset?.assignedTo?.name || asset?.assignedTo?.email || asset?.assignedUserEmail || 'You'}</strong></div>
                  <div><span>Warranty</span><strong>{asset.warrantyUntil ? String(asset.warrantyUntil).slice(0, 10) : '-'}</strong></div>
                  <div><span>Status</span><strong>{asset.status || '-'}</strong></div>
                </div>

                <div className="portal-asset-actions">
                  <button type="button" className="portal-asset-action primary">View</button>
                  <button type="button" className="portal-asset-action" onClick={() => navigate('/portal/new-ticket')}>Report Issue</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {profileOpen && (
        <div className="portal-profile-overlay" onClick={() => setProfileOpen(false)}>
          <aside className="portal-profile-panel" onClick={(e) => e.stopPropagation()}>
            <button className="portal-profile-close" onClick={() => setProfileOpen(false)} aria-label="Close">x</button>
            <div className="portal-profile-header">
              <div className="portal-profile-avatar">{initials}</div>
              <div>
                <div className="portal-profile-title">{user?.name || 'User'}</div>
                <div className="portal-profile-email">{user?.email || 'user@example.com'}</div>
                <div className="portal-profile-status">
                  <span className="portal-status-dot" />
                  Available
                </div>
              </div>
            </div>
            <div className="portal-profile-links">
              <button onClick={() => { setProfileOpen(false); navigate('/security') }}>Account &amp; Password</button>
              <button onClick={() => { setProfileOpen(false); switchToAgentApp() }}>Switch to Agent Application</button>
              <button onClick={() => { logout(); navigate('/login') }}>Log out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
