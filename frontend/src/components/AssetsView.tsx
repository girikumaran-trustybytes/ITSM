import React, { useEffect, useMemo, useState } from 'react'
import * as assetService from '../services/asset.service'
import * as userService from '../services/user.service'
import * as ticketService from '../services/ticket.service'
import * as changeService from '../services/change.service'
import * as problemService from '../services/problem.service'
import * as serviceService from '../services/service.service'
import { useAuth } from '../contexts/AuthContext'

type Asset = {
  id: number
  assetId?: string
  name: string
  assetType?: string
  category: string
  subcategory?: string | null
  status: string
  serial?: string | null
  model?: string | null
  assignedToId?: number | null
  assignedTo?: { id: number; name?: string | null; email: string } | null
  purchaseDate?: string | null
}

const emptyForm = {
  assetId: '',
  name: '',
  assetType: 'Laptop',
  category: '',
  subcategory: '',
  ciType: 'Hardware',
  serial: '',
  assetTag: '',
  barcode: '',
  assignedToId: '',
  assignedUserEmail: '',
  department: '',
  location: '',
  site: '',
  costCentre: '',
  manager: '',
  assetOwner: '',
  manufacturer: '',
  model: '',
  cpu: '',
  ram: '',
  storage: '',
  macAddress: '',
  ipAddress: '',
  biosVersion: '',
  firmware: '',
  os: '',
  osVersion: '',
  licenseKey: '',
  installedSoftwareText: '',
  antivirus: '',
  patchStatus: '',
  encryption: '',
  purchaseDate: '',
  supplier: '',
  poNumber: '',
  invoiceNumber: '',
  purchaseCost: '',
  warrantyStart: '',
  warrantyUntil: '',
  amcSupport: '',
  depreciationEnd: '',
  status: 'In Use',
  lifecycleStage: 'Active',
  condition: 'Good',
  deploymentDate: '',
  lastAuditDate: '',
  endOfLife: '',
  disposalDate: '',
  disposalMethod: '',
  securityClassification: 'Corporate',
  dataSensitivity: 'Internal',
  mdmEnrolled: 'no',
  complianceStatus: 'Compliant',
  riskLevel: 'Low',
  lastSecurityScan: '',
  parentAssetId: '',
  notes: '',
  linkedTicketIds: [] as string[],
  changeIds: [] as number[],
  problemIds: [] as number[],
  serviceIds: [] as number[],
}

const tabs = [
  { id: 'identification', label: 'Identification' },
  { id: 'ownership', label: 'Ownership' },
  { id: 'hardware', label: 'Hardware' },
  { id: 'software', label: 'OS & Software' },
  { id: 'financial', label: 'Financial' },
  { id: 'lifecycle', label: 'Lifecycle' },
  { id: 'compliance', label: 'Compliance' },
  { id: 'relationships', label: 'Relationships' },
  { id: 'notes', label: 'Notes' },
]

