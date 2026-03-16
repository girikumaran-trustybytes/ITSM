import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import * as assetService from '../modules/assets/services/asset.service'
import * as userService from '../modules/users/services/user.service'
import * as ticketService from '../modules/tickets/services/ticket.service'
import * as supplierService from '../services/supplier.service'
import { useAuth } from '../contexts/AuthContext'
import { getRowsPerPage } from '../utils/pagination'
import { loadLeftPanelConfig, type QueueRule, type AssetCategoryConfig } from '../utils/leftPanelConfig'
import { getAssetTypesSettings, type AssetTypesSettings, type AssetTypeConfig, type AssetFieldConfig } from '../services/asset-types.service'
import { renderAssetTypeIcon } from '../utils/assetTypeIcons'

type Asset = {
  id: number
  assetId?: string
  name?: string
  displayName?: string
  description?: string
  assetType?: string
  assetTypeId?: string | null
  category: string
  subcategory?: string | null
  status: string
  impact?: string | null
  usageType?: string | null
  serial?: string | null
  assetTag?: string | null
  barcode?: string | null
  domain?: string | null
  region?: string | null
  availabilityZone?: string | null
  managedByGroup?: string | null
  company?: string | null
  usedBy?: string | null
  managedBy?: string | null
  assignedOn?: string | null
  model?: string | null
  manufacturer?: string | null
  hardwareType?: string | null
  physicalSubtype?: string | null
  virtualSubtype?: string | null
  product?: string | null
  cpu?: string | null
  ram?: string | null
  storage?: string | null
  cpuSpeed?: string | null
  cpuCoreCount?: string | null
  osServicePack?: string | null
  macAddress?: string | null
  uuid?: string | null
  hostname?: string | null
  lastLoginBy?: string | null
  ipAddress?: string | null
  biosVersion?: string | null
  firmware?: string | null
  os?: string | null
  osVersion?: string | null
  licenseKey?: string | null
  installedSoftware?: string[] | null
  installedSoftwareText?: string | null
  antivirus?: string | null
  patchStatus?: string | null
  encryption?: string | null
  vendor?: string | null
  acquisitionType?: string | null
  rentalProvider?: string | null
  rentalStartDate?: string | null
  rentalEndDate?: string | null
  rentalMonthlyCost?: number | null
  rentalTotalCost?: number | null
  maintenanceIncluded?: boolean | null
  contractNumber?: string | null
  returnCondition?: string | null
  location?: string | null
  warrantyUntil?: string | null
  purchaseDate?: string | null
  warrantyStart?: string | null
  acquisitionDate?: string | null
  supplier?: string | null
  poNumber?: string | null
  invoiceNumber?: string | null
  purchaseCost?: number | null
  cost?: number | null
  salvageValue?: number | null
  depreciationType?: string | null
  warrantyYears?: number | null
  warrantyMonths?: number | null
  warrantyExpiryAt?: string | null
  amcSupport?: string | null
  depreciationEnd?: string | null
  lifecycleStage?: string | null
  condition?: string | null
  deploymentDate?: string | null
  lastAuditDate?: string | null
  endOfLife?: string | null
  disposalDate?: string | null
  disposalMethod?: string | null
  securityClassification?: string | null
  dataSensitivity?: string | null
  mdmEnrolled?: boolean | null
  complianceStatus?: string | null
  riskLevel?: string | null
  lastSecurityScan?: string | null
  itemId?: string | null
  itemName?: string | null
  publicAddress?: string | null
  instanceState?: string | null
  instanceType?: string | null
  provider?: string | null
  creationTimestamp?: string | null
  assignedUserEmail?: string | null
  assignedToId?: number | null
  assignedTo?: { id: number; name?: string | null; email: string } | null
  customFields?: Record<string, any>
}

const DEFAULT_ASSET_CATEGORY = 'Uncategorised'

