import React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { deleteAsset, getAsset, updateAsset } from '../modules/assets/services/asset.service'
import { listUsers } from '../modules/users/services/user.service'
import { createTicket } from '../modules/tickets/services/ticket.service'
import { useAuth } from '../contexts/AuthContext'
import { getAssetTypesSettings, type AssetTypesSettings, type AssetTypeConfig } from '../services/asset-types.service'
import { renderAssetTypeIcon } from '../utils/assetTypeIcons'

export default function AssetDetailView() {
  const { user } = useAuth()
  const { assetId } = useParams()
  const navigate = useNavigate()
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [asset, setAsset] = React.useState<any | null>(null)
  const [assetTypesSettings, setAssetTypesSettings] = React.useState<AssetTypesSettings>({ types: [] })
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
  const [retireStatus, setRetireStatus] = React.useState('Unassigned')
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })

  const numericId = Number(assetId)

  const ASSET_STATUS_OPTIONS = [
    'Assigned',
    'Unassigned',
    'In Stock',
    'Reserved',
    'Under Maintenance',
    'Faulty',
    'Damaged',
    'Lost',
    'Retired',
    'Decommissioned',
  ]

  React.useEffect(() => {
    document.body.classList.add('assets-view-active')
    return () => document.body.classList.remove('assets-view-active')
  }, [])

  const assetTypesById = React.useMemo(() => {
    const map = new Map<string, AssetTypeConfig>()
    assetTypesSettings.types.forEach((type) => map.set(type.id, type))
    return map
  }, [assetTypesSettings.types])
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
    let cancelled = false
    const loadTypes = async () => {
      try {
        const data = await getAssetTypesSettings()
        if (!cancelled) setAssetTypesSettings(data)
      } catch {
        if (!cancelled) setAssetTypesSettings({ types: [] })
      }
    }
    loadTypes()
    const handler = () => loadTypes()
    window.addEventListener('asset-types-updated', handler)
    return () => {
      cancelled = true
      window.removeEventListener('asset-types-updated', handler)
    }
  }, [])

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
  const shouldShowDeviceDetails = React.useMemo(() => {
    const rawLabel = asset?.assetType || asset?.category || ''
    const tokens = String(rawLabel || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
    const allowed = new Set(['laptop', 'workstation', 'desktop', 'pc'])
    return tokens.some((token) => allowed.has(token))
  }, [asset?.assetType, asset?.category])
  const resolveAssetTypeDisplay = () => {
    const byId = asset?.assetTypeId ? assetTypesById.get(String(asset.assetTypeId)) : null
    const byLabel = !byId && asset?.assetType
      ? assetTypesSettings.types.find((t) => t.label.toLowerCase() === String(asset.assetType || '').toLowerCase())
      : null
    const type = byId || byLabel
    if (!type) return formatText(asset?.assetType)
    let current = type
    while (current.parentId && assetTypesById.get(current.parentId)) {
      current = assetTypesById.get(current.parentId) as AssetTypeConfig
    }
    const rootLabel = current.label
    return rootLabel && rootLabel !== type.label ? type.label + ' (' + rootLabel + ')' : type.label


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
  const acquisitionType = String(asset?.acquisitionType || '').trim().toLowerCase()
  const isRental = acquisitionType === 'rent' || acquisitionType === 'rental' || acquisitionType === 'lease'
  const acquisitionLabel = acquisitionType ? (isRental ? 'Rent' : 'Purchase') : '-'

  const resolveAssetTypeConfig = (): AssetTypeConfig | null => {
    const types = assetTypesSettings.types || []
    if (asset?.assetTypeId) {
      const match = types.find((t) => t.id === asset.assetTypeId)
      if (match) return match
    }
    const fallback = String(asset?.assetType || asset?.category || '').trim().toLowerCase()
    return types.find((t) => t.label.toLowerCase() === fallback) || null
  }

  const resolveAssetIcon = () => {
    const config = resolveAssetTypeConfig()
    return renderAssetTypeIcon({ label: asset?.assetType || asset?.category, icon: config?.icon, size: 'lg' })
  }

  const customFieldEntries = React.useMemo(() => {
    const values = asset?.customFields && typeof asset.customFields === 'object'
      ? asset.customFields as Record<string, any>
      : {}
    const config = resolveAssetTypeConfig()
    const fields = config?.fields || []
    if (fields.length === 0) {
      return Object.entries(values).map(([key, value]) => ({ label: key, value }))
    }
    return fields.map((field) => ({
      label: field.label,
      value: values[field.id],
    }))
  }, [asset, assetTypesSettings.types])

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
            <div className="asset-card-icon">{resolveAssetIcon()}</div>
            <div className="asset-detail-head-main">
              <div className="asset-card-title-row">
                <h3>{asset.assetId || assetId}</h3>
                <span className={`asset-status ${String(asset.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{asset.status || 'Active'}</span>
              </div>
              <div className="asset-card-divider" />
            </div>
          </div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Asset ID:</span><strong>{formatText(asset.assetId || assetId)}</strong></div>
              <div><span>Asset Type:</span><strong>{resolveAssetTypeDisplay()}</strong></div>
              <div><span>Asset Tag:</span><strong>{formatText(asset.assetTag)}</strong></div>
              <div><span>Brand / Manufacturer:</span><strong>{formatText(asset.manufacturer)}</strong></div>
              <div><span>Model Number:</span><strong>{formatText(asset.model)}</strong></div>
              <div><span>Serial Number:</span><strong>{formatText(asset.serial)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Status:</span><strong>{formatText(asset.status)}</strong></div>
              <div><span>Asset State:</span><strong>{formatText(asset.status)}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">Information</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Purchase / Rent:</span><strong>{formatText(acquisitionLabel)}</strong></div>
              {isRental ? (
                <>
                  <div><span>Vendor / Rental Provider:</span><strong>{formatText(asset.rentalProvider)}</strong></div>
                  <div><span>Rental Start Date:</span><strong>{formatDate(asset.rentalStartDate)}</strong></div>
                  <div><span>Rental End Date:</span><strong>{formatDate(asset.rentalEndDate)}</strong></div>
                  <div><span>Monthly Rental Cost:</span><strong>{asset.rentalMonthlyCost == null ? '-' : String(asset.rentalMonthlyCost)}</strong></div>
                  <div><span>Total Rental Cost:</span><strong>{asset.rentalTotalCost == null ? '-' : String(asset.rentalTotalCost)}</strong></div>
                </>
              ) : (
                <>
                  <div><span>Purchase Date:</span><strong>{formatDate(asset.purchaseDate)}</strong></div>
                  <div><span>Vendor:</span><strong>{formatText(asset.vendor)}</strong></div>
                  <div><span>Cost:</span><strong>{asset.cost == null ? '-' : String(asset.cost)}</strong></div>
                  <div><span>Salvage ($):</span><strong>{asset.salvageValue == null ? '-' : String(asset.salvageValue)}</strong></div>
                </>
              )}
            </div>
            <div className="asset-detail-col">
              {isRental ? (
                <>
                  <div><span>Maintenance Included:</span><strong>{asset.maintenanceIncluded ? 'Yes' : 'No'}</strong></div>
                  <div><span>Contract Number:</span><strong>{formatText(asset.contractNumber)}</strong></div>
                  <div><span>Return Condition:</span><strong>{formatText(asset.returnCondition)}</strong></div>
                </>
              ) : (
                <>
                  <div><span>Acquisition Date:</span><strong>{formatDate(asset.acquisitionDate)}</strong></div>
                  <div><span>PO Number:</span><strong>{formatText(asset.poNumber)}</strong></div>
                  <div><span>Invoice Number:</span><strong>{formatText(asset.invoiceNumber)}</strong></div>
                  <div><span>Purchase Cost:</span><strong>{asset.purchaseCost == null ? '-' : String(asset.purchaseCost)}</strong></div>
                  <div><span>Warranty Start:</span><strong>{formatDate(asset.warrantyStart)}</strong></div>
                  <div><span>Warranty End:</span><strong>{formatDate(asset.warrantyUntil)}</strong></div>
                </>
              )}
            </div>
          </div>

          <div className="asset-detail-section-title">Assignment</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Assigned To:</span><strong>{formatAssignedUser()}</strong></div>
              <div><span>Department:</span><strong>{formatText(asset.department)}</strong></div>
              <div><span>Location:</span><strong>{formatText(asset.location)}</strong></div>
              <div><span>Site:</span><strong>{formatText(asset.site)}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Company:</span><strong>{formatText(asset.company)}</strong></div>
              <div><span>Managed By:</span><strong>{formatText(asset.managedBy)}</strong></div>
              <div><span>Assigned On:</span><strong>{formatText(asset.assignedOn ? new Date(asset.assignedOn).toLocaleString('en-GB') : '')}</strong></div>
            </div>
          </div>

          {shouldShowDeviceDetails ? (
            <>
              <div className="asset-detail-section-title">Details</div>
              <div className="asset-detail-grid">
                <div className="asset-detail-col">
                  <div><span>OS:</span><strong>{formatText(asset.os)}</strong></div>
                  <div><span>OS Version:</span><strong>{formatText(asset.osVersion)}</strong></div>
                  <div><span>OS Service Pack:</span><strong>{formatText(asset.osServicePack)}</strong></div>
                  <div><span>Memory (GB):</span><strong>{formatText(asset.ram)}</strong></div>
                  <div><span>Disk Space (GB):</span><strong>{formatText(asset.storage)}</strong></div>
                  <div><span>CPU Speed (GHz):</span><strong>{formatText(asset.cpuSpeed)}</strong></div>
                  <div><span>CPU Core Count:</span><strong>{formatText(asset.cpuCoreCount)}</strong></div>
                </div>
                <div className="asset-detail-col">
                  <div><span>License Key:</span><strong>{formatText(asset.licenseKey)}</strong></div>
                  <div><span>Installed Software:</span><strong>{formatInstalledSoftware()}</strong></div>
                  <div><span>Antivirus:</span><strong>{formatText(asset.antivirus)}</strong></div>
                  <div><span>Patch Status:</span><strong>{formatText(asset.patchStatus)}</strong></div>
                  <div><span>Encryption:</span><strong>{formatText(asset.encryption)}</strong></div>
                  <div><span>MAC Address:</span><strong>{formatText(asset.macAddress)}</strong></div>
                  <div><span>IP Address:</span><strong>{formatText(asset.ipAddress)}</strong></div>
                  <div><span>Supplier:</span><strong>{formatText(asset.supplier)}</strong></div>
                </div>
              </div>
            </>
          ) : null}

          <div className="asset-detail-section-title">Relationships</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Linked Tickets:</span><strong>{asset?.tickets?.length ? asset.tickets.map((t: any) => t.ticketId || t.id).join(', ') : '-'}</strong></div>
            </div>
          </div>

          <div className="asset-detail-section-title">Notes</div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Notes:</span><strong>{formatText(asset.notes)}</strong></div>
            </div>
          </div>

          {customFieldEntries.length > 0 ? (
            <>
              <div className="asset-detail-section-title">Custom Fields</div>
              <div className="asset-detail-grid">
                <div className="asset-detail-col">
                  {customFieldEntries.map((field, idx) => (
                    <div key={`${field.label}-${idx}`}>
                      <span>{field.label}:</span>
                      <strong>{formatText(field.value as any)}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}

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
                      setRetireStatus(next === 'ok' ? 'In Stock' : 'Faulty')
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
                    onChange={(e) => setRetireStatus(e.target.value)}
                    disabled={retireBusy}
                  >
                    {ASSET_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
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