export default function AssetsView() {
  const { user } = useAuth()
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsAll, setAssetsAll] = useState<Asset[]>([])
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [changes, setChanges] = useState<any[]>([])
  const [problems, setProblems] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [activeTab, setActiveTab] = useState('identification')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)

  const loadAssets = async () => {
    try {
      const data = await assetService.listAssets({ page, pageSize, q: search })
      const items = Array.isArray(data) ? data : (data?.items || [])
      setAssets(items)
      setAssetsAll(items)
      setTotal(Number(data?.total || items.length || 0))
    } catch (e) {
      console.warn('Failed to fetch assets', e)
    }
  }

  useEffect(() => {
    loadAssets()
  }, [page, search])

  const loadUsers = async (q = '') => {
    try {
      const data = await userService.listUsers({ q, limit: 50 })
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch users', e)
    }
  }

  const loadRelations = async () => {
    try {
      const ticketData = await ticketService.listTickets({ page: 1, pageSize: 100 })
      setTickets(Array.isArray(ticketData) ? ticketData : (ticketData?.items || []))
    } catch {}
    try {
      const changeData = await changeService.listChanges()
      setChanges(Array.isArray(changeData) ? changeData : [])
    } catch {}
    try {
      const problemData = await problemService.listProblems()
      setProblems(Array.isArray(problemData) ? problemData : [])
    } catch {}
    try {
      const serviceData = await serviceService.listServices()
      setServices(Array.isArray(serviceData) ? serviceData : [])
    } catch {}
  }

  const filtered = useMemo(() => assets, [assets])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm })
    setActiveTab('identification')
    loadUsers()
    loadRelations()
    setShowModal(true)
  }

  const openEdit = (asset: Asset) => {
    setEditing(asset)
    setForm({
      ...emptyForm,
      assetId: asset.assetId || '',
      name: asset.name || '',
      assetType: asset.assetType || 'Laptop',
      category: asset.category || '',
      subcategory: asset.subcategory || '',
      status: asset.status || 'In Use',
      serial: asset.serial || '',
      model: asset.model || '',
      assignedToId: asset.assignedToId ? String(asset.assignedToId) : '',
      purchaseDate: asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '',
    })
    setActiveTab('identification')
    loadUsers()
    loadRelations()
    setShowModal(true)
  }

  const toIsoDate = (value: string) => (value ? new Date(value).toISOString() : null)

  const handleSave = async () => {
    if (!form.assetId.trim() || !form.name.trim() || !form.assetType.trim() || !form.category.trim() || !form.status.trim()) {
      alert('Asset ID, Name, Asset Type, Category, and Status are required.')
      return
    }
    setIsSaving(true)
    const payload = {
      assetId: form.assetId.trim(),
      name: form.name.trim(),
      assetType: form.assetType.trim(),
      category: form.category.trim(),
      subcategory: form.subcategory.trim() || null,
      ciType: form.ciType.trim() || null,
      serial: form.serial.trim() || null,
      assetTag: form.assetTag.trim() || null,
      barcode: form.barcode.trim() || null,
      assignedToId: form.assignedToId ? Number(form.assignedToId) : null,
      assignedUserEmail: form.assignedUserEmail.trim() || null,
      department: form.department.trim() || null,
      location: form.location.trim() || null,
      site: form.site.trim() || null,
      costCentre: form.costCentre.trim() || null,
      manager: form.manager.trim() || null,
      assetOwner: form.assetOwner.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      cpu: form.cpu.trim() || null,
      ram: form.ram.trim() || null,
      storage: form.storage.trim() || null,
      macAddress: form.macAddress.trim() || null,
      ipAddress: form.ipAddress.trim() || null,
      biosVersion: form.biosVersion.trim() || null,
      firmware: form.firmware.trim() || null,
      os: form.os.trim() || null,
      osVersion: form.osVersion.trim() || null,
      licenseKey: form.licenseKey.trim() || null,
      installedSoftware: form.installedSoftwareText ? form.installedSoftwareText.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      antivirus: form.antivirus.trim() || null,
      patchStatus: form.patchStatus.trim() || null,
      encryption: form.encryption.trim() || null,
      purchaseDate: toIsoDate(form.purchaseDate),
      supplier: form.supplier.trim() || null,
      poNumber: form.poNumber.trim() || null,
      invoiceNumber: form.invoiceNumber.trim() || null,
      purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : null,
      warrantyStart: toIsoDate(form.warrantyStart),
      warrantyUntil: toIsoDate(form.warrantyUntil),
      amcSupport: form.amcSupport.trim() || null,
      depreciationEnd: toIsoDate(form.depreciationEnd),
      status: form.status.trim(),
      lifecycleStage: form.lifecycleStage.trim() || null,
      condition: form.condition.trim() || null,
      deploymentDate: toIsoDate(form.deploymentDate),
      lastAuditDate: toIsoDate(form.lastAuditDate),
      endOfLife: toIsoDate(form.endOfLife),
      disposalDate: toIsoDate(form.disposalDate),
      disposalMethod: form.disposalMethod.trim() || null,
      securityClassification: form.securityClassification.trim() || null,
      dataSensitivity: form.dataSensitivity.trim() || null,
      mdmEnrolled: form.mdmEnrolled === 'yes',
      complianceStatus: form.complianceStatus.trim() || null,
      riskLevel: form.riskLevel.trim() || null,
      lastSecurityScan: toIsoDate(form.lastSecurityScan),
      parentAssetId: form.parentAssetId ? Number(form.parentAssetId) : null,
      notes: form.notes.trim() || null,
      linkedTicketIds: form.linkedTicketIds,
      changeIds: form.changeIds,
      problemIds: form.problemIds,
      serviceIds: form.serviceIds,
    }
    try {
      if (editing) {
        await assetService.updateAsset(editing.id, payload)
      } else {
        await assetService.createAsset(payload)
      }
      setShowModal(false)
      setEditing(null)
      await loadAssets()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to save asset')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`Delete asset "${asset.name}"? This cannot be undone.`)) return
    try {
      await assetService.deleteAsset(asset.id)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to delete asset')
    }
  }

  return (
    <div className="assets-view">
      <div className="assets-header">
        <div className="assets-title">
          <h2>Assets</h2>
          <p>Track hardware and lifecycle status</p>
        </div>
        <div className="assets-actions">
          <input
            className="assets-search"
            placeholder="Search assets..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
          <button className="assets-primary-btn" onClick={openCreate}>+ New Asset</button>
        </div>
      </div>

      <div className="assets-table">
        <div className="assets-row assets-head">
          <div className="assets-col name">Asset</div>
          <div className="assets-col serial">Serial</div>
          <div className="assets-col category">Category</div>
          <div className="assets-col status">Status</div>
          <div className="assets-col vendor">Model</div>
          <div className="assets-col assigned">Assigned To</div>
          <div className="assets-col date">Purchase</div>
          <div className="assets-col actions">Actions</div>
        </div>
        {filtered.map((asset) => (
          <div key={asset.id} className="assets-row">
            <div className="assets-col name">
              <div style={{ fontWeight: 700 }}>{asset.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{asset.assetId || '-'}</div>
            </div>
            <div className="assets-col serial">{asset.serial || '-'}</div>
            <div className="assets-col category">{asset.category}</div>
            <div className="assets-col status">
              <span className={`asset-status ${asset.status.toLowerCase().replace(/\s+/g, '-')}`}>{asset.status}</span>
            </div>
            <div className="assets-col vendor">{asset.model || '-'}</div>
            <div className="assets-col assigned">
              {asset.assignedTo ? (asset.assignedTo.name || asset.assignedTo.email) : (asset.assignedToId ? `User #${asset.assignedToId}` : 'Unassigned')}
            </div>
            <div className="assets-col date">{asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '-'}</div>
            <div className="assets-col actions">
              <button className="assets-link-btn" onClick={() => openEdit(asset)}>Edit</button>
              {user?.role === 'ADMIN' && (
                <button className="assets-link-btn danger" onClick={() => handleDelete(asset)}>Delete</button>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="assets-empty">No assets found.</div>
        )}
        {filtered.length > 0 && (
          <div className="assets-pagination">
            <button className="assets-page-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
            <span>Page {page}</span>
            <button
              className="assets-page-btn"
              disabled={page * pageSize >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content asset-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit Asset' : 'New Asset'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="asset-tabs">
                {tabs.map((t) => (
                  <button key={t.id} className={`asset-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
                    {t.label}
                  </button>
                ))}
              </div>
              {activeTab === 'identification' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Asset ID *</label>
                      <input className="form-input" value={form.assetId} onChange={(e) => setForm({ ...form, assetId: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Asset Name *</label>
                      <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Asset Type *</label>
                      <input className="form-input" value={form.assetType} onChange={(e) => setForm({ ...form, assetType: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Category *</label>
                      <input className="form-input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Sub-Category</label>
                      <input className="form-input" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">CI Type</label>
                      <input className="form-input" value={form.ciType} onChange={(e) => setForm({ ...form, ciType: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Serial Number</label>
                      <input className="form-input" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Asset Tag</label>
                      <input className="form-input" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Barcode / QR</label>
                      <input className="form-input" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Status *</label>
                      <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        <option>In Use</option>
                        <option>Available</option>
                        <option>In Repair</option>
                        <option>Retired</option>
                        <option>Disposed</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'ownership' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Assigned User</label>
                      <input className="form-input" placeholder="Search users..." onChange={(e) => loadUsers(e.target.value)} />
                      <select className="form-select" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                        <option value="">Unassigned</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name || u.email} ({u.email})</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-section">
                      <label className="form-label">User Email</label>
                      <input className="form-input" value={form.assignedUserEmail} onChange={(e) => setForm({ ...form, assignedUserEmail: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Department</label>
                      <input className="form-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Location</label>
                      <input className="form-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Site</label>
                      <input className="form-input" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Cost Centre</label>
                      <input className="form-input" value={form.costCentre} onChange={(e) => setForm({ ...form, costCentre: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Manager</label>
                      <input className="form-input" value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Asset Owner</label>
                      <input className="form-input" value={form.assetOwner} onChange={(e) => setForm({ ...form, assetOwner: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'hardware' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Manufacturer</label>
                      <input className="form-input" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Model</label>
                      <input className="form-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">CPU</label>
                      <input className="form-input" value={form.cpu} onChange={(e) => setForm({ ...form, cpu: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">RAM</label>
                      <input className="form-input" value={form.ram} onChange={(e) => setForm({ ...form, ram: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Storage</label>
                      <input className="form-input" value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">MAC Address</label>
                      <input className="form-input" value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">IP Address</label>
                      <input className="form-input" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">BIOS Version</label>
                      <input className="form-input" value={form.biosVersion} onChange={(e) => setForm({ ...form, biosVersion: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Firmware</label>
                      <input className="form-input" value={form.firmware} onChange={(e) => setForm({ ...form, firmware: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'software' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">OS</label>
                      <input className="form-input" value={form.os} onChange={(e) => setForm({ ...form, os: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">OS Version</label>
                      <input className="form-input" value={form.osVersion} onChange={(e) => setForm({ ...form, osVersion: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">License Key</label>
                      <input className="form-input" value={form.licenseKey} onChange={(e) => setForm({ ...form, licenseKey: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Installed Software (comma separated)</label>
                      <input className="form-input" value={form.installedSoftwareText} onChange={(e) => setForm({ ...form, installedSoftwareText: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Antivirus</label>
                      <input className="form-input" value={form.antivirus} onChange={(e) => setForm({ ...form, antivirus: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Patch Status</label>
                      <input className="form-input" value={form.patchStatus} onChange={(e) => setForm({ ...form, patchStatus: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Encryption</label>
                      <input className="form-input" value={form.encryption} onChange={(e) => setForm({ ...form, encryption: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'financial' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Purchase Date</label>
                      <input className="form-input" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Supplier</label>
                      <input className="form-input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">PO Number</label>
                      <input className="form-input" value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Invoice Number</label>
                      <input className="form-input" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Purchase Cost</label>
                      <input className="form-input" type="number" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Warranty Start</label>
                      <input className="form-input" type="date" value={form.warrantyStart} onChange={(e) => setForm({ ...form, warrantyStart: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Warranty End</label>
                      <input className="form-input" type="date" value={form.warrantyUntil} onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">AMC / Support</label>
                      <input className="form-input" value={form.amcSupport} onChange={(e) => setForm({ ...form, amcSupport: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Depreciation End</label>
                      <input className="form-input" type="date" value={form.depreciationEnd} onChange={(e) => setForm({ ...form, depreciationEnd: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'lifecycle' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Lifecycle Stage</label>
                      <input className="form-input" value={form.lifecycleStage} onChange={(e) => setForm({ ...form, lifecycleStage: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Condition</label>
                      <input className="form-input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Deployment Date</label>
                      <input className="form-input" type="date" value={form.deploymentDate} onChange={(e) => setForm({ ...form, deploymentDate: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Last Audit Date</label>
                      <input className="form-input" type="date" value={form.lastAuditDate} onChange={(e) => setForm({ ...form, lastAuditDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">End-of-Life</label>
                      <input className="form-input" type="date" value={form.endOfLife} onChange={(e) => setForm({ ...form, endOfLife: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Disposal Date</label>
                      <input className="form-input" type="date" value={form.disposalDate} onChange={(e) => setForm({ ...form, disposalDate: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Disposal Method</label>
                      <input className="form-input" value={form.disposalMethod} onChange={(e) => setForm({ ...form, disposalMethod: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'compliance' && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Security Classification</label>
                      <input className="form-input" value={form.securityClassification} onChange={(e) => setForm({ ...form, securityClassification: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Data Sensitivity</label>
                      <input className="form-input" value={form.dataSensitivity} onChange={(e) => setForm({ ...form, dataSensitivity: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">MDM Enrolled</label>
                      <select className="form-select" value={form.mdmEnrolled} onChange={(e) => setForm({ ...form, mdmEnrolled: e.target.value })}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                    <div className="form-section">
                      <label className="form-label">Compliance Status</label>
                      <input className="form-input" value={form.complianceStatus} onChange={(e) => setForm({ ...form, complianceStatus: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Risk Level</label>
                      <input className="form-input" value={form.riskLevel} onChange={(e) => setForm({ ...form, riskLevel: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Last Security Scan</label>
                      <input className="form-input" type="date" value={form.lastSecurityScan} onChange={(e) => setForm({ ...form, lastSecurityScan: e.target.value })} />
                    </div>
                  </div>
                </>
              )}

              {activeTab === 'relationships' && (
                <>
                  <div className="form-section">
                    <label className="form-label">Linked Tickets</label>
                    <select multiple className="form-select" value={form.linkedTicketIds} onChange={(e) => setForm({ ...form, linkedTicketIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                      {tickets.map((t) => (
                        <option key={t.ticketId || t.id} value={t.ticketId || t.id}>{t.ticketId || t.id} - {t.subject || t.description || ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-section">
                    <label className="form-label">Linked Changes</label>
                    <select multiple className="form-select" value={form.changeIds} onChange={(e) => setForm({ ...form, changeIds: Array.from(e.target.selectedOptions).map(o => Number(o.value)) })}>
                      {changes.map((c) => (
                        <option key={c.id} value={c.id}>{c.code} - {c.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-section">
                    <label className="form-label">Linked Problems</label>
                    <select multiple className="form-select" value={form.problemIds} onChange={(e) => setForm({ ...form, problemIds: Array.from(e.target.selectedOptions).map(o => Number(o.value)) })}>
                      {problems.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} - {p.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-section">
                    <label className="form-label">Related Services</label>
                    <select multiple className="form-select" value={form.serviceIds} onChange={(e) => setForm({ ...form, serviceIds: Array.from(e.target.selectedOptions).map(o => Number(o.value)) })}>
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-section">
                    <label className="form-label">Parent Asset</label>
                    <select className="form-select" value={form.parentAssetId} onChange={(e) => setForm({ ...form, parentAssetId: e.target.value })}>
                      <option value="">None</option>
                      {assetsAll.map((a) => (
                        <option key={a.id} value={a.id}>{a.assetId || a.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {activeTab === 'notes' && (
                <>
                  <div className="form-section">
                    <label className="form-label">Notes</label>
                    <textarea className="form-input" style={{ minHeight: 120 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-submit" disabled={isSaving} onClick={handleSave}>
                {isSaving ? 'Saving...' : 'Save Asset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