const emptyForm = {
  assetId: '',
  assetType: 'Laptop',
  assetTypeId: '',
  assetTag: '',
  manufacturer: '',
  model: '',
  serial: '',
  acquisitionType: 'purchase',
  purchaseDate: '',
  vendor: '',
  cost: '',
  salvageValue: '',
  acquisitionDate: '',
  poNumber: '',
  invoiceNumber: '',
  purchaseCost: '',
  warrantyStart: '',
  warrantyUntil: '',
  rentalProvider: '',
  rentalStartDate: '',
  rentalEndDate: '',
  rentalMonthlyCost: '',
  rentalTotalCost: '',
  maintenanceIncluded: false,
  contractNumber: '',
  returnCondition: '',
  assignedToId: '',
  assignedUserEmail: '',
  department: '',
  location: '',
  site: '',
  status: 'Unassigned',
  company: '',
  managedBy: '',
  assignedOn: '',
  os: '',
  osVersion: '',
  osServicePack: '',
  ram: '',
  storage: '',
  cpuSpeed: '',
  cpuCoreCount: '',
  licenseKey: '',
  installedSoftwareText: '',
  antivirus: '',
  patchStatus: '',
  encryption: '',
  macAddress: '',
  ipAddress: '',
  supplier: '',
  notes: '',
  linkedTicketIds: [] as string[],
  customFields: {} as Record<string, any>,
}

