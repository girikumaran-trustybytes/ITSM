import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { getUserAvatarUrl, getUserInitials } from '../../utils/avatar'
import { useEffect, useState } from 'react'
import { listAssets } from '../../services/asset.service'

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
    const load = async () => {
      if (!user?.id) return
      setLoading(true)
      setError('')
      try {
        const primary = await listAssets({ assignedToId: Number(user.id), pageSize: 200 })
        const primaryItems = Array.isArray(primary?.items) ? primary.items : Array.isArray(primary) ? primary : []
        if (primaryItems.length) {
          setAssets(primaryItems)
          return
        }
        // Fallback: some assets may only store assigned user email/name
        const fallback = await listAssets({ pageSize: 200 })
        const fallbackItems = Array.isArray(fallback?.items) ? fallback.items : Array.isArray(fallback) ? fallback : []
        const email = String(user?.email || '').trim().toLowerCase()
        const name = String(user?.name || '').trim().toLowerCase()
        const filtered = fallbackItems.filter((asset: any) => {
          const assignedEmail = String(asset?.assignedUserEmail || asset?.assignedTo?.email || '').trim().toLowerCase()
          const assignedName = String(asset?.assignedTo?.name || '').trim().toLowerCase()
          return (email && assignedEmail === email) || (name && assignedName === name) || Number(asset?.assignedToId) === Number(user.id)
        })
        setAssets(filtered)
      } catch (e: any) {
        setError(e?.response?.data?.error || 'Failed to load assets')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.id])

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
          <button className="portal-back-btn" onClick={() => navigate('/portal/home')} aria-label="Back">←</button>
          <h1>My Assets</h1>
        </div>
        {loading ? (
          <div className="portal-table-empty">Loading assets...</div>
        ) : error ? (
          <div className="portal-table-empty">{error}</div>
        ) : assets.length === 0 ? (
          <div className="portal-table-empty">No assets assigned.</div>
        ) : (
          <div className="portal-asset-cards">
            {assets.map((asset) => (
              <div key={asset.id} className="portal-asset-card">
                <div className="portal-asset-header">
                  <div>
                    <div className="portal-asset-title">{asset.name || asset.assetId || 'Asset'}</div>
                    <div className="portal-asset-sub">{asset.assetType || 'Type not set'}</div>
                  </div>
                  <span className="portal-asset-status">{asset.status || 'Unknown'}</span>
                </div>
                <div className="portal-asset-grid">
                  <div>
                    <span>Asset ID</span>
                    <strong>{asset.assetId || '-'}</strong>
                  </div>
                  <div>
                    <span>Model</span>
                    <strong>{asset.model || '-'}</strong>
                  </div>
                  <div>
                    <span>Serial</span>
                    <strong>{asset.serial || '-'}</strong>
                  </div>
                  <div>
                    <span>Site</span>
                    <strong>{asset.site || '-'}</strong>
                  </div>
                  <div>
                    <span>Location</span>
                    <strong>{asset.location || '-'}</strong>
                  </div>
                  <div>
                    <span>Assigned To</span>
                    <strong>{asset?.assignedTo?.name || asset?.assignedTo?.email || 'You'}</strong>
                  </div>
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
