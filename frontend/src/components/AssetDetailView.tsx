import React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteAsset, getAsset, updateAsset } from '../modules/assets/services/asset.service'
import { listUsers } from '../modules/users/services/user.service'
import { createTicket } from '../modules/tickets/services/ticket.service'
import { useAuth } from '../contexts/AuthContext'

export default function AssetDetailView() {
  const { user } = useAuth()
  const { assetId } = useParams()
  const navigate = useNavigate()
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [asset, setAsset] = React.useState<any | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [assignBusy, setAssignBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [showAssignModal, setShowAssignModal] = React.useState(false)
  const [userSearch, setUserSearch] = React.useState('')
  const [users, setUsers] = React.useState<Array<{ id: number; name?: string | null; email: string }>>([])
  const [selectedAssigneeId, setSelectedAssigneeId] = React.useState('')
  const [showRetireModal, setShowRetireModal] = React.useState(false)
  const [retireBusy, setRetireBusy] = React.useState(false)
  const [retireCondition, setRetireCondition] = React.useState<'ok' | 'not_ok'>('ok')
  const [retireStatus, setRetireStatus] = React.useState<'Unassigned' | 'In Store' | 'Faulty' | 'Retire'>('Unassigned')
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })

  const numericId = Number(assetId)

  React.useEffect(() => {
    document.body.classList.add('assets-view-active')
    return () => document.body.classList.remove('assets-view-active')
  }, [])

  React.useEffect(() => {
    const expandedCls = 'assets-queue-expanded'
    const collapsedCls = 'assets-queue-collapsed'
    if (!leftPanelCollapsed) {
      document.body.classList.add(expandedCls)
      document.body.classList.remove(collapsedCls)
    } else {
      document.body.classList.remove(expandedCls)
      document.body.classList.add(collapsedCls)
    }
    return () => {
      document.body.classList.remove(expandedCls)
      document.body.classList.remove(collapsedCls)
    }
  }, [leftPanelCollapsed])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'assets') return
      if (detail.action === 'toggle-left-panel') {
        setLeftPanelCollapsed((v) => !v)
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])

  React.useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError('Invalid asset id')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        setError('')
        const data = await getAsset(numericId)
        if (cancelled) return
        setAsset(data)
      } catch (err: any) {
        if (cancelled) return
        setError(err?.response?.data?.error || err?.message || 'Failed to load asset')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [numericId])

  React.useEffect(() => {
    if (!showAssignModal) return
    let cancelled = false
    const run = async () => {
      try {
        const data = await listUsers({ q: userSearch, limit: 50 })
        if (cancelled) return
        const items = Array.isArray(data) ? data : (data?.items || [])
        setUsers(items)
      } catch {
        if (!cancelled) setUsers([])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [showAssignModal, userSearch])

  const handleEdit = () => {
    if (!asset?.id) return
    navigate(`/assets?edit=${asset.id}`)
  }

  const handleDelete = async () => {
    if (!asset?.id) return
    if (!window.confirm(`Delete asset "${asset?.name || asset?.assetId || asset.id}"? This cannot be undone.`)) return
    try {
      setBusy(true)
      await deleteAsset(Number(asset.id))
      navigate('/assets')
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to delete asset')
    } finally {
      setBusy(false)
    }
  }
  const openAssignModal = () => {
    setUserSearch('')
    setSelectedAssigneeId(asset?.assignedTo?.id ? String(asset.assignedTo.id) : (asset?.assignedToId ? String(asset.assignedToId) : ''))
    setShowAssignModal(true)
  }
  const handleAssign = async () => {
    if (!asset?.id) return
    const nextId = selectedAssigneeId ? Number(selectedAssigneeId) : null
    const selectedUser = users.find((u) => u.id === nextId)
    const wasAssigned = Boolean(asset?.assignedTo || asset?.assignedToId)
    const actionLabel = nextId ? (wasAssigned ? 'Reassign' : 'Assign') : 'Reassign'
    try {
      setAssignBusy(true)
      setError('')
      await updateAsset(Number(asset.id), {
        assignedToId: nextId,
        assignedUserEmail: nextId ? (selectedUser?.email || null) : null,
      })
      const refreshed = await getAsset(Number(asset.id))
      setAsset(refreshed)
      setShowAssignModal(false)
      try {
        await createTicket({
          type: 'Service Request',
          priority: 'Medium',
          category: 'Service Request',
          subcategory: actionLabel,
          subject: `${actionLabel} asset ${refreshed?.assetId || refreshed?.name || asset?.assetId || asset?.name || asset?.id}`,
          description: `${actionLabel} action executed for asset ${refreshed?.assetId || refreshed?.name || asset?.id}. Assigned user: ${nextId ? (selectedUser?.email || `User #${nextId}`) : 'Unassigned'}.`,
          requesterId: user?.id ? Number(user.id) : undefined,
          requesterEmail: user?.email || undefined,
        })
      } catch (ticketErr) {
        console.warn('Failed to create service request ticket for assign/reassign action', ticketErr)
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to assign asset')
    } finally {
      setAssignBusy(false)
    }
  }
  const openRetireModal = () => {
    setRetireCondition('ok')
    setRetireStatus('Unassigned')
    setShowRetireModal(true)
  }
  const handleRetire = async () => {
    if (!asset?.id) return
    try {
      setRetireBusy(true)
      setError('')
      await updateAsset(Number(asset.id), {
        status: retireStatus,
        condition: retireCondition === 'ok' ? 'Good' : 'Faulty',
      })
      const refreshed = await getAsset(Number(asset.id))
      setAsset(refreshed)
      setShowRetireModal(false)
      try {
        await createTicket({
          type: 'Service Request',
          priority: 'Medium',
          category: 'Service Request',
          subcategory: 'Retire',
          subject: `Retire asset ${refreshed?.assetId || refreshed?.name || asset?.id}`,
          description: `Retire action executed for asset ${refreshed?.assetId || refreshed?.name || asset?.id}. Condition: ${retireCondition === 'ok' ? 'OK' : 'Not OK'}. Status set to: ${retireStatus}.`,
          requesterId: user?.id ? Number(user.id) : undefined,
          requesterEmail: user?.email || undefined,
        })
      } catch (ticketErr) {
        console.warn('Failed to create service request ticket for retire action', ticketErr)
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to retire asset')
    } finally {
      setRetireBusy(false)
    }
  }

  const formatDate = (value?: string | null) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const formatText = (value?: string | number | null) => {
    if (value === null || value === undefined) return '-'
    const text = String(value).trim()
    return text ? text : '-'
  }
  const formatAssignedUser = () => {
    if (asset?.assignedTo) return asset.assignedTo.name || asset.assignedTo.email
    if (asset?.assignedToId) return `User #${asset.assignedToId}`
    return 'Unassigned'
  }
  const formatInstalledSoftware = () => {
    const list = Array.isArray(asset?.installedSoftware) ? asset.installedSoftware : []
    if (list.length) return list.filter(Boolean).join(', ')
    return formatText(asset?.installedSoftwareText)
  }
  const formatOwnershipType = () => {
    const raw = String(asset?.ownershipType || '').trim().toLowerCase()
    if (raw === 'rental' || raw === 'rent' || raw === 'leased' || raw === 'lease') return 'Rental'
    if (raw === 'own' || raw === 'owned') return 'Own'
    const hint = `${asset?.supplier || ''} ${asset?.amcSupport || ''}`.toLowerCase()
    if (hint.includes('rent') || hint.includes('lease')) return 'Rental'
    return 'Own'
  }

  const renderAssetTypeIcon = (type: string) => {
    const key = String(type || '').trim().toLowerCase()
    const common = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const
    if (key.includes('server') || key.includes('database')) {
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="6" rx="1.5" />
          <rect x="4" y="14" width="16" height="6" rx="1.5" />
          <circle cx="8" cy="7" r="0.8" fill="currentColor" />
          <circle cx="8" cy="17" r="0.8" fill="currentColor" />
        </svg>
      )
    }
    if (key.includes('laptop') || key.includes('workstation') || key.includes('hardware')) {
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="10" rx="1.5" />
          <path d="M3 19h18" />
        </svg>
      )
    }
    if (key.includes('mobile') || key.includes('tablet')) {
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="18" rx="2" />
          <circle cx="12" cy="17.5" r="0.8" fill="currentColor" />
        </svg>
      )
    }
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  }

  const assetLeftPanel = (!leftPanelCollapsed && queueRoot)
    ? createPortal(
        <aside className="asset-left-panel">
          <div className="queue-header">
            <div className="queue-title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
              </svg>
            </div>
            <div className="queue-title">
              <div className="queue-title-top">
                <button className="queue-title-btn" onClick={() => navigate('/assets')} title="Go to assets list">
                  <div className="queue-title-text">Assets</div>
                </button>
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
            <div className="queue-item queue-item-active" onClick={() => navigate('/assets')}>
              <div className="queue-avatar">AL</div>
              <div className="queue-name">All Assets</div>
            </div>
          </div>
        </aside>,
        queueRoot
      )
    : null

  return (
    <>
      {assetLeftPanel}
      <div className="asset-detail-shell">
        {loading ? <div className="asset-detail-feedback">Loading asset details...</div> : null}
        {error ? <div className="asset-detail-feedback error">{error}</div> : null}

        {!loading && asset ? (
          <section className="asset-detail-surface">
          <div className="asset-detail-head">
            <div className="asset-card-icon">{renderAssetTypeIcon(asset.assetType || asset.category)}</div>
            <div className="asset-detail-head-main">
              <div className="asset-card-title-row">
                <h3>{asset.assetId || asset.name || assetId}</h3>
                <span className={`asset-status ${String(asset.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{asset.status || 'Active'}</span>
              </div>
              <div className="asset-card-divider" />
            </div>
          </div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Asset ID:</span><strong>{formatText(asset.assetId || assetId)}</strong></div>
              <div><span>Asset Name:</span><strong>{formatText(asset.name)}</strong></div>
              <div><span>Asset Type:</span><strong>{formatText(asset.assetType)}</strong></div>
              <div><span>Category:</span><strong>{formatText(asset.category)}</strong></div>
              <div><span>Sub-Category:</span><strong>{formatText(asset.subcategory)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>CI Type:</span><strong>{formatText(asset.ciType)}</strong></div>
              <div><span>Serial Number:</span><strong>{formatText(asset.serial)}</strong></div>
              <div><span>Asset Tag:</span><strong>{formatText(asset.assetTag)}</strong></div>
              <div><span>Barcode / QR:</span><strong>{formatText(asset.barcode)}</strong></div>
              <div><span>Status:</span><strong>{formatText(asset.status)}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">Assigned</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Assigned User:</span><strong>{formatAssignedUser()}</strong></div>
              <div><span>User Email:</span><strong>{formatText(asset.assignedUserEmail || asset.assignedTo?.email)}</strong></div>
              <div><span>Department:</span><strong>{formatText(asset.department)}</strong></div>
              <div><span>Location:</span><strong>{formatText(asset.location)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Site:</span><strong>{formatText(asset.site)}</strong></div>
              <div><span>Manager:</span><strong>{formatText(asset.manager)}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">Ownership</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Ownership Type:</span><strong>{formatOwnershipType()}</strong></div>
              <div><span>Asset Owner:</span><strong>{formatText(asset.assetOwner)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Cost Centre:</span><strong>{formatText(asset.costCentre)}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">Hardware</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Manufacturer:</span><strong>{formatText(asset.manufacturer)}</strong></div>
              <div><span>Model:</span><strong>{formatText(asset.model)}</strong></div>
              <div><span>CPU:</span><strong>{formatText(asset.cpu)}</strong></div>
              <div><span>RAM:</span><strong>{formatText(asset.ram)}</strong></div>
              <div><span>Storage:</span><strong>{formatText(asset.storage)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>MAC Address:</span><strong>{formatText(asset.macAddress)}</strong></div>
              <div><span>IP Address:</span><strong>{formatText(asset.ipAddress)}</strong></div>
              <div><span>BIOS Version:</span><strong>{formatText(asset.biosVersion)}</strong></div>
              <div><span>Firmware:</span><strong>{formatText(asset.firmware)}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">OS & Software</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>OS:</span><strong>{formatText(asset.os)}</strong></div>
              <div><span>OS Version:</span><strong>{formatText(asset.osVersion)}</strong></div>
              <div><span>License Key:</span><strong>{formatText(asset.licenseKey)}</strong></div>
              <div><span>Installed Software:</span><strong>{formatInstalledSoftware()}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Antivirus:</span><strong>{formatText(asset.antivirus)}</strong></div>
              <div><span>Patch Status:</span><strong>{formatText(asset.patchStatus)}</strong></div>
              <div><span>Encryption:</span><strong>{formatText(asset.encryption)}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">Financial</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Purchase Date:</span><strong>{formatDate(asset.purchaseDate)}</strong></div>
              <div><span>Supplier:</span><strong>{formatText(asset.supplier)}</strong></div>
              <div><span>PO Number:</span><strong>{formatText(asset.poNumber)}</strong></div>
              <div><span>Invoice Number:</span><strong>{formatText(asset.invoiceNumber)}</strong></div>
              <div><span>Purchase Cost:</span><strong>{asset.purchaseCost == null ? '-' : String(asset.purchaseCost)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Warranty Start:</span><strong>{formatDate(asset.warrantyStart)}</strong></div>
              <div><span>Warranty End:</span><strong>{formatDate(asset.warrantyUntil)}</strong></div>
              <div><span>AMC / Support:</span><strong>{formatText(asset.amcSupport)}</strong></div>
              <div><span>Depreciation End:</span><strong>{formatDate(asset.depreciationEnd)}</strong></div>
            </div>
          </div>
          <div className="asset-card-actions detail">
            <button className="asset-btn assign" onClick={openAssignModal} disabled={busy || assignBusy}>
              {asset?.assignedTo || asset?.assignedToId ? 'Reassign' : 'Assign'}
            </button>
            <button className="asset-btn edit" onClick={openRetireModal} disabled={busy || assignBusy || retireBusy}>Retire</button>
            <button className="asset-btn edit" onClick={handleEdit} disabled={busy}>Edit</button>
            <button className="asset-btn delete" onClick={handleDelete} disabled={busy}>Delete</button>
            <button className="asset-btn view" onClick={() => navigate(`/assets/${asset.id}`)} disabled={busy}>View</button>
          </div>
          </section>
        ) : null}

        {showAssignModal ? (
          <div className="modal-overlay" onClick={() => !assignBusy && setShowAssignModal(false)}>
            <div className="modal-content asset-assign-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{asset?.assignedTo || asset?.assignedToId ? 'Reassign Asset' : 'Assign Asset'}</h2>
                <button className="modal-close" onClick={() => setShowAssignModal(false)} disabled={assignBusy}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-section">
                  <label className="form-label">Search User</label>
                  <input
                    className="form-input"
                    placeholder="Search users..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    disabled={assignBusy}
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Assign To</label>
                  <select
                    className="form-select"
                    value={selectedAssigneeId}
                    onChange={(e) => setSelectedAssigneeId(e.target.value)}
                    disabled={assignBusy}
                  >
                    <option value="">Unassigned</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name || u.email} ({u.email})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setShowAssignModal(false)} disabled={assignBusy}>Cancel</button>
                <button className="btn-submit" onClick={handleAssign} disabled={assignBusy}>
                  {assignBusy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showRetireModal ? (
          <div className="modal-overlay" onClick={() => !retireBusy && setShowRetireModal(false)}>
            <div className="modal-content asset-assign-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Retire Asset</h2>
                <button className="modal-close" onClick={() => setShowRetireModal(false)} disabled={retireBusy}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-section">
                  <label className="form-label">Condition</label>
                  <select
                    className="form-select"
                    value={retireCondition}
                    onChange={(e) => {
                      const next = e.target.value === 'not_ok' ? 'not_ok' : 'ok'
                      setRetireCondition(next)
                      setRetireStatus(next === 'ok' ? 'Unassigned' : 'Faulty')
                    }}
                    disabled={retireBusy}
                  >
                    <option value="ok">OK</option>
                    <option value="not_ok">Not OK</option>
                  </select>
                </div>
                <div className="form-section">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={retireStatus}
                    onChange={(e) => setRetireStatus(e.target.value as 'Unassigned' | 'In Store' | 'Faulty' | 'Retire')}
                    disabled={retireBusy}
                  >
                    {retireCondition === 'ok' ? (
                      <>
                        <option value="Unassigned">Unassigned</option>
                        <option value="In Store">In Store</option>
                      </>
                    ) : (
                      <>
                        <option value="Faulty">Faulty</option>
                        <option value="Retire">Retire</option>
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn-cancel" onClick={() => setShowRetireModal(false)} disabled={retireBusy}>Cancel</button>
                <button className="btn-submit" onClick={handleRetire} disabled={retireBusy}>
                  {retireBusy ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