const tabs = [
  { id: 'identification', label: 'Identification' },
  { id: 'details', label: 'Details' },
  { id: 'assignment', label: 'Assigned to' },
  { id: 'information', label: 'Information' },
  { id: 'relationships', label: 'Relate tickets' },
  { id: 'notes', label: 'Notes & Attachments' },
]
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
  const [suppliers, setSuppliers] = useState<Array<{ id: number; companyName?: string; name?: string }>>([])
  const [search, setSearch] = useState(toolbarSearch)
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<Asset | null>(null)
  const [assetUploadFiles, setAssetUploadFiles] = useState<File[]>([])
  const [form, setForm] = useState({ ...emptyForm })
  const [activeTab, setActiveTab] = useState('details')
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [panelRules, setPanelRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().assets)
  const [assetTypesConfig, setAssetTypesConfig] = useState<AssetTypesSettings>({ types: [] })
  const [assetTypesLoading, setAssetTypesLoading] = useState(false)
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
    }
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])

  const loadAssetTypesConfig = async () => {
    try {
      setAssetTypesLoading(true)
      const data = await getAssetTypesSettings()
      setAssetTypesConfig(data)
    } catch (error) {
      console.warn('Failed to load asset types config', error)
    } finally {
      setAssetTypesLoading(false)
    }
  }

  useEffect(() => {
    loadAssetTypesConfig()
  }, [])

  useEffect(() => {
    const handler = () => {
      loadAssetTypesConfig()
    }
    window.addEventListener('asset-types-updated', handler as EventListener)
    return () => window.removeEventListener('asset-types-updated', handler as EventListener)
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
      const data = await userService.listUsers({ q, limit: 50, role: 'USER' })
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
  }

  const loadSuppliers = async () => {
    try {
      const data = await supplierService.listSuppliers()
      setSuppliers(Array.isArray(data) ? data : (data?.items || []))
    } catch {
      setSuppliers([])
    }
  }

  const normalizeKey = (value: string) => String(value || '').trim().toLowerCase()
  const getAssetType = (asset: Asset) => String(asset.assetType || asset.category || 'Unknown').trim()
  const configuredCategoryMap = useMemo(() => ({} as Record<string, string[]>), [])
  const assetGroupMap = useMemo(() => {
    const grouped = new Map<string, Set<string>>()
    if (Object.keys(configuredCategoryMap).length > 0) {
      Object.entries(configuredCategoryMap).forEach(([group, types]) => {
        if (!grouped.has(group)) grouped.set(group, new Set())
        types.forEach((type) => grouped.get(group)!.add(type))
      })
    }
    if (!grouped.has(DEFAULT_ASSET_CATEGORY)) grouped.set(DEFAULT_ASSET_CATEGORY, new Set())
    for (const asset of assets) {
      const group = String(asset.category || '').trim() || DEFAULT_ASSET_CATEGORY
      const type = getAssetType(asset)
      if (!grouped.has(group)) grouped.set(group, new Set())
      grouped.get(group)!.add(type)
    }
    return Object.fromEntries(
      Array.from(grouped.entries())
        .sort(([a], [b]) => {
          const aKey = String(a || '').trim().toLowerCase()
          const bKey = String(b || '').trim().toLowerCase()
          const isAUncategorised = aKey === 'uncategorised' || aKey === 'uncategorized'
          const isBUncategorised = bKey === 'uncategorised' || bKey === 'uncategorized'
          if (isAUncategorised && !isBUncategorised) return -1
          if (!isAUncategorised && isBUncategorised) return 1
          return a.localeCompare(b)
        })
        .map(([group, types]) => [group, Array.from(types).sort((a, b) => a.localeCompare(b))])
    ) as Record<string, string[]>
  }, [assets, configuredCategoryMap])

  const assetTypes = useMemo(() => {
    const fromAssets = assets.map((a) => getAssetType(a))
    const fromConfig = (assetTypesConfig.types || []).map((t) => t.label)
    return Array.from(new Set([...fromAssets, ...fromConfig].filter(Boolean))).sort((a, b) => a.localeCompare(b))
  }, [assets, assetTypesConfig.types])
  const assetTypeOptions = useMemo(() => {
    const types = Array.isArray(assetTypesConfig.types)
      ? assetTypesConfig.types.filter((t) => t.parentId)
      : []
    const byId = new Map<string, AssetTypeConfig>()
    assetTypesConfig.types.forEach((t) => {
      byId.set(t.id, t)
    })
    const pathMemo = new Map<string, string>()
    const buildPath = (type: AssetTypeConfig): string => {
      if (pathMemo.has(type.id)) return pathMemo.get(type.id) as string
      const parent = type.parentId ? byId.get(type.parentId) : null
      const label = parent ? `${buildPath(parent)} / ${type.label}` : type.label
      pathMemo.set(type.id, label)
      return label
    }
    const options = types.map((type) => {
      const parent = type.parentId ? byId.get(type.parentId) : null
      const parentLabel = parent?.label || ''
      return {
        id: type.id,
        label: buildPath(type),
        rawLabel: type.label,
        displayLabel: parentLabel ? `${type.label} (${parentLabel})` : type.label,
        icon: type.icon || '',
      }
    })
    return options.sort((a, b) => (a.displayLabel || a.label).localeCompare(b.displayLabel || b.label))
  }, [assetTypesConfig.types])
  const selectedAssetType = useMemo(() => {
    if (form.assetTypeId) {
      return assetTypesConfig.types.find((t) => t.id === form.assetTypeId) || null
    }
    const fallback = String(form.assetType || '').toLowerCase()
    return assetTypesConfig.types.find((t) => t.label.toLowerCase() === fallback) || null
  }, [assetTypesConfig.types, form.assetTypeId, form.assetType])
  const selectedAssetFields = selectedAssetType?.fields || []
  const shouldShowDeviceDetails = useMemo(() => {
    const rawLabel = selectedAssetType?.label || form.assetType || ''
    const tokens = String(rawLabel || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
    const allowed = new Set(['laptop', 'workstation', 'desktop', 'pc'])
    return tokens.some((token) => allowed.has(token))
  }, [selectedAssetType?.label, form.assetType])
  const selectedAssetTypeValue = useMemo(() => {
    if (form.assetTypeId) return form.assetTypeId
    const targetLabel = String(form.assetType || '').toLowerCase()
    const match = assetTypeOptions.find((opt) => opt.label.toLowerCase() === targetLabel || String(opt.rawLabel || '').toLowerCase() === targetLabel)
    return match?.id || ''
  }, [assetTypeOptions, form.assetTypeId, form.assetType])
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
      if (filters.name && !match(`${asset.assetId || ''}`, filters.name)) return false
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
    const byCategory = assets.reduce<Record<string, number>>((acc, a) => {
      const key = a.category || 'Unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 4)
    return { totalCount, topCategories }
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

  const openCreate = async () => {
    const firstType = assetTypeOptions[0]
    setEditing(null)
    const nextId = await assetService.getNextAssetId().catch(() => ({ assetId: '' as string }))
    setForm({
      ...emptyForm,
      assetId: String(nextId?.assetId || ''),
      assetType: firstType?.label || 'Uncategorised',
      assetTypeId: firstType && !String(firstType.id).startsWith('legacy-') ? firstType.id : '',
    })
    setAssetUploadFiles([])
    setActiveTab('identification')
    loadUsers()
    loadRelations()
    loadSuppliers()
    setShowModal(true)
  }

  const toInputDate = (value?: string | null) => (value ? value.slice(0, 10) : '')
  const toInputDateTime = (value?: string | null) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 16)
  }

  const openEdit = (asset: Asset) => {
    setEditing(asset)
    setForm({
      ...emptyForm,
      assetId: asset.assetId || '',
      assetType: asset.assetType || 'Laptop',
      assetTypeId: asset.assetTypeId || '',
      serial: asset.serial || '',
      assetTag: asset.assetTag || '',
      assignedUserEmail: asset.assignedUserEmail || '',
      model: asset.model || '',
      manufacturer: asset.manufacturer || '',
      ram: asset.ram || '',
      storage: asset.storage || '',
      cpuSpeed: asset.cpuSpeed || '',
      cpuCoreCount: asset.cpuCoreCount || '',
      osServicePack: asset.osServicePack || '',
      macAddress: asset.macAddress || '',
      ipAddress: asset.ipAddress || '',
      os: asset.os || '',
      osVersion: asset.osVersion || '',
      licenseKey: asset.licenseKey || '',
      installedSoftwareText: Array.isArray(asset.installedSoftware) ? asset.installedSoftware.join(', ') : (asset.installedSoftwareText || ''),
      antivirus: asset.antivirus || '',
      patchStatus: asset.patchStatus || '',
      encryption: asset.encryption || '',
      assignedToId: asset.assignedToId ? String(asset.assignedToId) : '',
      company: asset.company || '',
      managedBy: asset.managedBy || '',
      assignedOn: toInputDateTime(asset.assignedOn),
      status: asset.status || 'Unassigned',
      department: asset.department || '',
      location: asset.location || '',
      site: asset.site || '',
      supplier: asset.supplier || '',
      acquisitionType: asset.acquisitionType || 'purchase',
      purchaseDate: toInputDate(asset.purchaseDate),
      vendor: asset.vendor || '',
      cost: asset.cost != null ? String(asset.cost) : '',
      salvageValue: asset.salvageValue != null ? String(asset.salvageValue) : '',
      acquisitionDate: toInputDate(asset.acquisitionDate),
      poNumber: asset.poNumber || '',
      invoiceNumber: asset.invoiceNumber || '',
      purchaseCost: asset.purchaseCost != null ? String(asset.purchaseCost) : '',
      warrantyStart: toInputDate(asset.warrantyStart),
      warrantyUntil: toInputDate(asset.warrantyUntil),
      rentalProvider: asset.rentalProvider || '',
      rentalStartDate: toInputDate(asset.rentalStartDate),
      rentalEndDate: toInputDate(asset.rentalEndDate),
      rentalMonthlyCost: asset.rentalMonthlyCost != null ? String(asset.rentalMonthlyCost) : '',
      rentalTotalCost: asset.rentalTotalCost != null ? String(asset.rentalTotalCost) : '',
      maintenanceIncluded: Boolean(asset.maintenanceIncluded),
      contractNumber: asset.contractNumber || '',
      returnCondition: asset.returnCondition || '',
      customFields: asset.customFields || {},
    })
    setAssetUploadFiles([])
    setActiveTab('identification')
    loadUsers()
    loadRelations()
    loadSuppliers()
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
  const toIsoDateTime = (value: string) => (value ? new Date(value).toISOString() : null)
  const updateAssetTypeSelection = (value: string) => {
    const option = assetTypeOptions.find((opt) => opt.id === value) ||
      assetTypeOptions.find((opt) => opt.label.toLowerCase() === String(value || '').toLowerCase() || String(opt.rawLabel || '').toLowerCase() === String(value || '').toLowerCase())
    if (!option) {
      setForm((prev) => ({ ...prev, assetType: value, assetTypeId: '' }))
      return
    }
    const isLegacy = String(option.id).startsWith('legacy-')
    setForm((prev) => ({
      ...prev,
      assetType: option.rawLabel || option.label,
      assetTypeId: isLegacy ? '' : option.id,
    }))
  }
  const updateCustomField = (key: string, value: any) => {
    setForm((prev) => ({
      ...prev,
      customFields: {
        ...prev.customFields,
        [key]: value,
      },
    }))
  }
  const renderCustomFieldInput = (field: AssetFieldConfig) => {
    const value = form.customFields?.[field.key]
    if (field.type === 'textarea') {
      return (
        <textarea
          className="form-input"
          style={{ minHeight: 90 }}
          value={value ?? ''}
          onChange={(e) => updateCustomField(field.key, e.target.value)}
        />
      )
    }
    if (field.type === 'select') {
      return (
        <select
          className="form-select"
          value={value ?? ''}
          onChange={(e) => updateCustomField(field.key, e.target.value)}
        >
          <option value="">Select...</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      )
    }
    if (field.type === 'boolean') {
      return (
        <select
          className="form-select"
          value={String(value ?? '')}
          onChange={(e) => updateCustomField(field.key, e.target.value === 'true')}
        >
          <option value="">Select...</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      )
    }
    if (field.type === 'date') {
      return (
        <input
          className="form-input"
          type="date"
          value={value ?? ''}
          onChange={(e) => updateCustomField(field.key, e.target.value)}
        />
      )
    }
    if (field.type === 'number') {
      return (
        <input
          className="form-input"
          type="number"
          value={value ?? ''}
          onChange={(e) => updateCustomField(field.key, e.target.value)}
        />
      )
    }
    return (
      <input
        className="form-input"
        value={value ?? ''}
        onChange={(e) => updateCustomField(field.key, e.target.value)}
      />
    )
  }

  const handleSave = async () => {
    if (!form.assetType.trim() || !form.status.trim()) {
      alert('Asset Type and Status are required.')
      return
    }
    setIsSaving(true)
    const resolvedAssetTypeId = form.assetTypeId || (selectedAssetType ? selectedAssetType.id : null)
    const nextId = form.assetId.trim()
      ? { assetId: form.assetId.trim() }
      : await assetService.getNextAssetId().catch(() => ({ assetId: '' as string }))
    const assetId = String(nextId?.assetId || '').trim()
    const payload = {
      assetId: assetId || undefined,
      assetType: form.assetType.trim(),
      assetTypeId: resolvedAssetTypeId ? String(resolvedAssetTypeId) : null,
      serial: form.serial.trim() || null,
      assetTag: form.assetTag.trim() || null,
      manufacturer: form.manufacturer.trim() || null,
      model: form.model.trim() || null,
      acquisitionType: form.acquisitionType,
      purchaseDate: toIsoDate(form.purchaseDate),
      vendor: form.vendor.trim() || null,
      cost: form.cost ? Number(form.cost) : null,
      salvageValue: form.salvageValue ? Number(form.salvageValue) : null,
      acquisitionDate: toIsoDate(form.acquisitionDate),
      poNumber: form.poNumber.trim() || null,
      invoiceNumber: form.invoiceNumber.trim() || null,
      purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : null,
      warrantyStart: toIsoDate(form.warrantyStart),
      warrantyUntil: toIsoDate(form.warrantyUntil),
      rentalProvider: form.rentalProvider.trim() || null,
      rentalStartDate: toIsoDate(form.rentalStartDate),
      rentalEndDate: toIsoDate(form.rentalEndDate),
      rentalMonthlyCost: form.rentalMonthlyCost ? Number(form.rentalMonthlyCost) : null,
      rentalTotalCost: form.rentalTotalCost ? Number(form.rentalTotalCost) : null,
      maintenanceIncluded: Boolean(form.maintenanceIncluded),
      contractNumber: form.contractNumber.trim() || null,
      returnCondition: form.returnCondition.trim() || null,
      assignedToId: form.assignedToId ? Number(form.assignedToId) : null,
      assignedUserEmail: form.assignedUserEmail.trim() || null,
      department: form.department.trim() || null,
      location: form.location.trim() || null,
      site: form.site.trim() || null,
      status: form.status.trim(),
      company: form.company.trim() || null,
      managedBy: form.managedBy.trim() || null,
      assignedOn: toIsoDateTime(form.assignedOn),
      os: form.os.trim() || null,
      osVersion: form.osVersion.trim() || null,
      osServicePack: form.osServicePack.trim() || null,
      ram: form.ram.trim() || null,
      storage: form.storage.trim() || null,
      cpuSpeed: form.cpuSpeed.trim() || null,
      cpuCoreCount: form.cpuCoreCount.trim() || null,
      licenseKey: form.licenseKey.trim() || null,
      installedSoftware: form.installedSoftwareText ? form.installedSoftwareText.split(',').map((s: string) => s.trim()).filter(Boolean) : [],
      antivirus: form.antivirus.trim() || null,
      patchStatus: form.patchStatus.trim() || null,
      encryption: form.encryption.trim() || null,
      macAddress: form.macAddress.trim() || null,
      ipAddress: form.ipAddress.trim() || null,
      supplier: form.supplier.trim() || null,
      notes: form.notes.trim() || null,
      customFields: form.customFields || {},
      linkedTicketIds: form.linkedTicketIds,
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
    if (!confirm(`Delete asset "${asset.assetId || `AST-${asset.id}`}"? This cannot be undone.`)) return
    try {
      await assetService.deleteAsset(asset.id)
      setAssets((prev) => prev.filter((a) => a.id !== asset.id))
      setAssetsAll((prev) => prev.filter((a) => a.id !== asset.id))
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to delete asset')
    }
  }
  const countByType = (type: string) => assets.filter((a) => normalizeKey(getAssetType(a)) === normalizeKey(type)).length
  const countByGroup = (group: string) => {
    const types = assetGroupMap[group] || []
    return assets.filter((a) => types.some((t) => normalizeKey(t) === normalizeKey(getAssetType(a)))).length
  }
  const resolveAssetTypeIcon = (typeLabel: string) => {
    const match = assetTypeOptions.find((opt) => normalizeKey(opt.rawLabel) === normalizeKey(typeLabel))
      || assetTypeOptions.find((opt) => normalizeKey(opt.label) === normalizeKey(typeLabel))
    return renderAssetTypeIcon({ label: typeLabel, icon: match?.icon, size: 'sm' })
  }

  const cardRows = filtered
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
                <div className="queue-avatar">{resolveAssetTypeIcon(type)}</div>
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
                      <div className="queue-avatar">{resolveAssetTypeIcon(type)}</div>
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
      {cardRows.length ? (
        <div className="assets-list-detail-layout">
          <section className="asset-table-panel">
            <div className="asset-table-header-row">
              <div>Asset ID</div>
              <div>Asset Type</div>
              <div>Model</div>
              <div>Status</div>
              <div>Assigned User</div>
            </div>
            {cardRows.map((asset) => {
              const assignedUser =
                String(asset.assignedTo?.name || '').trim() ||
                String(asset.assignedTo?.email || '').trim() ||
                String(asset.assignedUserEmail || '').trim() ||
                '-'
              return (
                <button
                  key={asset.id}
                  type="button"
                  className="asset-table-row"
                  onClick={() => openDetail(asset)}
                >
                  <div className="asset-table-cell">{asset.assetId || `AST-${asset.id}`}</div>
                  <div className="asset-table-cell">{asset.assetType || '-'}</div>
                  <div className="asset-table-cell">{asset.model || '-'}</div>
                  <div className="asset-table-cell">
                    <span className={`asset-status ${String(asset.status || '').toLowerCase().replace(/\s+/g, '-')}`}>{asset.status || 'Active'}</span>
                  </div>
                  <div className="asset-table-cell">{assignedUser}</div>
                </button>
              )
            })}
          </section>

        </div>
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
                <article className="asset-modal-card">
                  <h3 className="asset-modal-card-title">Identification</h3>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Asset ID</label>
                      <input className="form-input" value={form.assetId} placeholder="Auto" onChange={(e) => setForm((prev) => ({ ...prev, assetId: e.target.value }))} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Asset Type *</label>
                      <select
                        className="form-select"
                        value={selectedAssetTypeValue}
                        onChange={(e) => updateAssetTypeSelection(e.target.value)}
                      >
                        <option value="">Select...</option>
                        {assetTypeOptions.map((option) => (
                          <option key={option.id} value={option.id}>{option.displayLabel || option.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Asset Tag</label>
                      <input className="form-input" value={form.assetTag} onChange={(e) => setForm({ ...form, assetTag: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Brand / Manufacturer</label>
                      <input className="form-input" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Model Number</label>
                      <input className="form-input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Serial Number</label>
                      <input className="form-input" value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} />
                    </div>
                  </div>
                </article>
              )}

              {activeTab === 'information' && (
                <>
                  <article className="asset-modal-card">
                    <h3 className="asset-modal-card-title">Purchase / Rent Info</h3>
                    <div className="form-row">
                      <div className="form-section">
                        <label className="form-label">Purchase Info or Rent Info</label>
                        <select
                          className="form-select"
                          value={form.acquisitionType}
                          onChange={(e) => setForm({ ...form, acquisitionType: e.target.value })}
                        >
                          <option value="purchase">Purchase Info</option>
                          <option value="rent">Rent Info</option>
                        </select>
                      </div>
                    </div>
                  </article>
                  {form.acquisitionType === 'purchase' ? (
                    <article className="asset-modal-card">
                      <h3 className="asset-modal-card-title">Purchase Info</h3>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Purchase Date</label>
                          <input className="form-input" type="date" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Vendor</label>
                          <select className="form-select" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })}>
                            <option value="">Select vendor...</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.companyName || s.name || `Supplier ${s.id}`}>{s.companyName || s.name || `Supplier ${s.id}`}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Cost</label>
                          <input className="form-input" type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Salvage ($)</label>
                          <input className="form-input" type="number" value={form.salvageValue} onChange={(e) => setForm({ ...form, salvageValue: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Acquisition Date</label>
                          <input className="form-input" type="date" value={form.acquisitionDate} onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">PO Number</label>
                          <input className="form-input" value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Invoice Number</label>
                          <input className="form-input" value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Purchase Cost</label>
                          <input className="form-input" type="number" value={form.purchaseCost} onChange={(e) => setForm({ ...form, purchaseCost: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Warranty Start</label>
                          <input className="form-input" type="date" value={form.warrantyStart} onChange={(e) => setForm({ ...form, warrantyStart: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Warranty End</label>
                          <input className="form-input" type="date" value={form.warrantyUntil} onChange={(e) => setForm({ ...form, warrantyUntil: e.target.value })} />
                        </div>
                      </div>
                    </article>
                  ) : (
                    <article className="asset-modal-card">
                      <h3 className="asset-modal-card-title">Rent Info</h3>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Vendor / Rental Provider</label>
                          <select className="form-select" value={form.rentalProvider} onChange={(e) => setForm({ ...form, rentalProvider: e.target.value })}>
                            <option value="">Select provider...</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.companyName || s.name || `Supplier ${s.id}`}>{s.companyName || s.name || `Supplier ${s.id}`}</option>
                            ))}
                          </select>
                        </div>
                        <div className="form-section">
                          <label className="form-label">Contract Number</label>
                          <input className="form-input" value={form.contractNumber} onChange={(e) => setForm({ ...form, contractNumber: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Rental Start Date</label>
                          <input className="form-input" type="date" value={form.rentalStartDate} onChange={(e) => setForm({ ...form, rentalStartDate: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Rental End Date</label>
                          <input className="form-input" type="date" value={form.rentalEndDate} onChange={(e) => setForm({ ...form, rentalEndDate: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Monthly Rental Cost</label>
                          <input className="form-input" type="number" value={form.rentalMonthlyCost} onChange={(e) => setForm({ ...form, rentalMonthlyCost: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Total Rental Cost</label>
                          <input className="form-input" type="number" value={form.rentalTotalCost} onChange={(e) => setForm({ ...form, rentalTotalCost: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Maintenance Included</label>
                          <select className="form-select" value={String(form.maintenanceIncluded)} onChange={(e) => setForm({ ...form, maintenanceIncluded: e.target.value === 'true' })}>
                            <option value="false">No</option>
                            <option value="true">Yes</option>
                          </select>
                        </div>
                        <div className="form-section">
                          <label className="form-label">Return Condition</label>
                          <input className="form-input" value={form.returnCondition} onChange={(e) => setForm({ ...form, returnCondition: e.target.value })} />
                        </div>
                      </div>
                    </article>
                  )}
                </>
              )}

              {activeTab === 'assignment' && (
                <article className="asset-modal-card">
                  <h3 className="asset-modal-card-title">Assignment</h3>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Assigned To</label>
                      <select className="form-select" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}>
                        <option value="">Employee / Department</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>{u.name || u.email}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-section">
                      <label className="form-label">Department</label>
                      <input className="form-input" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Location</label>
                      <input className="form-input" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Site</label>
                      <input className="form-input" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Status</label>
                      <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {ASSET_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                    <div className="form-section">
                      <label className="form-label">Company</label>
                      <input className="form-input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Managed By</label>
                      <input className="form-input" value={form.managedBy} onChange={(e) => setForm({ ...form, managedBy: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Assigned On</label>
                      <input className="form-input" type="datetime-local" value={form.assignedOn} onChange={(e) => setForm({ ...form, assignedOn: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Asset State *</label>
                      <select className="form-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {ASSET_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </article>
              )}

              {activeTab === 'details' && (
                <>
                  {shouldShowDeviceDetails ? (
                    <article className="asset-modal-card">
                      <h3 className="asset-modal-card-title">Details</h3>
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
                          <label className="form-label">OS Service Pack</label>
                          <input className="form-input" value={form.osServicePack} onChange={(e) => setForm({ ...form, osServicePack: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Memory (GB)</label>
                          <input className="form-input" value={form.ram} onChange={(e) => setForm({ ...form, ram: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Disk Space (GB)</label>
                          <input className="form-input" value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">CPU Speed (GHz)</label>
                          <input className="form-input" value={form.cpuSpeed} onChange={(e) => setForm({ ...form, cpuSpeed: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">CPU Core Count</label>
                          <input className="form-input" value={form.cpuCoreCount} onChange={(e) => setForm({ ...form, cpuCoreCount: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">License Key</label>
                          <input className="form-input" value={form.licenseKey} onChange={(e) => setForm({ ...form, licenseKey: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Installed Software</label>
                          <input className="form-input" value={form.installedSoftwareText} onChange={(e) => setForm({ ...form, installedSoftwareText: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Antivirus</label>
                          <input className="form-input" value={form.antivirus} onChange={(e) => setForm({ ...form, antivirus: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Patch Status</label>
                          <input className="form-input" value={form.patchStatus} onChange={(e) => setForm({ ...form, patchStatus: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">Encryption</label>
                          <input className="form-input" value={form.encryption} onChange={(e) => setForm({ ...form, encryption: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">MAC Address</label>
                          <input className="form-input" value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} />
                        </div>
                        <div className="form-section">
                          <label className="form-label">IP Address</label>
                          <input className="form-input" value={form.ipAddress} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-row">
                        <div className="form-section">
                          <label className="form-label">Supplier</label>
                          <select className="form-select" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })}>
                            <option value="">Select supplier...</option>
                            {suppliers.map((s) => (
                              <option key={s.id} value={s.companyName || s.name || `Supplier ${s.id}`}>{s.companyName || s.name || `Supplier ${s.id}`}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </article>
                  ) : null}
                  {selectedAssetFields.length > 0 && (
                    <article className="asset-modal-card">
                      <h3 className="asset-modal-card-title">Custom Fields</h3>
                      <div className="form-row">
                        {selectedAssetFields.map((field) => (
                          <div key={field.id} className="form-section">
                            <label className="form-label">
                              {field.label}{field.required ? ' *' : ''}
                            </label>
                            {renderCustomFieldInput(field)}
                          </div>
                        ))}
                      </div>
                    </article>
                  )}
                </>
              )}

              {activeTab === 'relationships' && (
                <div className="form-section">
                  <label className="form-label">Linked Tickets</label>
                  <select multiple className="form-select" value={form.linkedTicketIds} onChange={(e) => setForm({ ...form, linkedTicketIds: Array.from(e.target.selectedOptions).map(o => o.value) })}>
                    {tickets.map((t) => (
                      <option key={t.ticketId || t.id} value={t.ticketId || t.id}>{t.ticketId || t.id} - {t.subject || t.description || ''}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeTab === 'notes' && (
                <article className="asset-modal-card asset-modal-card-tight">
                  <h3 className="asset-modal-card-title">Notes & Attachments</h3>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">{'Attach files (File size < 40 MB)'}</label>
                      <input className="form-input" type="file" multiple onChange={(e) => setAssetUploadFiles(Array.from(e.target.files || []))} />
                      {assetUploadFiles.length > 0 ? (
                        <small>{assetUploadFiles.map((f) => f.name).join(', ')}</small>
                      ) : null}
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Notes</label>
                      <textarea className="form-input" style={{ minHeight: 120 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                    </div>
                  </div>
                </article>
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































