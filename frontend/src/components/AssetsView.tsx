import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import * as assetService from '../services/asset.service'
import * as userService from '../services/user.service'
import * as ticketService from '../services/ticket.service'
import * as changeService from '../services/change.service'
import * as problemService from '../services/problem.service'
import * as serviceService from '../services/service.service'
import { useAuth } from '../contexts/AuthContext'
import { getRowsPerPage } from '../utils/pagination'
import { loadLeftPanelConfig, type QueueRule, type AssetCategoryConfig } from '../utils/leftPanelConfig'

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
  location?: string | null
  warrantyUntil?: string | null
  purchaseDate?: string | null
  warrantyStart?: string | null
  assignedUserEmail?: string | null
  assignedToId?: number | null
  assignedTo?: { id: number; name?: string | null; email: string } | null
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
  { id: 'relationships', label: 'Relationships' },
  { id: 'notes', label: 'Notes' },
]

type PaginationMeta = {
  page: number
  totalPages: number
  totalRows: number
  rangeStart: number
  rangeEnd: number
}

type AssetsViewProps = {
  toolbarSearch?: string
  controlledPage?: number
  onPageChange?: (nextPage: number) => void
  onPaginationMetaChange?: (meta: PaginationMeta) => void
}

export default function AssetsView({
  toolbarSearch = '',
  controlledPage,
  onPageChange,
  onPaginationMetaChange,
}: AssetsViewProps) {
  const { user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [assets, setAssets] = useState<Asset[]>([])
  const [assetsAll, setAssetsAll] = useState<Asset[]>([])
  const [users, setUsers] = useState<{ id: number; name: string; email: string }[]>([])
  const [tickets, setTickets] = useState<any[]>([])
  const [changes, setChanges] = useState<any[]>([])
  const [problems, setProblems] = useState<any[]>([])
  const [services, setServices] = useState<any[]>([])
  const [search, setSearch] = useState(toolbarSearch)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [form, setForm] = useState({ ...emptyForm })
  const [activeTab, setActiveTab] = useState('identification')
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [panelRules, setPanelRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().assets)
  const [assetCategories, setAssetCategories] = useState<AssetCategoryConfig[]>(() => loadLeftPanelConfig().assetCategories)
  const [assetQueueView, setAssetQueueView] = useState<'assetType' | 'assetGroup' | 'ownership' | 'allAssets'>('assetGroup')
  const [showAssetViewSelector, setShowAssetViewSelector] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [assetQueueFilter, setAssetQueueFilter] = useState<{ type: 'all' | 'rule' | 'assetType' | 'assetGroup'; value?: string }>({ type: 'all' })
  const [expandedAssetGroups, setExpandedAssetGroups] = useState<string[]>([])
  const [filters, setFilters] = useState({
    name: '',
    serial: '',
    category: '',
    status: '',
    model: '',
    assigned: '',
    purchase: '',
  })
  const [assetStatusFilter, setAssetStatusFilter] = useState('All')
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [internalPage, setInternalPage] = useState(1)
  const rowsPerPage = getRowsPerPage()
  const [total, setTotal] = useState(0)
  const currentPage = controlledPage ?? internalPage
  const setPage = (next: number | ((prev: number) => number)) => {
    const resolved = typeof next === 'function' ? next(currentPage) : next
    if (typeof controlledPage === 'number') {
      onPageChange?.(resolved)
      return
    }
    setInternalPage(resolved)
  }
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage))

  const loadAssets = async () => {
    try {
      const data = await assetService.listAssets({ page: currentPage, pageSize: rowsPerPage, q: search })
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
  }, [currentPage, search, refreshTick])

  useEffect(() => {
    setSearch(toolbarSearch)
  }, [toolbarSearch])

  useEffect(() => {
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

  useEffect(() => {
    document.body.classList.add('assets-view-active')
    return () => document.body.classList.remove('assets-view-active')
  }, [])
  useEffect(() => {
    const handler = () => {
      const cfg = loadLeftPanelConfig()
      setPanelRules(cfg.assets)
      setAssetCategories(cfg.assetCategories)
    }
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'assets') return
      if (detail.action === 'new') {
        setEditing(null)
        setForm({ ...emptyForm })
        setShowModal(true)
      }
      if (detail.action === 'filter') return
      if (detail.action === 'refresh') {
        setRefreshTick((v) => v + 1)
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])
  useEffect(() => {
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

  useEffect(() => {
    if (currentPage > totalPages) {
      setPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    const rangeStart = total === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1
    const rangeEnd = Math.min(currentPage * rowsPerPage, total)
    onPaginationMetaChange?.({
      page: currentPage,
      totalPages,
      totalRows: total,
      rangeStart,
      rangeEnd,
    })
  }, [currentPage, total, rowsPerPage, totalPages, onPaginationMetaChange])

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

  const normalizeKey = (value: string) => String(value || '').trim().toLowerCase()
  const getAssetType = (asset: Asset) => String(asset.assetType || asset.category || 'Unknown').trim()
  const configuredCategoryMap = useMemo(() => {
    const visible = assetCategories.filter((category) => {
      if (!Array.isArray(category.visibilityRoles) || category.visibilityRoles.length === 0) return true
      return category.visibilityRoles.map((r) => String(r || '').toUpperCase()).includes(String(user?.role || '').toUpperCase())
    })
    if (!visible.length) return {}
    return Object.fromEntries(
      visible.map((category) => [
        category.label,
        Array.from(new Set((category.subcategories || []).map((s) => String(s || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
      ])
    ) as Record<string, string[]>
  }, [assetCategories, user?.role])

  const assetGroupMap = useMemo(() => {
    if (Object.keys(configuredCategoryMap).length > 0) return configuredCategoryMap
    const grouped = new Map<string, Set<string>>()
    for (const asset of assets) {
      const group = String(asset.category || '').trim() || 'Uncategorized'
      const type = getAssetType(asset)
      if (!grouped.has(group)) grouped.set(group, new Set())
      grouped.get(group)!.add(type)
    }
    return Object.fromEntries(
      Array.from(grouped.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([group, types]) => [group, Array.from(types).sort((a, b) => a.localeCompare(b))])
    ) as Record<string, string[]>
  }, [assets, configuredCategoryMap])

  const assetTypes = useMemo(
    () => Array.from(new Set(assets.map((a) => getAssetType(a)))).sort((a, b) => a.localeCompare(b)),
    [assets]
  )
  useEffect(() => {
    const groups = new Set(Object.keys(assetGroupMap))
    setExpandedAssetGroups((prev) => prev.filter((g) => groups.has(g)))
  }, [assetGroupMap])

  const filtered = useMemo(() => {
    const match = (value: string | undefined | null, q: string) =>
      String(value || '').toLowerCase().includes(q.toLowerCase())
    return assets.filter((asset) => {
      if (assetQueueFilter.type === 'assetType') {
        if (normalizeKey(getAssetType(asset)) !== normalizeKey(String(assetQueueFilter.value || ''))) return false
      } else if (assetQueueFilter.type === 'assetGroup') {
        const groupTypes = assetGroupMap[String(assetQueueFilter.value || '')] || []
        if (!groupTypes.some((t) => normalizeKey(t) === normalizeKey(getAssetType(asset)))) return false
      } else if (assetQueueFilter.type === 'rule') {
        const rule = panelRules.find((r) => r.id === assetQueueFilter.value)
        if (rule) {
          const normalizedStatus = String(asset.status || '').toLowerCase()
          if (rule.field === 'assigned' && rule.value === 'unassigned' && (asset.assignedTo || asset.assignedToId)) return false
          if (rule.field === 'assigned' && rule.value === 'assigned' && !(asset.assignedTo || asset.assignedToId)) return false
          if (rule.field === 'status' && normalizedStatus !== String(rule.value || '').toLowerCase()) return false
          if (rule.field === 'category' && String(asset.category || '').toLowerCase() !== String(rule.value || '').toLowerCase()) return false
          if (rule.field === 'status' && String(rule.value || '').toLowerCase() === 'all') {
            // No-op for explicit all status rules.
          }
        }
      }
      if (filters.name && !match(`${asset.name} ${asset.assetId || ''}`, filters.name)) return false
      if (filters.serial && !match(asset.serial, filters.serial)) return false
      if (filters.category && !match(asset.category, filters.category)) return false
      if (filters.status && !match(asset.status, filters.status)) return false
      if (filters.model && !match(asset.model, filters.model)) return false
      if (filters.assigned) {
        const assigned = asset.assignedTo ? (asset.assignedTo.name || asset.assignedTo.email) : (asset.assignedToId ? `User #${asset.assignedToId}` : 'Unassigned')
        if (!match(assigned, filters.assigned)) return false
      }
      if (filters.purchase && !match(asset.purchaseDate ? asset.purchaseDate.slice(0, 10) : '', filters.purchase)) return false
      return true
    })
  }, [assets, assetQueueFilter, filters, panelRules])
  const assetVisuals = useMemo(() => {
    const totalCount = assets.length
    const inUse = assets.filter((a) => String(a.status || '').toLowerCase() === 'in use').length
    const available = assets.filter((a) => String(a.status || '').toLowerCase() === 'available').length
    const retired = assets.filter((a) => String(a.status || '').toLowerCase() === 'retired').length
    const byCategory = assets.reduce<Record<string, number>>((acc, a) => {
      const key = a.category || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4)
    return { totalCount, inUse, available, retired, topCategories }
  }, [assets])

  const buildDonutSegments = (parts: { value: number; color: string }[]) => {
    const totalCount = parts.reduce((sum, p) => sum + p.value, 0) || 1
    const radius = 32
    const circumference = 2 * Math.PI * radius
    let offset = 0
    return parts.map((p) => {
      const length = (p.value / totalCount) * circumference
      const seg = {
        color: p.color,
        dasharray: `${length} ${circumference - length}`,
        dashoffset: -offset,
      }
      offset += length
      return seg
    })
  }

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

  const openDetail = (asset: Asset) => {
    const id = Number(asset.id)
    if (!Number.isFinite(id) || id <= 0) return
    navigate(`/assets/${id}`)
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const editIdRaw = String(params.get('edit') || '').trim()
    if (!editIdRaw) return
    const editId = Number(editIdRaw)
    if (!Number.isFinite(editId) || editId <= 0) return
    const target = assets.find((a) => Number(a.id) === editId)
    if (!target) return
    openEdit(target)
    params.delete('edit')
    const search = params.toString()
    navigate(search ? `/assets?${search}` : '/assets', { replace: true })
  }, [location.search, assets])

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

  const countForRule = (rule: QueueRule) => {
    if (rule.field === 'assigned' && rule.value === 'assigned') return assets.filter((a) => Boolean(a.assignedTo || a.assignedToId)).length
    if (rule.field === 'assigned' && rule.value === 'unassigned') return assets.filter((a) => !a.assignedTo && !a.assignedToId).length
    if (rule.field === 'status' && String(rule.value || '').toLowerCase() === 'all') return assets.length
    if (rule.field === 'status') return assets.filter((a) => String(a.status || '').toLowerCase() === String(rule.value || '').toLowerCase()).length
    if (rule.field === 'category') return assets.filter((a) => String(a.category || '').toLowerCase() === String(rule.value || '').toLowerCase()).length
    return 0
  }

  const handleDelete = async (asset: Asset) => {
    if (!confirm(`Delete asset "${asset.name}"? This cannot be undone.`)) return
    try {
      await assetService.deleteAsset(asset.id)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      setAssetsAll((prev) => prev.filter((a) => a.id !== asset.id))
      setSelectedAssetId((prev) => (prev === asset.id ? null : prev))
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to delete asset')
    }
  }
  const countByType = (type: string) => assets.filter((a) => normalizeKey(getAssetType(a)) === normalizeKey(type)).length
  const countByGroup = (group: string) => {
    const types = assetGroupMap[group] || []
    return assets.filter((a) => types.some((t) => normalizeKey(t) === normalizeKey(getAssetType(a)))).length
  }
  const renderAssetTypeIcon = (type: string) => {
    const key = normalizeKey(type)
    const common = { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 } as const
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
    if (key.includes('laptop') || key.includes('workstation')) {
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
    if (key.includes('monitor')) {
      return (
        <svg {...common}>
          <rect x="4" y="5" width="16" height="11" rx="1.5" />
          <path d="M10 19h4" />
        </svg>
      )
    }
    if (key.includes('printer')) {
      return (
        <svg {...common}>
          <rect x="7" y="3" width="10" height="5" rx="1" />
          <rect x="5" y="9" width="14" height="8" rx="1.5" />
          <rect x="8" y="14" width="8" height="6" rx="1" />
        </svg>
      )
    }
    if (key.includes('router')) {
      return (
        <svg {...common}>
          <rect x="4" y="12" width="16" height="6" rx="2" />
          <path d="M9 12a3 3 0 0 1 6 0" />
          <circle cx="9" cy="15" r="0.8" fill="currentColor" />
          <circle cx="12" cy="15" r="0.8" fill="currentColor" />
          <circle cx="15" cy="15" r="0.8" fill="currentColor" />
        </svg>
      )
    }
    if (key.includes('application') || key.includes('business')) {
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 8h8M8 12h8M8 16h5" />
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

  const cardRows = useMemo(() => {
    if (assetStatusFilter === 'All') return filtered
    return filtered.filter((a) => String(a.status || '').toLowerCase() === assetStatusFilter.toLowerCase())
  }, [filtered, assetStatusFilter])

  const selectedAsset = useMemo(() => {
    if (!cardRows.length) return null
    if (!selectedAssetId) return cardRows[0]
    return cardRows.find((a) => a.id === selectedAssetId) || cardRows[0]
  }, [cardRows, selectedAssetId])

  useEffect(() => {
    if (!cardRows.length) {
      setSelectedAssetId(null)
      return
    }
    if (!selectedAssetId || !cardRows.some((a) => a.id === selectedAssetId)) {
      setSelectedAssetId(cardRows[0].id)
    }
  }, [cardRows, selectedAssetId])

  const formatDate = (value?: string | null) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  }
  const assetQueueViews = [
    { key: 'assetType', label: 'Assets by Asset Type', icon: 'AT' },
    { key: 'assetGroup', label: 'Assets by Asset Group', icon: 'AG' },
    { key: 'ownership', label: 'Assets by Ownership', icon: 'OW' },
    { key: 'allAssets', label: 'All Assets', icon: 'AL' },
  ] as const
  const currentAssetQueue = assetQueueViews.find((v) => v.key === assetQueueView) || assetQueueViews[0]
  const assetLeftPanel = (!leftPanelCollapsed && queueRoot) ? createPortal(
    <aside className="asset-left-panel">
      <div className="queue-header">
        <div className="queue-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
          </svg>
        </div>
        <div className="queue-title">
          <div className="queue-title-top">
            <button className="queue-title-btn" onClick={() => setShowAssetViewSelector(true)} title="Select asset view">
              <div className="queue-title-text">{currentAssetQueue.label}</div>
            </button>
            <button className="queue-edit-btn" onClick={() => setShowAssetViewSelector(true)} title="Change asset queue view">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
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
        {showAssetViewSelector ? (
          <>
            {assetQueueViews.map((view) => (
              <div
                key={view.key}
                className={`queue-item${assetQueueView === view.key ? ' queue-item-active' : ''}`}
                onClick={() => {
                  setAssetQueueView(view.key)
                  setAssetQueueFilter({ type: 'all' })
                  setShowAssetViewSelector(false)
                }}
              >
                <div className="queue-avatar">{view.icon}</div>
                <div className="queue-name">{view.label}</div>
              </div>
            ))}
          </>
        ) : assetQueueView === 'assetType' ? (
          <>
            {assetTypes.length === 0 ? (
              <div className="queue-item">
                <div className="queue-avatar">i</div>
                <div className="queue-name">No asset types</div>
              </div>
            ) : assetTypes.map((type) => (
              <div
                key={type}
                className={`queue-item${assetQueueFilter.type === 'assetType' && assetQueueFilter.value === type ? ' queue-item-active' : ''}`}
                onClick={() => setAssetQueueFilter((prev) => prev.type === 'assetType' && prev.value === type ? { type: 'all' } : { type: 'assetType', value: type })}
              >
                <div className="queue-avatar">{renderAssetTypeIcon(type)}</div>
                <div className="queue-name">{type}</div>
                <div className="queue-count">{countByType(type)}</div>
              </div>
            ))}
          </>
        ) : assetQueueView === 'assetGroup' ? (
          <>
            {Object.keys(assetGroupMap).length === 0 ? (
              <div className="queue-item">
                <div className="queue-avatar">i</div>
                <div className="queue-name">No asset groups</div>
              </div>
            ) : Object.entries(assetGroupMap).map(([group, types]) => {
              const expanded = expandedAssetGroups.includes(group)
              return (
                <React.Fragment key={group}>
                  <div
                    className={`queue-item queue-item-group${assetQueueFilter.type === 'assetGroup' && assetQueueFilter.value === group ? ' queue-item-active' : ''}`}
                    onClick={() => {
                      setExpandedAssetGroups((prev) => prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group])
                      setAssetQueueFilter((prev) => prev.type === 'assetGroup' && prev.value === group ? { type: 'all' } : { type: 'assetGroup', value: group })
                    }}
                  >
                    <div className="queue-avatar">
                      <span className={`queue-caret${expanded ? ' queue-caret-down' : ''}`}>{'>'}</span>
                    </div>
                    <div className="queue-name">{group}</div>
                    <div className="queue-count">{countByGroup(group)}</div>
                  </div>
                  {expanded && types.map((type) => (
                    <div
                      key={`${group}-${type}`}
                      className={`queue-item queue-item-child${assetQueueFilter.type === 'assetType' && assetQueueFilter.value === type ? ' queue-item-active' : ''}`}
                      onClick={() => setAssetQueueFilter((prev) => prev.type === 'assetType' && prev.value === type ? { type: 'all' } : { type: 'assetType', value: type })}
                    >
                      <div className="queue-avatar">{renderAssetTypeIcon(type)}</div>
                      <div className="queue-name">{type}</div>
                      <div className="queue-count">{countByType(type)}</div>
                    </div>
                  ))}
                </React.Fragment>
              )
            })}
          </>
        ) : assetQueueView === 'ownership' ? (
          <>
            {panelRules.filter((rule) => rule.field === 'assigned').map((rule) => (
              <div
                key={rule.id}
                className={`queue-item${assetQueueFilter.type === 'rule' && assetQueueFilter.value === rule.id ? ' queue-item-active' : ''}`}
                onClick={() => setAssetQueueFilter((prev) => prev.type === 'rule' && prev.value === rule.id ? { type: 'all' } : { type: 'rule', value: rule.id })}
              >
                <div className="queue-avatar">{rule.label.trim()[0]?.toUpperCase() || 'A'}</div>
                <div className="queue-name">{rule.label}</div>
                <div className="queue-count">{countForRule(rule)}</div>
              </div>
            ))}
          </>
        ) : (
          <div
            className={`queue-item${assetQueueFilter.type === 'all' ? ' queue-item-active' : ''}`}
            onClick={() => setAssetQueueFilter({ type: 'all' })}
          >
            <div className="queue-avatar">{currentAssetQueue.icon}</div>
            <div className="queue-name">All Assets</div>
            <div className="queue-count">{assets.length}</div>
          </div>
        )}
      </div>
    </aside>,
    queueRoot
  ) : null

  return (
    <>
      {assetLeftPanel}
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
      <div className="asset-cards-toolbar">
        <select value="All Assets" onChange={() => undefined}>
          <option>All Assets</option>
        </select>
        <label className="asset-cards-status-filter">
          <span>Status:</span>
          <select value={assetStatusFilter} onChange={(e) => setAssetStatusFilter(e.target.value)}>
            <option value="All">All</option>
            <option value="Active">Active</option>
            <option value="In Use">In Use</option>
            <option value="Available">Available</option>
            <option value="In Repair">In Repair</option>
            <option value="Retired">Retired</option>
          </select>
        </label>
        <div className="asset-cards-search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            placeholder="Search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
          />
        </div>
      </div>

      <div className="asset-cards-grid">
        {cardRows.map((asset) => {
          const selected = selectedAsset?.id === asset.id
          return (
            <article key={asset.id} className={`asset-card-tile${selected ? ' selected' : ''}`} onClick={() => setSelectedAssetId(asset.id)}>
              <div className="asset-card-head">
                <div className="asset-card-icon">{renderAssetTypeIcon(asset.assetType || asset.category)}</div>
                <div className="asset-card-head-main">
                  <div className="asset-card-title-row">
                    <h4>{asset.name}</h4>
                    <span className={`asset-status ${String(asset.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{asset.status || 'Active'}</span>
                  </div>
                  <div className="asset-card-divider" />
                </div>
              </div>
              <div className="asset-card-facts">
                <div><span>Asset ID:</span><strong>{asset.assetId || `AST-${asset.id}`}</strong></div>
                <div><span>Category:</span><strong>{asset.category || '-'}</strong></div>
                <div><span>Serial No:</span><strong>{asset.serial || '-'}</strong></div>
                <div><span>Location:</span><strong>{asset.location || '-'}</strong></div>
                <div><span>Assigned To:</span><strong>{asset.assignedTo ? (asset.assignedTo.name || asset.assignedTo.email) : 'Unassigned'}</strong></div>
                <div><span>Warranty:</span><strong>{formatDate(asset.warrantyUntil)}</strong></div>
              </div>
              <div className="asset-card-actions">
                <button className="asset-btn assign" onClick={(e) => { e.stopPropagation(); alert('Assign flow will be wired next.') }}>Assign</button>
                <button className="asset-btn edit" onClick={(e) => { e.stopPropagation(); openEdit(asset) }}>Edit</button>
                {user?.role === 'ADMIN' ? (
                  <button className="asset-btn delete" onClick={(e) => { e.stopPropagation(); handleDelete(asset) }}>Delete</button>
                ) : null}
                <button className="asset-btn view" onClick={(e) => { e.stopPropagation(); openDetail(asset) }}>View</button>
              </div>
            </article>
          )
        })}
      </div>

      {selectedAsset ? (
        <section className="asset-detail-surface">
          <div className="asset-detail-head">
            <div className="asset-card-icon">{renderAssetTypeIcon(selectedAsset.assetType || selectedAsset.category)}</div>
            <div className="asset-detail-head-main">
              <div className="asset-card-title-row">
                <h3>{selectedAsset.name}</h3>
                <span className={`asset-status ${String(selectedAsset.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{selectedAsset.status || 'Active'}</span>
              </div>
              <div className="asset-card-divider" />
            </div>
          </div>
          <div className="asset-detail-grid">
            <div className="asset-detail-col">
              <div><span>Asset ID:</span><strong>{selectedAsset.assetId || `AST-${selectedAsset.id}`}</strong></div>
              <div><span>Serial No:</span><strong>{selectedAsset.serial || '-'}</strong></div>
              <div><span>Location:</span><strong>{selectedAsset.location || '-'}</strong></div>
              <div><span>Assigned To:</span><strong>{selectedAsset.assignedTo ? (selectedAsset.assignedTo.name || selectedAsset.assignedTo.email) : 'Unassigned'}</strong></div>
            </div>
            <div className="asset-detail-col">
              <div><span>Category:</span><strong>{selectedAsset.category || '-'}</strong></div>
              <div><span>Model:</span><strong>{selectedAsset.model || '-'}</strong></div>
              <div><span>Purchase Date:</span><strong>{formatDate(selectedAsset.purchaseDate)}</strong></div>
              <div><span>Warranty Expiry:</span><strong>{formatDate(selectedAsset.warrantyUntil)}</strong></div>
            </div>
          </div>
          <div className="asset-card-actions detail">
            <button className="asset-btn assign" onClick={() => alert('Assign flow will be wired next.')}>Reassign</button>
            <button className="asset-btn edit" onClick={() => openEdit(selectedAsset)}>Edit</button>
            <button className="asset-btn delete" onClick={() => handleDelete(selectedAsset)}>Delete</button>
            <button className="asset-btn view" onClick={() => openDetail(selectedAsset)}>View</button>
          </div>
        </section>
      ) : (
        <div className="assets-empty">No assets found.</div>
      )}

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
    </>
  )
}









