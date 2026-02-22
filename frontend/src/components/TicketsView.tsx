import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import * as ticketService from '../modules/tickets/services/ticket.service'
import * as ticketSvc from '../modules/tickets/services/ticket.service'
import * as assetService from '../modules/assets/services/asset.service'
import * as userService from '../modules/users/services/user.service'
import { listSlaConfigs } from '../services/sla.service'
import { useAuth } from '../contexts/AuthContext'
import { getRowsPerPage } from '../utils/pagination'
import { loadLeftPanelConfig, type QueueRule, type TicketQueueConfig } from '../utils/leftPanelConfig'
import { PRESENCE_CHANGED_EVENT, getStoredPresenceStatus, normalizePresenceStatus, toPresenceClass, type PresenceStatus } from '../utils/presence'
import { AVATAR_CHANGED_EVENT, getUserAvatarUrl, getUserInitials } from '../utils/avatar'
const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024

type LocalAttachment = {
  key: string
  file: File
}

export type Incident = {
  id: string
  slaTimeLeft: string
  sla?: any
  subject: string
  category: string
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  status: string
  type: string
  endUser: string
  dateReported: string
  lastAction: string
  lastActionTime: string
  assignedAgentId?: string
  assignedAgentName?: string
  createdAt?: string
  updatedAt?: string
  closedAt?: string
  closedByName?: string
}

export default function TicketsView() {
  const { user } = useAuth()
  const { ticketId } = useParams()
  const navigate = useNavigate()
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filterType, setFilterType] = useState('Open Tickets')
  const [queueFilter, setQueueFilter] = useState<{ type: 'all' | 'unassigned' | 'supplier' | 'agent' | 'team' | 'teamUnassigned' | 'teamAgent' | 'ticketType' | 'status' | 'myList'; agentId?: string; agentName?: string; value?: string; team?: string }>({ type: 'all' })
  const [queueView, setQueueView] = useState<'all' | 'team' | 'staff' | 'type' | 'status' | 'myLists'>('team')
  const [expandedTeams, setExpandedTeams] = useState<string[]>([])
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [page, setPage] = useState(1)
  const rowsPerPage = getRowsPerPage()
  const [selectAll, setSelectAll] = useState(false)
  const [selectedTickets, setSelectedTickets] = useState<string[]>([])
  const [globalSearch, setGlobalSearch] = useState('')
  const [showNewIncidentModal, setShowNewIncidentModal] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<string[]>([])
  const [selectedTicket, setSelectedTicket] = useState<Incident | null>(null)
  const [showDetailView, setShowDetailView] = useState(false)
  const [endUser, setEndUser] = useState<any>(null)
  const [ticketAsset, setTicketAsset] = useState<any>(null)
  const [assetList, setAssetList] = useState<any[]>([])
  const [assetQuery, setAssetQuery] = useState('')
  const [assetAssignId, setAssetAssignId] = useState<number | ''>('')
  const [slaNowMs, setSlaNowMs] = useState(() => Date.now())
  const [activeDetailTab, setActiveDetailTab] = useState('Progress')
  const [isCompactDetailLayout, setIsCompactDetailLayout] = useState(() => {
    if (typeof window === 'undefined') return false
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    return viewportWidth <= 1360
  })
  const [showActionComposer, setShowActionComposer] = useState(false)
  const [showInternalNoteEditor, setShowInternalNoteEditor] = useState(false)
  const [slaPolicies, setSlaPolicies] = useState<any[]>([])
  const [slaApplying, setSlaApplying] = useState(false)
  const [slaPolicyMenuOpen, setSlaPolicyMenuOpen] = useState(false)
  const [slaPriorityMenuOpen, setSlaPriorityMenuOpen] = useState(false)
  const [selectedSlaPolicyName, setSelectedSlaPolicyName] = useState('')
  const [composerAttachments, setComposerAttachments] = useState<LocalAttachment[]>([])
  const [internalNoteAttachments, setInternalNoteAttachments] = useState<LocalAttachment[]>([])
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const composerFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const internalNoteFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const slaPolicyMenuRef = React.useRef<HTMLDivElement | null>(null)
  const slaPriorityMenuRef = React.useRef<HTMLDivElement | null>(null)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [showCcField, setShowCcField] = useState(false)
  const [showBccField, setShowBccField] = useState(false)
  const [actionStateByTicket, setActionStateByTicket] = useState<Record<string, { ackSent: boolean; supplierLogged: boolean }>>({})
  const [composerMode, setComposerMode] = useState<
    'acknowledge' | 'emailUser' | 'logSupplier' | 'emailSupplier' | 'callbackSupplier' | 'approval' | 'resolve' | 'close' | 'noteEmail'
  >('emailUser')
  const [composerForm, setComposerForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    nextUpdateDate: '',
    nextUpdateTime: '',
    issue: 'Category1',
    issueDetail: 'Category2',
    currentAction: '',
    nextAction: '',
    asset: '',
    supplier: 'Supplier and Contract',
    supplierRef: '',
    approvalTeam: 'Management Team',
    approvalPriority: 'P2 - Single site outage with remote fix',
  })
  const [internalNoteForm, setInternalNoteForm] = useState({
    body: '',
    status: 'In Progress',
    team: 'Automated Alerts',
    staff: '',
    timeHours: '00',
    timeMinutes: '01',
  })
  const [agents, setAgents] = useState<any[]>([])
  const [myPresenceStatus, setMyPresenceStatus] = useState<PresenceStatus>(() => getStoredPresenceStatus())
  const [, setAvatarRefreshTick] = useState(0)
  const [queueCollapsed, setQueueCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [ticketMyListRules, setTicketMyListRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().ticketsMyLists)
  const [ticketQueues, setTicketQueues] = useState<TicketQueueConfig[]>(() => loadLeftPanelConfig().ticketQueues)
  const [newIncidentForm, setNewIncidentForm] = useState({
    ticketType: 'Fault',
    subject: '',
    category: '',
    priority: '' as const,
    description: ''
  })

  const inferInboundEndUser = (ticketData: any) => {
    const requester = ticketData?.requester
    if (requester && (requester.name || requester.email || requester.username)) return requester

    const body = String(ticketData?.description || '')
    const fromLine = body.match(/^\s*From:\s*(.+)\s*$/im)?.[1]?.trim() || ''
    if (!fromLine) return null

    const emailMatch = fromLine.match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)
    const email = emailMatch?.[1] || ''
    const namePart = fromLine.replace(/<[^>]+>/g, '').replace(email, '').replace(/["']/g, '').trim()
    const username = email ? email.split('@')[0] : ''
    return {
      name: namePart || username || email || 'End User',
      username: username || undefined,
      email: email || undefined,
    }
  }

  const formatTimelineTime = (raw: any) => {
    if (!raw) return new Date().toLocaleString()
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleString()
  }

  const toLocalDateTime = (raw: any) => {
    if (!raw) return '-'
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString()
  }

  const toTimestamp = (raw: any): number | null => {
    if (!raw) return null
    const d = new Date(raw)
    const ms = d.getTime()
    return Number.isNaN(ms) ? null : ms
  }

  const formatSlaClock = (remainingMs: number) => {
    const negative = remainingMs < 0
    const abs = Math.abs(Math.floor(remainingMs / 1000))
    const hh = Math.floor(abs / 3600)
    const mm = Math.floor((abs % 3600) / 60)
    const ss = abs % 60
    const core = hh > 0
      ? `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
      : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
    return negative ? `-${core}` : core
  }

  const formatElapsedClock = (elapsedMs: number) => {
    const totalMinutes = Math.max(0, Math.floor(elapsedMs / 60_000))
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const getSlaElapsedColor = (elapsedPercent: number) => {
    const p = Math.max(0, Math.min(100, Math.round(elapsedPercent / 10) * 10))
    if (p <= 0) return '#006400'
    if (p <= 10) return '#008000'
    if (p <= 20) return '#32CD32'
    if (p <= 30) return '#9ACD32'
    if (p <= 40) return '#FFD700'
    if (p <= 50) return '#FFA500'
    if (p <= 60) return '#FF8C00'
    if (p <= 70) return '#FF6A00'
    if (p <= 80) return '#FF4500'
    if (p <= 90) return '#FF0000'
    return '#8B0000'
  }

  const applySlaPriority = async (priority: 'Critical' | 'High' | 'Medium' | 'Low') => {
    if (!selectedTicket) return
    try {
      setSlaApplying(true)
      await ticketService.updateTicket(selectedTicket.id, { priority })
      const latest: any = await ticketService.getTicket(selectedTicket.id)
      setSelectedTicket((prev) =>
        prev
          ? {
              ...prev,
              priority: (latest?.priority || priority) as Incident['priority'],
              sla: latest?.sla || prev.sla,
              slaTimeLeft: latest?.slaTimeLeft || latest?.sla?.resolution?.remainingLabel || prev.slaTimeLeft,
            }
          : prev
      )
      setIncidents((prev) =>
        prev.map((i) =>
          i.id === selectedTicket.id
            ? {
                ...i,
                priority: (latest?.priority || priority) as Incident['priority'],
                sla: latest?.sla || i.sla,
                slaTimeLeft: latest?.slaTimeLeft || latest?.sla?.resolution?.remainingLabel || i.slaTimeLeft,
              }
            : i
        )
      )
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to update SLA')
    } finally {
      setSlaApplying(false)
    }
  }

  const canonicalPriorityForRank = (rank: number): 'Critical' | 'High' | 'Medium' | 'Low' => {
    if (rank === 1) return 'Critical'
    if (rank === 2) return 'High'
    if (rank === 3) return 'Medium'
    return 'Low'
  }

  const rankFromPriorityLabel = (value: any): number => {
    const v = String(value || '').trim().toLowerCase()
    if (v === 'critical' || v === 'p1') return 1
    if (v === 'high' || v === 'p2') return 2
    if (v === 'medium' || v === 'p3') return 3
    if (v === 'low' || v === 'p4') return 4
    return 4
  }

  const handlePolicySelectFromPill = (policyName: string) => {
    setSlaPolicyMenuOpen(false)
    setSelectedSlaPolicyName(String(policyName || ''))
    setSlaPriorityMenuOpen(true)
  }

  React.useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (slaPolicyMenuRef.current && !slaPolicyMenuRef.current.contains(target)) {
        setSlaPolicyMenuOpen(false)
      }
      if (slaPriorityMenuRef.current && !slaPriorityMenuRef.current.contains(target)) {
        setSlaPriorityMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  React.useEffect(() => {
    const timer = window.setInterval(() => setSlaNowMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => {
    const syncAvatar = () => setAvatarRefreshTick((v) => v + 1)
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'itsm.user.avatar.map.v1') syncAvatar()
    }
    window.addEventListener(AVATAR_CHANGED_EVENT, syncAvatar as EventListener)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(AVATAR_CHANGED_EVENT, syncAvatar as EventListener)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const resolveHistoryAuthor = (historyEntry: any, ticketData: any) => {
    const changedById = Number(historyEntry?.changedById || 0)
    if (changedById > 0) {
      const match = agents.find((a: any) => Number(a?.id) === changedById)
      if (match) return getAgentDisplayName(match)
      return `User #${changedById}`
    }
    const note = String(historyEntry?.note || '').toLowerCase()
    const isInboundReply = note.includes('inbound email reply received') || note.includes('\nfrom:')
    if (!isInboundReply) return 'System'
    const requester = inferInboundEndUser(ticketData)
    if (requester?.name || requester?.email || requester?.username) {
      return String(requester.name || requester.email || requester.username)
    }
    return 'System'
  }

  const hydrateTimelineFromTicket = (ticketData: any) => {
    const ticketKey = String(ticketData?.ticketId || ticketData?.id || '')
    if (!ticketKey) return

    const requester = inferInboundEndUser(ticketData)
    const initialAuthor = String(requester?.name || requester?.email || requester?.username || 'System')
    const initialText = String(ticketData?.subject || ticketData?.description || 'Ticket created').trim()
    const initialTime = formatTimelineTime(ticketData?.createdAt)

    const historyItems = Array.isArray(ticketData?.history) ? ticketData.history : []
    const historyComments = historyItems
      .map((h: any) => {
        const note = String(h?.note || '').trim()
        const fromStatus = String(h?.fromStatus || '').trim()
        const toStatus = String(h?.toStatus || '').trim()
        const fallback = fromStatus || toStatus ? `Status changed: ${fromStatus || '-'} -> ${toStatus || '-'}` : 'Ticket updated'
        return {
          author: resolveHistoryAuthor(h, ticketData),
          text: note || fallback,
          time: formatTimelineTime(h?.createdAt),
        }
      })
      .filter((e: any) => String(e.text || '').trim().length > 0)

    const merged = [
      { author: initialAuthor, text: `Ticket created: ${initialText}`, time: initialTime },
      ...historyComments,
    ]

    const seen = new Set<string>()
    const deduped = merged.filter((e) => {
      const key = `${e.author}|${e.text}|${e.time}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    setTicketComments((prev) => ({
      ...prev,
      [ticketKey]: deduped,
    }))
  }

  const loadTickets = async () => {
    try {
      const data: any = await ticketService.listTickets({ page: 1, pageSize: 200 })
      const items = Array.isArray(data) ? data : (data?.items || [])
      const mapped = items.map((t: any) => ({
        id: t.ticketId || String(t.id),
        slaTimeLeft: t.slaTimeLeft || t?.sla?.resolution?.remainingLabel || '--:--',
        sla: t.sla || null,
        subject: t.subject || t.description || '',
        category: t.category || '',
        priority: t.priority || 'Low',
        status: t.status,
        type: t.type,
        endUser: t.requester?.name || t.requester?.email || '',
        dateReported: t.createdAt ? new Date(t.createdAt).toLocaleString() : '',
        lastAction: '',
        lastActionTime: '',
        assignedAgentId: t.assignedTo?.id || t.assignee?.id,
        assignedAgentName: t.assignedTo?.name || t.assignee?.name,
        createdAt: t.createdAt || undefined,
        updatedAt: t.updatedAt || undefined,
        closedAt: t.closedAt || undefined,
        closedByName: t.closedBy?.name || t.closedByName || undefined,
      }))
      setIncidents(mapped)
    } catch (err) {
      console.warn('Failed to fetch tickets:', err)
      setIncidents([])
    }
  }

  // Hydrate from backend tickets API
  React.useEffect(() => {
    loadTickets()
  }, [])

  React.useEffect(() => {
    const timer = window.setInterval(() => {
      loadTickets()
    }, 15000)
    return () => window.clearInterval(timer)
  }, [])

  React.useEffect(() => {
    if (showDetailView) {
      loadAssetsForTicket('')
    }
  }, [showDetailView])

  React.useEffect(() => {
    const id = ticketId ? decodeURIComponent(ticketId) : ''
    if (!id) {
      setShowDetailView(false)
      return
    }
    const existing = incidents.find((i) => String(i.id) === String(id))
    if (existing) {
      setSelectedTicket(existing)
      if (existing.endUser) {
        const raw = String(existing.endUser).trim()
        setEndUser({
          name: raw.includes('@') ? raw.split('@')[0] : raw,
          username: raw.includes('@') ? raw.split('@')[0] : raw,
          email: raw.includes('@') ? raw : undefined,
        })
      }
      setShowDetailView(true)
    }
    ticketService.getTicket(id).then((d: any) => {
      const mapped: Incident = {
        id: d.ticketId || String(d.id || id),
        slaTimeLeft: d.slaTimeLeft || d?.sla?.resolution?.remainingLabel || '--:--',
        sla: d.sla || null,
        subject: d.subject || d.description || 'Ticket',
        category: d.category || '',
        priority: d.priority || 'Low',
        status: d.status || 'New',
        type: d.type || 'Incident',
        endUser: d.requester?.name || d.requester?.email || '',
        dateReported: d.createdAt ? new Date(d.createdAt).toLocaleString() : '',
        lastAction: '',
        lastActionTime: '',
        assignedAgentId: d.assignedTo?.id || d.assignee?.id,
        assignedAgentName: d.assignedTo?.name || d.assignee?.name,
        createdAt: d.createdAt || undefined,
        updatedAt: d.updatedAt || undefined,
        closedAt: d.closedAt || undefined,
        closedByName: d.closedBy?.name || d.closedByName || undefined,
      }
      setSelectedTicket(mapped)
      setEndUser(inferInboundEndUser(d))
      hydrateTimelineFromTicket(d)
      setShowDetailView(true)
    }).catch(() => {
      if (existing) return
      setSelectedTicket({
        id: id,
        slaTimeLeft: '--:--',
        sla: null,
        subject: 'Ticket',
        category: '',
        priority: 'Low',
        status: 'New',
        type: 'Incident',
        endUser: '',
        dateReported: new Date().toLocaleString(),
        lastAction: '',
        lastActionTime: '',
      })
      setShowDetailView(true)
    })
  }, [ticketId, incidents])
  React.useEffect(() => {
    const syncPresence = () => setMyPresenceStatus(getStoredPresenceStatus())
    const syncPresenceFromEvent = (event: Event) => {
      const detailValue = (event as CustomEvent<{ value?: string }>)?.detail?.value
      if (detailValue) {
        setMyPresenceStatus(normalizePresenceStatus(detailValue))
        return
      }
      syncPresence()
    }
    window.addEventListener('storage', syncPresence)
    window.addEventListener(PRESENCE_CHANGED_EVENT, syncPresenceFromEvent as EventListener)
    return () => {
      window.removeEventListener('storage', syncPresence)
      window.removeEventListener(PRESENCE_CHANGED_EVENT, syncPresenceFromEvent as EventListener)
    }
  }, [])

  React.useEffect(() => {
    userService.listUsers({ limit: 500 }).then((users) => {
      setAgents(Array.isArray(users) ? users : [])
    }).catch(() => {
      setAgents([])
    })
  }, [])

  React.useEffect(() => {
    listSlaConfigs()
      .then((rows: any) => setSlaPolicies(Array.isArray(rows) ? rows : []))
      .catch(() => setSlaPolicies([]))
  }, [])

  React.useEffect(() => {
    if (!showDetailView || !selectedTicket?.id || agents.length === 0) return
    ticketService.getTicket(selectedTicket.id).then((d: any) => {
      hydrateTimelineFromTicket(d)
    }).catch(() => undefined)
  }, [agents.length, showDetailView, selectedTicket?.id])

  React.useEffect(() => {
    const expandedCls = 'tickets-queue-expanded'
    const collapsedCls = 'tickets-queue-collapsed'
    if (!queueCollapsed) {
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
  }, [queueCollapsed])

  React.useEffect(() => {
    document.body.classList.add('tickets-view-active')
    return () => {
      document.body.classList.remove('tickets-view-active')
    }
  }, [])
  React.useEffect(() => {
    const handler = () => {
      const cfg = loadLeftPanelConfig()
      setTicketMyListRules(cfg.ticketsMyLists)
      setTicketQueues(cfg.ticketQueues)
    }
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])

  React.useEffect(() => {
    const pending = sessionStorage.getItem('openNewTicket')
    if (pending) {
      sessionStorage.removeItem('openNewTicket')
      setShowNewIncidentModal(true)
    }
    const handler = () => setShowNewIncidentModal(true)
    window.addEventListener('open-new-ticket', handler as EventListener)
    return () => window.removeEventListener('open-new-ticket', handler as EventListener)
  }, [])

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'tickets') return
      if (detail.action === 'new') {
        setShowNewIncidentModal(true)
      }
      if (detail.action === 'filter') {
        setShowSearchBar((v) => {
          const next = !v
          if (!next) clearColumnFilters()
          return next
        })
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])

  React.useEffect(() => {
    const handler = (ev: any) => {
      const q = String(ev?.detail?.query ?? '')
      setGlobalSearch(q)
      if (queueCollapsed) {
        setShowSearchBar(false)
      }
    }
    window.addEventListener('global-search', handler as EventListener)
    return () => window.removeEventListener('global-search', handler as EventListener)
  }, [queueCollapsed])

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 1100) {
        setQueueCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const categoryOptions = {
    Hardware: [
      'Laptop',
      'Headset',
      'Keyboard',
      'Mouse',
      'Monitor',
      'PC',
      'Powercord',
      'VGA cable',
      'HDMI cable'
    ],
    'Hardware>Laptop': ['Adaptor', 'Adaptor Cable'],
    Infrastructure: ['Power', 'Data Connection', 'Router', 'Server', 'Printer'],
    'Infrastructure>Power': ['Switch', 'Socket']
  }
  const [searchValues, setSearchValues] = useState({
    viewing: '',
    id: '',
    slaTimeLeft: '',
    subject: '',
    category: '',
    priority: '',
    status: '',
    type: '',
    endUser: '',
    lastAction: '',
    dateReported: ''
  })
  // per-column minimum widths (px) and snap step
  const columnMinWidths: Record<string, number> = {
    checkbox: 40,
    status: 80,
    id: 80,
    summary: 200,
    category: 120,
    sla: 140,
    priority: 80,
    type: 100,
    endUser: 140,
    lastAction: 120,
    date: 120
  }
  const widthSnap = 10
  // table container width (start exactly fitting columns; expand only when needed)
  const baseColWidths = {
    checkbox: 40,
    status: 100,
    id: 100,
    subject: 400,
    category: 200,
    sla: 160,
    priority: 100,
    type: 100,
    endUser: 160,
    lastAction: 150,
    date: 140
  }
  const colsCount = Object.keys(baseColWidths).length
  const gapTotal = (colsCount - 1) * 10 // match CSS grid gap
  const paddingHorizontal = 32 // left+right padding from .table-header/.table-row (16px each)
  const initialTableWidth = Math.ceil(Object.values(baseColWidths).reduce((s, v) => s + (v as number), 0) + gapTotal + paddingHorizontal)
  const [tableWidth, setTableWidth] = useState<number>(initialTableWidth)
  const tableRef = React.useRef<HTMLDivElement | null>(null)
  // per-column widths used for gridTemplateColumns. Keep `summary` key because
  // the template references `columnWidths.summary` (subject text cell).
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({
    checkbox: baseColWidths.checkbox,
    status: baseColWidths.status,
    id: baseColWidths.id,
    summary: (baseColWidths as any).subject ?? 400,
    category: baseColWidths.category,
    sla: baseColWidths.sla,
    priority: baseColWidths.priority,
    type: baseColWidths.type,
    endUser: baseColWidths.endUser,
    lastAction: baseColWidths.lastAction,
    date: baseColWidths.date
  })
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)

  const filterOptions = [
    'All Tickets',
    'Closed Tickets',
    'Open Tickets'
  ]

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedTickets([])
      setSelectAll(false)
    } else {
      setSelectedTickets(incidents.map(i => i.id))
      setSelectAll(true)
    }
  }

  const handleSelectTicket = (ticketId: string) => {
    setSelectedTickets(prev => {
      if (prev.includes(ticketId)) {
        return prev.filter(id => id !== ticketId)
      } else {
        return [...prev, ticketId]
      }
    })
  }
  const handleCreateIncident = () => {
    if (!newIncidentForm.ticketType.trim() || !newIncidentForm.priority.trim() || !newIncidentForm.subject.trim()) {
      alert('Please fill in all required fields: Ticket Type, Priority, and Subject')
      return
    }

    // call backend createTicket
    (async () => {
      try {
        const payload = {
          type: newIncidentForm.ticketType,
          priority: newIncidentForm.priority,
          category: newIncidentForm.category,
          description: newIncidentForm.description,
          subject: newIncidentForm.subject,
          requesterId: user?.id ? Number(user.id) : undefined,
          requesterEmail: user?.email || undefined,
        }
        const created: any = await ticketService.createTicket(payload)
        const newId = created.ticketId || `#${String(created.id).padStart(6,'0')}`
        const newIncident: Incident = {
          id: newId,
          slaTimeLeft: '00:00',
          subject: created.subject || created.description || newIncidentForm.subject,
          category: created.category || newIncidentForm.category,
          priority: created.priority || (newIncidentForm.priority as Incident['priority']),
          status: created.status || 'New',
          type: created.type,
          dateReported: new Date(created.createdAt).toLocaleString(),
          lastAction: 'Created',
          lastActionTime: new Date().toLocaleString()
        }

        setIncidents([newIncident, ...incidents])
        setShowNewIncidentModal(false)
        setNewIncidentForm({ ticketType: 'Fault', subject: '', category: '', priority: '', description: '' })
        // Refresh from DB to ensure persisted view is accurate
        await loadTickets()
      } catch (e) {
        alert('Failed to create ticket')
        // fallback to local demo behavior
        const lastId = incidents[0]?.id
        const numericPart = typeof lastId === 'string' ? parseInt(lastId.replace(/[^0-9]/g, ''), 10) : (typeof lastId === 'number' ? lastId : 0)
        const nextNum = (numericPart || 0) + 1
        const newId = '#' + String(nextNum).padStart(6, '0')
        const newIncident: Incident = {
          id: newId,
          slaTimeLeft: '00:00',
          subject: newIncidentForm.subject,
          category: newIncidentForm.category,
          priority: (newIncidentForm.priority || 'Low') as Incident['priority'],
          status: 'New',
          type: newIncidentForm.ticketType,
          dateReported: new Date().toLocaleString(),
          lastAction: 'Created',
          lastActionTime: new Date().toLocaleString()
        }
        setIncidents([newIncident, ...incidents])
        setShowNewIncidentModal(false)
        setNewIncidentForm({ ticketType: 'Fault', subject: '', category: '', priority: '', description: '' })
      }
    })()
  }
  const handleSearchChange = (column: string, value: string) => {
    setSearchValues(prev => ({
      ...prev,
      [column]: value
    }))
  }

  const clearColumnFilters = () => {
    setSearchValues({
      viewing: '',
      id: '',
      slaTimeLeft: '',
      subject: '',
      category: '',
      priority: '',
      status: '',
      type: '',
      lastAction: '',
      dateReported: ''
    })
  }

  const statusClass = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')

  const toggleCategoryExpand = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const handleCategorySelect = (category: string) => {
    setNewIncidentForm({...newIncidentForm, category})
    setShowCategoryDropdown(false)
  }

  const handleTicketClick = (ticket: Incident) => {
    setSelectedTicket(ticket)
    setShowDetailView(true)
    navigate(`/tickets/${encodeURIComponent(ticket.id)}`)

    // fetch full ticket details (including requester/end-user) from backend if available
    import('../modules/tickets/services/ticket.service').then(svc => {
      svc.getTicket(ticket.id).then((d: any) => {
        // backend returns ticket with requester included as `requester`
        setEndUser(inferInboundEndUser(d))
        setTicketAsset(d.asset || null)
        setAssetAssignId(d.asset?.id || '')
        hydrateTimelineFromTicket(d)
        // merge any additional ticket fields (e.g., updated status)
        setSelectedTicket(prev => prev ? {
          ...prev,
          status: d.status || prev.status,
          dateReported: d.createdAt ? new Date(d.createdAt).toLocaleString() : prev.dateReported,
          createdAt: d.createdAt || prev.createdAt,
          updatedAt: d.updatedAt || prev.updatedAt,
          closedAt: d.closedAt || prev.closedAt,
          closedByName: d.closedBy?.name || d.closedByName || prev.closedByName,
        } : prev)
      }).catch(() => {
        // ignore failures; keep demo state
      })
    })
  }

  // Comments keyed by ticket id (simple in-memory store for timeline)
  const [ticketComments, setTicketComments] = useState<Record<string, {author: string; text: string; time: string}[]>>({})

  const getCurrentAgentName = () => {
    if (!user) return 'You'
    return user.name || user.email || user.username || user.id || 'You'
  }

  const getAgentDisplayName = (a: any) => {
    const name = a?.name || ''
    if (name.trim()) return name
    const username = a?.username || a?.userName || ''
    if (String(username || '').trim()) return String(username).trim()
    const email = String(a?.email || '').trim()
    if (email) {
      const local = email.split('@')[0] || email
      const first = local.split(/[._-]/).filter(Boolean)[0] || local
      return first ? first[0].toUpperCase() + first.slice(1) : email
    }
    return 'User'
  }

  const getAgentPresenceClass = (agent: any): 'available' | 'away' | 'dnd' | 'offline' => {
    const agentId = String(agent?.id || '').trim()
    const agentEmail = String(agent?.email || '').trim().toLowerCase()
    const agentName = String(getAgentDisplayName(agent) || '').trim().toLowerCase()
    const meId = String(user?.id || '').trim()
    const meEmail = String(user?.email || '').trim().toLowerCase()
    const meName = String(user?.name || '').trim().toLowerCase()
    const isMe =
      (agentId && meId && agentId === meId) ||
      (agentEmail && meEmail && agentEmail === meEmail) ||
      (agentName && meName && agentName === meName)
    if (isMe) return toPresenceClass(myPresenceStatus)

    const raw = String(agent?.presenceStatus || agent?.status || '').trim().toLowerCase()
    if (!raw) return 'available'
    if (raw.includes('do not disturb') || raw.includes('dnd') || raw.includes('busy')) return 'dnd'
    if (raw.includes('away')) return 'away'
    if (raw.includes('inactive') || raw.includes('offline') || raw.includes('disabled')) return 'offline'
    if (raw.includes('active') || raw.includes('available') || raw.includes('online')) return 'available'
    return 'available'
  }

  const shouldShowQueuePresenceDot = (presenceClass: 'available' | 'away' | 'dnd' | 'offline') => presenceClass !== 'away'

  const findAgentRecord = (agentKey: string, label?: string) => {
    const key = String(agentKey || '').trim().toLowerCase()
    const displayLabel = String(label || '').trim().toLowerCase()
    return (
      agents.find((a) => String(a?.id || '').trim().toLowerCase() === key) ||
      agents.find((a) => String(getAgentDisplayName(a) || '').trim().toLowerCase() === key) ||
      agents.find((a) => displayLabel && String(getAgentDisplayName(a) || '').trim().toLowerCase() === displayLabel) ||
      null
    )
  }

  const renderQueueAgentAvatar = (agent: any, fallbackLabel?: string) => {
    const displayName = String(getAgentDisplayName(agent) || fallbackLabel || 'User').trim()
    const merged = {
      ...(agent || {}),
      name: displayName,
      email: String(agent?.email || '').trim(),
    }
    const meName = String(user?.name || '').trim().toLowerCase()
    const meEmail = String(user?.email || '').trim().toLowerCase()
    const mergedName = String(merged?.name || '').trim().toLowerCase()
    const mergedEmail = String(merged?.email || '').trim().toLowerCase()
    const isMe = Boolean(
      (meName && mergedName && meName === mergedName) ||
      (meEmail && mergedEmail && meEmail === mergedEmail)
    )
    const avatarUrl = isMe ? getUserAvatarUrl(user) : getUserAvatarUrl(merged)
    const initials = getUserInitials(merged, getInitials(displayName))
    if (avatarUrl) {
      return (
        <img
          src={avatarUrl}
          alt={displayName}
          className="queue-avatar-image"
          onError={(e) => {
            e.currentTarget.style.display = 'none'
          }}
        />
      )
    }
    return initials
  }

  const addTicketComment = (ticketId: string, text: string) => {
    const now = new Date().toLocaleString()
    const author = getCurrentAgentName()
    setTicketComments(prev => ({
      ...prev,
      [ticketId]: [ ...(prev[ticketId] || []), { author, text, time: now } ]
    }))
  }

  const handleTriage = () => {
    if (!selectedTicket) return
    // Perform backend transition and update UI
    (async () => {
      try {
        const res = await ticketService.transitionTicket(selectedTicket.id, 'In Progress')
        const updated = incidents.map(i => i.id === selectedTicket.id ? { ...i, status: res.status } : i)
        setIncidents(updated)
        setSelectedTicket(prev => prev ? { ...prev, status: res.status } : prev)
        addTicketComment(selectedTicket.id, 'Ticket triaged and set to In Progress')
      } catch (err: any) {
        // fallback: optimistic update if backend fails for connectivity
        console.warn('Triage transition failed', err)
        alert(err?.response?.data?.error || err?.message || 'Failed to triage ticket')
      }
    })()
  }

  const isIncidentOrFault = (t?: string) => {
    const v = (t || '').toLowerCase()
    return v === 'incident' || v === 'fault'
  }
  const normalizeTicketTypeKey = (value?: string) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '')
  const getNonIncidentWorkflowButtons = () => {
    if (!selectedTicket) return []
    const typeKey = normalizeTicketTypeKey(selectedTicket.type)
    const status = String(selectedTicket.status || '')
    const statusKey = status.toLowerCase()
    const buttons: { label: string; onClick: () => void; className?: string }[] = [{ label: 'Back', onClick: closeDetail }]
    const go = (to: string, note?: string) => () => applyStatus(to, note || `Status updated to ${to}`)

    if (typeKey === 'servicerequest') {
      if (statusKey === 'new') {
        buttons.push({ label: 'Accept', onClick: handleAccept })
        buttons.push({ label: 'Request Approval', onClick: go('Awaiting Approval') })
        buttons.push({ label: 'Start', onClick: go('In Progress') })
        buttons.push({ label: 'Quick Close', onClick: go('Closed') })
      } else if (statusKey === 'awaiting approval') {
        buttons.push({ label: 'Approve', onClick: go('In Progress') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'in progress') {
        buttons.push({ label: 'Fulfill', onClick: go('Fulfilled') })
      } else if (statusKey === 'fulfilled') {
        buttons.push({ label: 'Close', onClick: go('Closed') })
      } else if (statusKey === 'closed') {
        buttons.push({ label: 'Re-open', onClick: go('In Progress', 'Re-opened') })
      }
      return buttons
    }
    if (typeKey === 'changerequestassetreplacement' || typeKey === 'changerequest') {
      if (statusKey === 'new') buttons.push({ label: 'Verify Asset', onClick: go('Under Verification') })
      else if (statusKey === 'under verification') buttons.push({ label: 'Send for Approval', onClick: go('Awaiting Approval') })
      else if (statusKey === 'awaiting approval') {
        buttons.push({ label: 'Approve', onClick: go('Approved') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'approved') {
        buttons.push({ label: 'Start Procurement', onClick: go('Procurement') })
        buttons.push({ label: 'Start Implementation', onClick: go('In Progress') })
      } else if (statusKey === 'procurement') buttons.push({ label: 'Start Implementation', onClick: go('In Progress') })
      else if (statusKey === 'in progress') buttons.push({ label: 'Complete Change', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'accessrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Send to Manager', onClick: go('Manager Approval') })
      else if (statusKey === 'manager approval') {
        buttons.push({ label: 'Approve', onClick: go('IT Approval') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'it approval') buttons.push({ label: 'IT Approve', onClick: go('Provisioning') })
      else if (statusKey === 'provisioning') buttons.push({ label: 'Provision Access', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'newstarterrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Confirm by HR', onClick: go('HR Confirmation') })
      else if (statusKey === 'hr confirmation') buttons.push({ label: 'Start IT Setup', onClick: go('IT Setup') })
      else if (statusKey === 'it setup') buttons.push({ label: 'Allocate Asset', onClick: go('Asset Allocation') })
      else if (statusKey === 'asset allocation') buttons.push({ label: 'Mark Ready', onClick: go('Ready for Joining') })
      else if (statusKey === 'ready for joining') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'leaverrequest') {
      if (statusKey === 'new') buttons.push({ label: 'HR Confirm', onClick: go('HR Confirmation') })
      else if (statusKey === 'hr confirmation') buttons.push({ label: 'Revoke Access', onClick: go('Access Revoked') })
      else if (statusKey === 'access revoked') buttons.push({ label: 'Collect Asset', onClick: go('Asset Collected') })
      else if (statusKey === 'asset collected') buttons.push({ label: 'Complete Offboarding', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'task') {
      if (statusKey === 'new') buttons.push({ label: 'Accept', onClick: go('Assigned') })
      else if (statusKey === 'assigned') buttons.push({ label: 'Start', onClick: go('In Progress') })
      else if (statusKey === 'in progress') buttons.push({ label: 'Complete', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'softwarerequest') {
      if (statusKey === 'new') buttons.push({ label: 'Request Approval', onClick: go('Manager Approval') })
      else if (statusKey === 'manager approval') {
        buttons.push({ label: 'Budget Approve', onClick: go('Budget Approval') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'budget approval') buttons.push({ label: 'Start Procurement', onClick: go('Procurement') })
      else if (statusKey === 'procurement') buttons.push({ label: 'Install Software', onClick: go('Installation') })
      else if (statusKey === 'installation') buttons.push({ label: 'Mark Completed', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'hrrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Send to HR', onClick: go('HR Review') })
      else if (statusKey === 'hr review') {
        buttons.push({ label: 'Start Review', onClick: go('In Progress') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'in progress') buttons.push({ label: 'Resolve', onClick: go('Resolved') })
      else if (statusKey === 'resolved') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    if (typeKey === 'peripheralrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Check Stock', onClick: go('Stock Check') })
      else if (statusKey === 'stock check') {
        buttons.push({ label: 'Request Approval', onClick: go('Approval') })
        buttons.push({ label: 'Issue Asset', onClick: go('Issued') })
      } else if (statusKey === 'approval') {
        buttons.push({ label: 'Issue Asset', onClick: go('Issued') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'issued') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons
    }
    return buttons
  }

  const closeDetail = () => {
    setShowDetailView(false)
    navigate('/tickets')
  }

  const getTicketActionState = (ticket: Incident | null) => {
    if (!ticket) return { ackSent: false, supplierLogged: false }
    const key = ticket.id
    const base = actionStateByTicket[key] || { ackSent: false, supplierLogged: false }
    const status = String(ticket.status || '').toLowerCase()
    const inferredAck = ['in progress', 'resolved', 'closed', 'with supplier', 'awaiting approval'].includes(status)
    const inferredSupplier = status.includes('supplier')
    return {
      ackSent: base.ackSent || inferredAck,
      supplierLogged: base.supplierLogged || inferredSupplier,
    }
  }

  const updateTicketStatusLocal = (ticketId: string, status: string) => {
    setIncidents((prev) => prev.map((i) => (i.id === ticketId ? { ...i, status } : i)))
    setSelectedTicket((prev) => (prev ? { ...prev, status } : prev))
  }

  const markTicketActionState = (ticketId: string, patch: Partial<{ ackSent: boolean; supplierLogged: boolean }>) => {
    setActionStateByTicket((prev) => ({
      ...prev,
      [ticketId]: {
        ackSent: prev[ticketId]?.ackSent || false,
        supplierLogged: prev[ticketId]?.supplierLogged || false,
        ...patch,
      },
    }))
  }

  const getComposerHeading = (
    mode: 'acknowledge' | 'emailUser' | 'logSupplier' | 'emailSupplier' | 'callbackSupplier' | 'approval' | 'resolve' | 'close' | 'noteEmail' = composerMode
  ) => {
    if (mode === 'acknowledge') return 'Acknowledge'
    if (mode === 'emailUser') return 'Email End User'
    if (mode === 'logSupplier') return 'Log With Supplier'
    if (mode === 'emailSupplier') return 'Email Supplier'
    if (mode === 'callbackSupplier') return 'Call Back Supplier'
    if (mode === 'approval') return 'Approval Request'
    if (mode === 'resolve') return 'Resolve Ticket'
    if (mode === 'close') return 'Close Ticket'
    return 'Note + Email'
  }

  const getEndUserAutoRecipient = () => {
    const email = String(endUser?.email || '').trim()
    if (email) return email
    const fallback = String(selectedTicket?.endUser || '').trim()
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fallback)) return fallback
    return ''
  }

  const openComposer = (
    mode: 'acknowledge' | 'emailUser' | 'logSupplier' | 'emailSupplier' | 'callbackSupplier' | 'approval' | 'resolve' | 'close' | 'noteEmail'
  ) => {
    if (!selectedTicket) return
    setComposerMode(mode)
    const toDefault = mode === 'emailUser' || mode === 'acknowledge' || mode === 'resolve' || mode === 'close' || mode === 'noteEmail'
      ? getEndUserAutoRecipient()
      : ''
    const subjectPrefix = `[${selectedTicket.id}] ${selectedTicket.subject}`
    const subjectDefault =
      mode === 'logSupplier' ? `Supplier log - ${subjectPrefix}` :
      mode === 'approval' ? `Approval needed - ${subjectPrefix}` :
      mode === 'resolve' ? `Resolution update - ${subjectPrefix}` :
      mode === 'close' ? `Ticket closed - ${subjectPrefix}` :
      mode === 'acknowledge' ? `Acknowledged - ${subjectPrefix}` :
      `Update - ${subjectPrefix}`

    setComposerForm((prev) => ({
      ...prev,
      to: toDefault,
      cc: '',
      bcc: '',
      subject: subjectDefault,
      body: '',
      currentAction: '',
      nextAction: '',
      asset: '',
    }))
    setComposerAttachments([])
    setShowCcField(false)
    setShowBccField(false)
    setComposerMenuOpen(false)
    setShowActionComposer(true)
  }

  const getActionButtons = () => {
    if (!selectedTicket) return []
    if (!isIncidentOrFault(selectedTicket.type)) return getNonIncidentWorkflowButtons()
    if (user?.role === 'USER') {
      return [{ label: 'Back', onClick: closeDetail }]
    }

    const status = (selectedTicket.status || '').toLowerCase()
    const actionState = getTicketActionState(selectedTicket)
    const buttons: { label: string; onClick: () => void; className?: string }[] = []

    buttons.push({ label: 'Back', onClick: closeDetail })

    if (status === 'closed') {
      buttons.push({ label: 'Re-open', onClick: () => applyStatus('In Progress', 'Re-opened') })
      buttons.push({ label: 'Internal note', onClick: () => setShowInternalNoteEditor(true) })
      buttons.push({ label: 'Email User', onClick: () => openComposer('emailUser') })
      return buttons
    }

    if (status === 'new') buttons.push({ label: 'Accept', onClick: handleAccept })

    if (!actionState.ackSent) buttons.push({ label: 'Acknowledge', onClick: () => openComposer('acknowledge') })
    buttons.push({ label: 'Email User', onClick: () => openComposer('emailUser') })

    if (!actionState.supplierLogged) {
      buttons.push({ label: 'Log to Supplier', onClick: () => openComposer('logSupplier') })
    } else {
      buttons.push({ label: 'Email Supplier', onClick: () => openComposer('emailSupplier') })
      buttons.push({ label: 'Call Back Supplier', onClick: () => openComposer('callbackSupplier') })
    }

    buttons.push({ label: 'Internal note', onClick: () => setShowInternalNoteEditor(true) })
    buttons.push({ label: 'Note + Email', onClick: () => openComposer('noteEmail') })
    buttons.push({ label: 'Approval', onClick: () => openComposer('approval') })
    buttons.push({ label: 'Resolve', onClick: () => openComposer('resolve') })
    buttons.push({ label: 'Close', onClick: () => openComposer('close') })
    return buttons
  }

  const actionIconMap: Record<string, string> = {
    Back: 'arrow-left',
    Accept: 'circle-check-big',
    Acknowledge: 'check',
    'Internal note': 'sticky-note',
    Close: 'circle-x',
    'Email User': 'mail',
    'Log to Supplier': 'package',
    Approval: 'clipboard-check',
    'Note + Email': 'mail-plus',
    'Call Back Supplier': 'phone-call',
    Resolve: 'circle-check-big',
    'Re-open': 'rotate-ccw',
    Reclose: 'lock',
    'Email Supplier': 'send',
    'Recall to Approval': 'refresh-ccw',
    'Waiting for Approval': 'clipboard-check',
    'In Progress': 'refresh-ccw',
    Acknowledged: 'check',
  }

  const isOpenStatus = (status: string) => {
    const s = (status || '').toLowerCase()
    return s !== 'closed' && s !== 'resolved'
  }

  // Compute queue counts early before queueSidebar JSX uses them
  const openIncidents = incidents.filter((i) => isOpenStatus(i.status))
  const visibleTicketQueues = ticketQueues.filter((q) => {
    if (!Array.isArray(q.visibilityRoles) || q.visibilityRoles.length === 0) return true
    return q.visibilityRoles.map((r) => String(r || '').toUpperCase()).includes(String(user?.role || '').toUpperCase())
  }).filter((q) => {
    const label = String(q.label || '').trim().toLowerCase()
    // Remove legacy/dev pseudo-queues from rendering.
    return label !== 'helpdesk' && label !== 'service request'
  })
  const mapTeam = (incident: Incident): { team: string; forcedUnassigned: boolean } => {
    const category = String(incident.category || '').trim()
    const matchedQueue = visibleTicketQueues.find(
      (queue) => queue.label.trim().toLowerCase() === category.toLowerCase()
    )
    if (matchedQueue) return { team: matchedQueue.label, forcedUnassigned: false }
    // Unknown/new categories are routed to Support Desk as unassigned.
    return { team: 'Support Desk', forcedUnassigned: true }
  }
  const countUnassigned = openIncidents.filter((i) => !i.assignedAgentId && !i.assignedAgentName).length
  const countWithSupplier = openIncidents.filter((i) => {
    const s = (i.status || '').toLowerCase()
    return s.includes('supplier')
  }).length
  const teamBuckets = openIncidents.reduce<Record<string, number>>((acc, i) => {
    const t = mapTeam(i).team
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const teamGroups = (() => {
    const groups: Record<string, { total: number; unassigned: number; agents: Record<string, { label: string; count: number }> }> = {}

    // Always show configured ticket queues in the team panel, even when count is 0.
    visibleTicketQueues.forEach((queue) => {
      const key = String(queue.label || '').trim()
      if (!key || groups[key]) return
      groups[key] = { total: 0, unassigned: 0, agents: {} }
    })
    if (!groups['Support Desk']) groups['Support Desk'] = { total: 0, unassigned: 0, agents: {} }

    openIncidents.forEach((incident) => {
      const mapped = mapTeam(incident)
      const team = mapped.team
      if (!groups[team]) groups[team] = { total: 0, unassigned: 0, agents: {} }
      groups[team].total += 1
      const agentKey = String(incident.assignedAgentId || incident.assignedAgentName || '').trim()
      if (mapped.forcedUnassigned || !agentKey) {
        groups[team].unassigned += 1
        return
      }
      const label = incident.assignedAgentName || String(incident.assignedAgentId)
      if (!groups[team].agents[agentKey]) groups[team].agents[agentKey] = { label, count: 0 }
      groups[team].agents[agentKey].count += 1
    })

    return groups
  })()
  const typeBuckets = openIncidents.reduce<Record<string, number>>((acc, i) => {
    const t = i.type || 'Unknown'
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const statusBuckets = openIncidents.reduce<Record<string, number>>((acc, i) => {
    const s = i.status || 'Unknown'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  const myListCounts: Record<string, number> = {
    all: incidents.length,
    open: openIncidents.length,
    closed: incidents.filter((i) => String(i.status || '').toLowerCase() === 'closed').length,
    breached: incidents.filter((i) => String(i.slaTimeLeft || '').startsWith('-')).length,
    hold: incidents.filter((i) => {
      const status = String(i.status || '').toLowerCase()
      const sla = String(i.slaTimeLeft || '').toLowerCase()
      return status.includes('hold') || sla.includes('hold')
    }).length,
  }
  const queueViews = [
    { key: 'myLists', label: 'My Lists', icon: '?' },
    { key: 'staff', label: 'Tickets by Staff', icon: '?' },
    { key: 'team', label: 'Tickets by Team', icon: '??' },
    { key: 'type', label: 'Tickets by Ticket Type', icon: '??' },
    { key: 'status', label: 'Tickets by Status', icon: '?' },
    { key: 'all', label: 'All Tickets', icon: '?' },
  ] as const
  const queueViewTitle: Record<typeof queueView, string> = {
    all: 'All Tickets',
    team: 'Tickets by Team',
    staff: 'Tickets by Staff',
    type: 'Tickets by Ticket Type',
    status: 'Tickets by Status',
    myLists: 'My Lists',
  }
  const renderQueueHeaderIcon = () => {
    if (queueView === 'staff') {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="3.5" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </svg>
      )
    }
    if (queueView === 'team') {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="7" r="3" />
          <circle cx="17" cy="8" r="2.5" />
          <path d="M2 20a7 7 0 0 1 14 0" />
          <path d="M14 20a5 5 0 0 1 8 0" />
        </svg>
      )
    }
    if (queueView === 'type') {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20.6 13.4 11 23l-9-9 9.6-9.6a2 2 0 0 1 1.4-.6H20a2 2 0 0 1 2 2v7a2 2 0 0 1-.6 1.4Z" />
          <circle cx="16" cy="8" r="1" />
        </svg>
      )
    }
    if (queueView === 'status') {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </svg>
      )
    }
    if (queueView === 'myLists') {
      return (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
    )
  }

  const queueSidebar = (!queueCollapsed && queueRoot) ? createPortal(
    <aside className="ticket-queue-sidebar">
      <div className="queue-header">
        <div className="queue-title-icon" aria-hidden="true">{renderQueueHeaderIcon()}</div>
        <div className="queue-title">
          <div className="queue-title-top">
            <button className="queue-title-btn" onClick={() => setQueueView('all')} title="Select queue view">
              <div className="queue-title-text">{queueViewTitle[queueView]}</div>
            </button>
            <button className="queue-edit-btn" onClick={() => setQueueView('all')} title="Change ticket queue">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
        </div>
        <button
          className="queue-collapse-btn"
          title="Hide Menu"
          onClick={() => setQueueCollapsed(true)}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="13 18 7 12 13 6" />
            <polyline points="19 18 13 12 19 6" />
          </svg>
        </button>
      </div>
      <div className="queue-list">
        {queueView === 'all' && (
          <>
            {queueViews.map((v) => (
              <div key={v.key} className={`queue-item${queueView === v.key ? ' queue-item-active' : ''}`} onClick={() => setQueueView(v.key)}>
                <div className="queue-avatar">{v.icon}</div>
                <div className="queue-name">{v.label}</div>
              </div>
            ))}
          </>
        )}
        {queueView === 'team' && (
          <>
            {Object.entries(teamGroups).map(([team, group]) => {
              const isExpanded = expandedTeams.includes(team)
              return (
                <React.Fragment key={team}>
                  <div
                    className={`queue-item${queueFilter.type === 'team' && queueFilter.value === team ? ' queue-item-active' : ''}`}
                    onClick={() => {
                      setExpandedTeams((prev) => prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team])
                      setQueueFilter((prev) => prev.type === 'team' && prev.value === team ? { type: 'all' } : { type: 'team', value: team })
                    }}
                  >
                    <div className="queue-avatar">
                      <span className={`queue-caret${isExpanded ? ' queue-caret-down' : ''}`}>{'>'}</span>
                    </div>
                    <div className="queue-name">{team}</div>
                    <div className="queue-count">{group.total}</div>
                  </div>
                  {isExpanded && (
                    <>
                      <div
                        className={`queue-item queue-item-child${queueFilter.type === 'teamUnassigned' && queueFilter.team === team ? ' queue-item-active' : ''}`}
                        onClick={() => {
                          setQueueFilter((prev) => prev.type === 'teamUnassigned' && prev.team === team ? { type: 'all' } : { type: 'teamUnassigned', team })
                        }}
                      >
                        <div className="queue-avatar queue-avatar-dark">U</div>
                        <div className="queue-name">Unassigned</div>
                        <div className="queue-count">{group.unassigned}</div>
                      </div>
                      {Object.entries(group.agents).map(([agentKey, agent]) => (
                        <div
                          key={`${team}-${agentKey}`}
                          className={`queue-item queue-item-child${queueFilter.type === 'teamAgent' && queueFilter.team === team && queueFilter.value === agentKey ? ' queue-item-active' : ''}`}
                          onClick={() => {
                            setQueueFilter((prev) =>
                              prev.type === 'teamAgent' && prev.team === team && prev.value === agentKey
                                ? { type: 'all' }
                                : { type: 'teamAgent', team, value: agentKey }
                            )
                          }}
                        >
                          {(() => {
                            const record = findAgentRecord(agentKey, agent.label)
                            const presenceClass = getAgentPresenceClass(record || { id: agentKey, name: agent.label })
                            return (
                          <div className="queue-avatar queue-avatar-with-presence">
                            {renderQueueAgentAvatar(record || { id: agentKey, name: agent.label }, agent.label)}
                            {shouldShowQueuePresenceDot(presenceClass) ? (
                              <span className={`queue-avatar-presence queue-avatar-presence-${presenceClass}`} />
                            ) : null}
                          </div>
                            )
                          })()}
                          <div className="queue-name">{agent.label}</div>
                          <div className="queue-count">{agent.count}</div>
                        </div>
                      ))}
                    </>
                  )}
                </React.Fragment>
              )
            })}
          </>
        )}
        {queueView === 'staff' && (
          <>
            <div className={`queue-item${queueFilter.type === 'unassigned' ? ' queue-item-active' : ''}`} onClick={() => setQueueFilter((prev) => prev.type === 'unassigned' ? { type: 'all' } : { type: 'unassigned' })}>
              <div className="queue-avatar queue-avatar-dark">U</div>
              <div className="queue-name">Unassigned</div>
              <div className="queue-count">{countUnassigned}</div>
            </div>
            {agents.map((a) => (
              <div
                key={`agent-${a.id}`}
                className={`queue-item${queueFilter.type === 'agent' && String(queueFilter.agentId || '') === String(a.id) ? ' queue-item-active' : ''}`}
                onClick={() => {
                  const displayName = getAgentDisplayName(a)
                  setQueueFilter((prev) => prev.type === 'agent' && String(prev.agentId || '') === String(a.id) ? { type: 'all' } : { type: 'agent', agentId: String(a.id), agentName: displayName })
                }}
              >
                <div className="queue-avatar queue-avatar-with-presence">
                  {renderQueueAgentAvatar(a, getAgentDisplayName(a))}
                  {(() => {
                    const presenceClass = getAgentPresenceClass(a)
                    return shouldShowQueuePresenceDot(presenceClass) ? (
                      <span className={`queue-avatar-presence queue-avatar-presence-${presenceClass}`} />
                    ) : null
                  })()}
                </div>
                <div className="queue-name">{getAgentDisplayName(a)}</div>
                <div className="queue-count">
                  {openIncidents.filter((i) => {
                    const byId = String(i.assignedAgentId || '') === String(a.id)
                    const byName = i.assignedAgentName && getAgentDisplayName(a) && i.assignedAgentName === getAgentDisplayName(a)
                    return byId || byName
                  }).length}
                </div>
              </div>
            ))}
          </>
        )}
        {queueView === 'type' && (
          <>
            {Object.entries(typeBuckets).map(([type, count]) => (
              <div
                key={type}
                className={`queue-item${queueFilter.type === 'ticketType' && queueFilter.value === type ? ' queue-item-active' : ''}`}
                onClick={() => setQueueFilter((prev) => prev.type === 'ticketType' && prev.value === type ? { type: 'all' } : { type: 'ticketType', value: type })}
              >
                <div className="queue-avatar">{type.trim()[0]?.toUpperCase() || 'T'}</div>
                <div className="queue-name">{type}</div>
                <div className="queue-count">{count}</div>
              </div>
            ))}
          </>
        )}
        {queueView === 'status' && (
          <>
            {Object.entries(statusBuckets).map(([status, count]) => (
              <div
                key={status}
                className={`queue-item${queueFilter.type === 'status' && queueFilter.value === status ? ' queue-item-active' : ''}`}
                onClick={() => setQueueFilter((prev) => prev.type === 'status' && prev.value === status ? { type: 'all' } : { type: 'status', value: status })}
              >
                <div className="queue-avatar">{status.trim()[0]?.toUpperCase() || 'S'}</div>
                <div className="queue-name">{status}</div>
                <div className="queue-count">{count}</div>
              </div>
            ))}
          </>
        )}
        {queueView === 'myLists' && (
          <>
            {ticketMyListRules.map((rule) => (
              <div
                key={rule.id}
                className={`queue-item${queueFilter.type === 'myList' && queueFilter.value === rule.id ? ' queue-item-active' : ''}`}
                onClick={() => setQueueFilter((prev) => prev.type === 'myList' && prev.value === rule.id ? { type: 'all' } : { type: 'myList', value: rule.id })}
              >
                <div className="queue-avatar">{rule.label.trim()[0]?.toUpperCase() || 'M'}</div>
                <div className="queue-name">{rule.label}</div>
                <div className="queue-count">
                  {rule.field === 'status' && String(rule.value).toLowerCase() === 'all'
                    ? myListCounts.all
                    : rule.field === 'status' && String(rule.value).toLowerCase() === 'open'
                    ? myListCounts.open
                    : rule.field === 'status' && String(rule.value).toLowerCase() === 'closed'
                      ? myListCounts.closed
                      : rule.field === 'sla'
                        ? (String(rule.value).toLowerCase() === 'hold' ? myListCounts.hold : myListCounts.breached)
                        : openIncidents.filter((i) => String((i as any)[rule.field] || '').toLowerCase() === String(rule.value || '').toLowerCase()).length}
                </div>
              </div>
            ))}
          </>
        )}
        {queueView === 'staff' && (
          <div
            className={`queue-item${queueFilter.type === 'supplier' ? ' queue-item-active' : ''}`}
            onClick={() => {
              setQueueFilter((prev) => prev.type === 'supplier' ? { type: 'all' } : { type: 'supplier' })
            }}
          >
            <div className="queue-avatar queue-avatar-accent">S</div>
            <div className="queue-name">With Supplier</div>
            <div className="queue-count">{countWithSupplier}</div>
          </div>
        )}
      </div>
    </aside>,
    queueRoot
  ) : null

  function getInitials(name: string) {
    const safe = String(name || '').trim()
    if (!safe) return 'NA'
    const parts = safe.split(' ').filter(Boolean)
    if (parts.length === 0) return 'NA'
    return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
  }

  const sanitizeAvatarSrc = (value: unknown): string => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const lower = raw.toLowerCase()
    if (lower.startsWith('data:') && raw.length > 120000) return ''
    if (
      lower.startsWith('http://') ||
      lower.startsWith('https://') ||
      lower.startsWith('blob:') ||
      lower.startsWith('data:image/')
    ) {
      return raw
    }
    return ''
  }

  const getInboundDisplayUser = () => {
    const name = String(endUser?.name || endUser?.username || endUser?.email || selectedTicket?.endUser || 'End User').trim()
    const email = String(endUser?.email || '').trim().toLowerCase()
    const username = String(endUser?.username || '').trim().toLowerCase()
    const avatarUrl = sanitizeAvatarSrc(String(
      endUser?.avatarUrl ||
      endUser?.profilePic ||
      endUser?.avatar ||
      endUser?.photoUrl ||
      endUser?.imageUrl ||
      ''
    ).trim())
    return { name, email, username, avatarUrl }
  }

  const resolveCommentIdentity = (authorRaw: string) => {
    const inbound = getInboundDisplayUser()
    const author = String(authorRaw || '').trim()
    const lower = author.toLowerCase()
    if (!author) {
      return { name: inbound.name || 'End User', avatarUrl: inbound.avatarUrl, initials: getInitials(inbound.name || 'End User') }
    }
    if (lower && (lower === inbound.email || lower === inbound.username || lower === inbound.name.toLowerCase())) {
      return { name: inbound.name, avatarUrl: inbound.avatarUrl, initials: getInitials(inbound.name) }
    }
    return { name: author || 'Unknown', avatarUrl: '', initials: getInitials(author || 'Unknown') }
  }

  const handleAccept = () => {
    if (!selectedTicket) return
    const assigneeName = getCurrentAgentName()
    const assigneeId = user?.id ? String(user.id) : assigneeName
    setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: 'Acknowledged', assignedAgentId: assigneeId, assignedAgentName: assigneeName } : i))
    setSelectedTicket(prev => prev ? { ...prev, status: 'Acknowledged', assignedAgentId: assigneeId, assignedAgentName: assigneeName } : prev)
    addTicketComment(selectedTicket.id, `Accepted by ${assigneeName}`)
    markTicketActionState(selectedTicket.id, { ackSent: false })
    if (user?.id) {
      ticketService.updateTicket(selectedTicket.id, { assigneeId: Number(user.id) }).catch((err) => {
        console.warn('Assign after accept failed', err)
      })
    }
  }

  const renderActionIcon = (label: string) => {
    const icon = actionIconMap[label]
    if (!icon) return null
    const src = `https://unpkg.com/lucide-static@latest/icons/${icon}.svg`
    return <img className="action-icon" src={src} alt="" aria-hidden="true" />
  }

  const formatAttachmentSize = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const pushAttachments = (files: FileList | null, target: 'composer' | 'note') => {
    if (!files || files.length === 0) return
    const incoming = Array.from(files)
    const tooLarge = incoming.find((f) => f.size > MAX_ATTACHMENT_BYTES)
    if (tooLarge) {
      alert(`"${tooLarge.name}" exceeds 32MB. Maximum allowed is 32MB per file.`)
      return
    }
    const mapped = incoming.map((file) => ({ key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`, file }))
    if (target === 'composer') {
      setComposerAttachments((prev) => [...prev, ...mapped])
    } else {
      setInternalNoteAttachments((prev) => [...prev, ...mapped])
    }
  }

  const removeAttachment = (key: string, target: 'composer' | 'note') => {
    if (target === 'composer') {
      setComposerAttachments((prev) => prev.filter((a) => a.key !== key))
    } else {
      setInternalNoteAttachments((prev) => prev.filter((a) => a.key !== key))
    }
  }

  const readFileAsBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = String(reader.result || '')
        const base64 = result.includes(',') ? result.split(',')[1] : result
        if (!base64) reject(new Error(`Failed to read file "${file.name}"`))
        else resolve(base64)
      }
      reader.onerror = () => reject(new Error(`Failed to read file "${file.name}"`))
      reader.readAsDataURL(file)
    })

  const uploadSelectedAttachments = async (ticketId: string, localFiles: LocalAttachment[]) => {
    if (!localFiles.length) return []
    const total = localFiles.reduce((sum, a) => sum + a.file.size, 0)
    if (total > MAX_ATTACHMENT_BYTES) {
      throw new Error('Total selected attachment size exceeds 32MB.')
    }
    setIsUploadingAttachments(true)
    try {
      const filesPayload = await Promise.all(
        localFiles.map(async (a) => ({
          name: a.file.name,
          type: a.file.type || 'application/octet-stream',
          size: a.file.size,
          contentBase64: await readFileAsBase64(a.file),
        }))
      )
      const uploaded = await ticketService.uploadAttachments(ticketId, { files: filesPayload })
      return Array.isArray(uploaded?.items) ? uploaded.items : []
    } finally {
      setIsUploadingAttachments(false)
    }
  }

  const applyStatus = async (toStatus: string, note?: string) => {
    if (!selectedTicket) return
    try {
      const res = await ticketService.transitionTicket(selectedTicket.id, toStatus)
      setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: res.status } : i))
      setSelectedTicket(prev => prev ? { ...prev, status: res.status } : prev)
      addTicketComment(selectedTicket.id, note || `Status updated to ${toStatus}`)
    } catch (err: any) {
      alert(err?.response?.data?.error || err?.message || `Failed to set status: ${toStatus}`)
    }
  }

  const handleOpenGChat = () => {
    if (!selectedTicket) return
    addTicketComment(selectedTicket.id, 'Opened GChat')
    // Open Google Chat in a new tab/window
    window.open('https://chat.google.com/')
  }

  const handleAddNote = () => {
    if (!selectedTicket) return
    // Quick prompt to add a note and persist to backend if available
    const note = window.prompt('Enter note to add to ticket:')
    if (!note) return
    // optimistic UI update
    addTicketComment(selectedTicket.id, note)
    // try to persist to backend as a private note
    ticketService.privateNote(selectedTicket.id, { note }).catch(() => {
      // ignore errors — kept in UI as demo
    })
  }

  const handleSendActionComposer = async () => {
    if (!selectedTicket) return
    const body = composerForm.body.trim()
    if (!body) {
      alert('Please enter message')
      return
    }

    try {
      const uploadedItems = await uploadSelectedAttachments(selectedTicket.id, composerAttachments)
      const attachmentIds = uploadedItems.map((a: any) => Number(a.id)).filter((n: number) => Number.isFinite(n))
      const attachmentLabel = uploadedItems.length
        ? `\nAttachments: ${uploadedItems.map((a: any) => a.filename).join(', ')}`
        : ''

      if (composerMode === 'resolve') {
        await ticketService.resolveTicketWithDetails(selectedTicket.id, {
          resolution: body,
          resolutionCategory: composerForm.issueDetail || undefined,
          sendEmail: Boolean(composerForm.to.trim()),
        })
        if (attachmentIds.length) {
          await ticketService.privateNote(selectedTicket.id, {
            note: `Resolution attachments uploaded${attachmentLabel}`,
            attachmentIds,
          })
        }
        updateTicketStatusLocal(selectedTicket.id, 'Resolved')
        addTicketComment(selectedTicket.id, `Resolved: ${body}`)
      } else if (composerMode === 'close') {
        if (composerForm.to.trim()) {
          await ticketService.respond(selectedTicket.id, {
            message: body,
            sendEmail: true,
            to: composerForm.to.trim(),
            cc: composerForm.cc.trim() || undefined,
            bcc: composerForm.bcc.trim() || undefined,
            subject: composerForm.subject.trim() || `Ticket closed - ${selectedTicket.id}`,
            attachmentIds,
          })
        } else if (attachmentIds.length) {
          await ticketService.privateNote(selectedTicket.id, {
            note: `Closure attachments uploaded${attachmentLabel}`,
            attachmentIds,
          })
        }
        await ticketService.transitionTicket(selectedTicket.id, 'Closed')
        updateTicketStatusLocal(selectedTicket.id, 'Closed')
        addTicketComment(selectedTicket.id, `Closed: ${body}`)
      } else if (composerMode === 'noteEmail') {
        await ticketService.privateNote(selectedTicket.id, { note: body, attachmentIds })
        if (composerForm.to.trim()) {
          await ticketService.respond(selectedTicket.id, {
            message: body,
            sendEmail: true,
            to: composerForm.to.trim(),
            cc: composerForm.cc.trim() || undefined,
            bcc: composerForm.bcc.trim() || undefined,
            subject: composerForm.subject.trim() || `Update - ${selectedTicket.id}`,
            attachmentIds,
          })
        }
        addTicketComment(selectedTicket.id, `Note + Email: ${body}`)
      } else {
        await ticketService.respond(selectedTicket.id, {
          message: body,
          sendEmail: Boolean(composerForm.to.trim()),
          to: composerForm.to.trim() || undefined,
          cc: composerForm.cc.trim() || undefined,
          bcc: composerForm.bcc.trim() || undefined,
          subject: composerForm.subject.trim() || undefined,
          attachmentIds,
        })
        addTicketComment(selectedTicket.id, `${getComposerHeading()}: ${body}`)

        if (composerMode === 'acknowledge') {
          await ticketSvc.transitionTicket(selectedTicket.id, 'In Progress').catch(() => undefined)
          updateTicketStatusLocal(selectedTicket.id, 'In Progress')
          markTicketActionState(selectedTicket.id, { ackSent: true })
        }
        if (composerMode === 'approval') {
          await ticketSvc.transitionTicket(selectedTicket.id, 'Awaiting Approval').catch(() => undefined)
          updateTicketStatusLocal(selectedTicket.id, 'Awaiting Approval')
        }
        if (composerMode === 'logSupplier') {
          updateTicketStatusLocal(selectedTicket.id, 'With Supplier')
          markTicketActionState(selectedTicket.id, { supplierLogged: true })
        }
      }
      setComposerAttachments([])
      setShowActionComposer(false)
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to send action')
    }
  }

  const handleSaveInternalNote = async () => {
    if (!selectedTicket) return
    const note = internalNoteForm.body.trim()
    if (!note) {
      alert('Please enter internal note')
      return
    }
    addTicketComment(selectedTicket.id, `Internal: ${note}`)
    try {
      const uploadedItems = await uploadSelectedAttachments(selectedTicket.id, internalNoteAttachments)
      const attachmentIds = uploadedItems.map((a: any) => Number(a.id)).filter((n: number) => Number.isFinite(n))
      await ticketService.privateNote(selectedTicket.id, { note, attachmentIds })
      if (internalNoteForm.status && internalNoteForm.status !== selectedTicket.status) {
        await ticketSvc.transitionTicket(selectedTicket.id, internalNoteForm.status).catch(() => undefined)
        updateTicketStatusLocal(selectedTicket.id, internalNoteForm.status)
      }
      setInternalNoteAttachments([])
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to save internal note')
    }
    setShowInternalNoteEditor(false)
  }

  const loadAssetsForTicket = async (q = '') => {
    try {
      const res = await assetService.listAssets({ page: 1, pageSize: 20, q })
      const items = Array.isArray(res) ? res : (res?.items || [])
      setAssetList(items)
    } catch (e) {
      console.warn('Failed to load assets', e)
    }
  }

  const handleAssignAsset = async () => {
    if (!selectedTicket) return
    if (!assetAssignId) return alert('Select an asset')
    try {
      const updated = await ticketService.assignAsset(selectedTicket.id, Number(assetAssignId))
      setTicketAsset(updated.asset || null)
      addTicketComment(selectedTicket.id, `Asset assigned: ${updated.asset?.name || 'Asset #' + assetAssignId}`)
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to assign asset')
    }
  }

  const handleUnassignAsset = async () => {
    if (!selectedTicket) return
    try {
      await ticketService.unassignAsset(selectedTicket.id)
      setTicketAsset(null)
      setAssetAssignId('')
      addTicketComment(selectedTicket.id, 'Asset unassigned')
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to unassign asset')
    }
  }

  const handleEditTicket = async () => {
    if (!selectedTicket) return
    const newSubject = window.prompt('Update subject', selectedTicket.subject)
    if (newSubject === null) return
    const newDescription = window.prompt('Update description', '') || undefined
    try {
      const updated = await ticketService.updateTicket(selectedTicket.id, { subject: newSubject, description: newDescription })
      const updatedSubject = updated.subject || newSubject
      setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, subject: updatedSubject } : i))
      setSelectedTicket(prev => prev ? { ...prev, subject: updatedSubject } : prev)
      addTicketComment(selectedTicket.id, 'Ticket updated')
    } catch (err: any) {
      alert('Failed to update ticket')
    }
  }

  const handleDeleteTicket = async () => {
    if (!selectedTicket) return
    if (!confirm('Delete this ticket? This cannot be undone.')) return
    try {
      await ticketService.deleteTicket(selectedTicket.id)
      setIncidents(prev => prev.filter(i => i.id !== selectedTicket.id))
      closeDetail()
      setSelectedTicket(null)
      addTicketComment(selectedTicket.id, 'Ticket deleted')
    } catch (err: any) {
      alert('Failed to delete ticket')
    }
  }

  // Listen for demo actions dispatched by the ticket demo/modal
  React.useEffect(() => {
    const handler = (ev: any) => {
      const detail = ev?.detail || {}
      const action = detail.action
      const message = detail.message

      // operate on currently selected ticket; if none, pick first incident
      const target = selectedTicket || incidents[0]
      if (!target) return

      if (action === 'email') {
        addTicketComment(target.id, message || 'Email user action started')
        // for demo open mailto (keeps behavior similar to earlier handler)
        const subject = encodeURIComponent(`[${target.id}] ${target.subject}`)
        window.open(`mailto:${detail.to || 'admin@example.com'}?subject=${subject}`)
      } else if (action === 'log') {
        addTicketComment(target.id, message || 'Logged to supplier')
      } else if (action === 'resolve') {
        const updated = incidents.map(i => i.id === target.id ? { ...i, status: 'Closed' as Incident['status'] } : i)
        setIncidents(updated)
        setSelectedTicket(prev => prev ? { ...prev, status: 'Closed' } : prev)
        addTicketComment(target.id, message || 'Ticket resolved/closed')
      }
    }

    window.addEventListener('ticket-action', handler)
    return () => window.removeEventListener('ticket-action', handler)
  }, [selectedTicket, incidents])

  const filteredIncidents = incidents.filter(incident => {
    // Filter by filter type
    let filterMatch = false
    if (filterType === 'All Tickets') {
      filterMatch = true
    } else if (filterType === 'Closed Tickets') {
      // Closed Tickets: only incidents whose status is exactly 'Closed'
      filterMatch = incident.status === 'Closed'
    } else if (filterType === 'Open Tickets') {
      // Open Tickets: any ticket that is NOT Closed should be considered open
      filterMatch = incident.status !== 'Closed'
    }
    if (!filterMatch) return false

    // Filter by global search
    if (globalSearch.trim()) {
      const searchLower = globalSearch.toLowerCase()
      const globalMatch = (
          incident.id.toLowerCase().includes(searchLower) ||
          incident.subject.toLowerCase().includes(searchLower) ||
          incident.category.toLowerCase().includes(searchLower) ||
          String(incident.slaTimeLeft || '').toLowerCase().includes(searchLower) ||
          incident.priority.toLowerCase().includes(searchLower) ||
          incident.status.toLowerCase().includes(searchLower) ||
          incident.type.toLowerCase().includes(searchLower) ||
          incident.dateReported.toLowerCase().includes(searchLower)
        )
      if (!globalMatch) return false
    }

    // Filter by column-specific searches
    if (searchValues.id && !incident.id.toLowerCase().includes(searchValues.id.toLowerCase())) return false
    if (searchValues.subject && !incident.subject.toLowerCase().includes(searchValues.subject.toLowerCase())) return false
      if (searchValues.category && !incident.category.toLowerCase().includes(searchValues.category.toLowerCase())) return false
      if (searchValues.slaTimeLeft && !String(incident.slaTimeLeft || '').toLowerCase().includes(searchValues.slaTimeLeft.toLowerCase())) return false
      if (searchValues.priority && !incident.priority.toLowerCase().includes(searchValues.priority.toLowerCase())) return false
      if (searchValues.status && !incident.status.toLowerCase().includes(searchValues.status.toLowerCase())) return false
      if (searchValues.type && !incident.type.toLowerCase().includes(searchValues.type.toLowerCase())) return false
      if (searchValues.endUser && !incident.endUser.toLowerCase().includes(searchValues.endUser.toLowerCase())) return false
    if (searchValues.lastAction && !incident.lastAction.toLowerCase().includes(searchValues.lastAction.toLowerCase())) return false
    if (searchValues.dateReported && !incident.dateReported.toLowerCase().includes(searchValues.dateReported.toLowerCase())) return false

    // Filter by queue selection (unassigned / agent / supplier)
    if (queueFilter.type === 'unassigned') {
      if (incident.assignedAgentId || incident.assignedAgentName) return false
    } else if (queueFilter.type === 'supplier') {
      const s = (incident.status || '').toLowerCase()
      if (!s.includes('supplier')) return false
    } else if (queueFilter.type === 'agent') {
      const byId = queueFilter.agentId && String(incident.assignedAgentId || '') === String(queueFilter.agentId)
      const byName = queueFilter.agentName && incident.assignedAgentName && incident.assignedAgentName === queueFilter.agentName
      if (!byId && !byName) return false
    } else if (queueFilter.type === 'team') {
      if (mapTeam(incident).team !== queueFilter.value) return false
    } else if (queueFilter.type === 'teamUnassigned') {
      const mapped = mapTeam(incident)
      if (mapped.team !== queueFilter.team) return false
      if (!mapped.forcedUnassigned && (incident.assignedAgentId || incident.assignedAgentName)) return false
    } else if (queueFilter.type === 'teamAgent') {
      const mapped = mapTeam(incident)
      if (mapped.team !== queueFilter.team) return false
      if (mapped.forcedUnassigned) return false
      const agentKey = String(incident.assignedAgentId || incident.assignedAgentName || '').trim()
      if (!agentKey || agentKey !== String(queueFilter.value || '')) return false
    } else if (queueFilter.type === 'ticketType') {
      if (String(incident.type || '') !== String(queueFilter.value || '')) return false
    } else if (queueFilter.type === 'status') {
      if (String(incident.status || '') !== String(queueFilter.value || '')) return false
    } else if (queueFilter.type === 'myList') {
      const rule = ticketMyListRules.find((r) => r.id === queueFilter.value)
      if (rule) {
        if (rule.field === 'sla' && rule.value === 'breach' && !String(incident.slaTimeLeft || '').startsWith('-')) return false
        if (rule.field === 'sla' && String(rule.value).toLowerCase() === 'hold') {
          const status = String(incident.status || '').toLowerCase()
          const sla = String(incident.slaTimeLeft || '').toLowerCase()
          if (!status.includes('hold') && !sla.includes('hold')) return false
        }
        if (rule.field === 'status' && rule.value.toLowerCase() === 'open') {
          const s = String(incident.status || '').toLowerCase()
          if (s === 'closed' || s === 'resolved') return false
        } else if (rule.field === 'status' && rule.value.toLowerCase() === 'all') {
          // Show all tickets.
        } else if (rule.field === 'status' && rule.value.toLowerCase() === 'closed') {
          if (String(incident.status || '').toLowerCase() !== 'closed') return false
        } else if (rule.field !== 'sla') {
          if (String((incident as any)[rule.field] || '').toLowerCase() !== String(rule.value || '').toLowerCase()) return false
        }
      }
    }

    return true
  })

  const totalTickets = filteredIncidents.length
  const totalPages = Math.max(1, Math.ceil(totalTickets / rowsPerPage))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * rowsPerPage
  const pageItems = filteredIncidents.slice(pageStart, pageStart + rowsPerPage)
  const rangeStart = totalTickets > 0 ? pageStart + 1 : 0
  const rangeEnd = Math.min(pageStart + rowsPerPage, totalTickets)

  React.useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  React.useEffect(() => {
    setPage(1)
  }, [globalSearch, filterType, queueFilter, searchValues])

  const handleGlobalSearch = () => {
    // Search is already being filtered in real-time via filteredIncidents
    // This function is called on Enter key or icon click
    console.log('Searching for:', globalSearch)
  }

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    const toKey = (c: string) => (c === 'subject' ? 'summary' : c)
    const colKey = toKey(column)
    if (colKey === 'checkbox') return
    e.preventDefault()
    e.stopPropagation()
    setResizingColumn(colKey)
    setResizeStartX(e.clientX)
    setResizeStartWidth(Number(columnWidths[colKey] || 60))
  }

  const handleAutoFit = (column: string) => {
    const toKey = (c: string) => (c === 'subject' ? 'summary' : c)
    const key = toKey(column) as keyof typeof columnWidths
    if (key === 'checkbox' || !tableRef.current) return

    const classMap: Record<string, string> = {
      checkbox: 'checkbox',
      status: 'status',
      id: 'id',
      summary: 'subject',
      category: 'category',
      priority: 'priority',
      type: 'type',
      lastAction: 'lastAction',
      date: 'date',
      endUser: 'endUser'
    }
    const className = classMap[key] || String(key)
    const nodes = Array.from(tableRef.current.querySelectorAll<HTMLElement>(`.col-${className}`))
    if (nodes.length === 0) return

    const maxContent = nodes.reduce((max, el) => Math.max(max, el.scrollWidth), 0)
    const padding = 18
    const desired = maxContent + padding
    const minWidth = 1
    const maxWidth = 2000

    setColumnWidths(prev => {
      const next = { ...prev }
      let newCurrent = Math.max(minWidth, Math.min(maxWidth, desired))
      next[key] = newCurrent as any
      return next
    })

    setTableWidth(prevTable => {
      const cols = Object.keys(columnWidths).length
      const gapTotal = (cols - 1) * 12
      const paddingHorizontal = 8
      const sumCols = Object.values(columnWidths).reduce((s, v) => s + (v as number), 0)
      const totalNeeded = sumCols + gapTotal + paddingHorizontal
      return Math.max(prevTable, Math.ceil(totalNeeded))
    })
  }

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return

      const diff = e.clientX - resizeStartX
      setColumnWidths(prev => {
        const newWidths = { ...prev }
        const maxWidth = 2000

        const colKey = resizingColumn as keyof typeof prev
        let newCurrent = resizeStartWidth + diff
        const minCurrent = 1
        newCurrent = Math.round(newCurrent / widthSnap) * widthSnap
        newCurrent = Math.max(minCurrent, Math.min(maxWidth, newCurrent))
        newWidths[colKey] = newCurrent as any

        // compute total needed width (sum of all column pixel widths + gaps + padding)
        const cols = Object.keys(newWidths).length
        const gapTotal = (cols - 1) * 12 // grid gap from CSS
        const paddingHorizontal = 8 // matches tighter table row/header horizontal padding
        const sumCols = Object.values(newWidths).reduce((s, v) => s + (v as number), 0)
        const totalNeeded = sumCols + gapTotal + paddingHorizontal

        setTableWidth(prevTable => Math.max(prevTable, Math.ceil(totalNeeded)))

        return newWidths
      })
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
    }

    if (resizingColumn) {
      document.body.classList.add('is-column-resizing')
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.body.classList.remove('is-column-resizing')
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
    document.body.classList.remove('is-column-resizing')
  }, [resizingColumn, resizeStartX, resizeStartWidth])

  const ticketVisuals = React.useMemo(() => {
    const total = incidents.length
    const open = incidents.filter((t) => {
      const s = String(t.status || '').toLowerCase()
      return s !== 'closed' && s !== 'resolved'
    }).length
    const closed = incidents.filter((t) => String(t.status || '').toLowerCase() === 'closed').length
    const byPriority = incidents.reduce<Record<string, number>>((acc, t) => {
      const key = String(t.priority || 'Low')
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const days = 10
    const today = new Date()
    const counts = new Array(days).fill(0)
    const keys: string[] = []
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      d.setHours(0, 0, 0, 0)
      keys.push(d.toISOString().slice(0, 10))
    }
    const indexByKey = new Map(keys.map((k, idx) => [k, idx]))
    incidents.forEach((t) => {
      const raw = t.dateReported
      if (!raw) return
      const d = new Date(raw)
      if (Number.isNaN(d.getTime())) return
      const key = d.toISOString().slice(0, 10)
      const idx = indexByKey.get(key)
      if (idx !== undefined) counts[idx] += 1
    })
    return { total, open, closed, byPriority, counts }
  }, [incidents])

  const ticketSparkline = React.useMemo(() => {
    const width = 180
    const height = 40
    const max = Math.max(1, ...ticketVisuals.counts)
    const points = ticketVisuals.counts
      .map((v, i) => {
        const x = (i / Math.max(1, ticketVisuals.counts.length - 1)) * width
        const y = height - (v / max) * height
        return `${x},${y}`
      })
      .join(' ')
    return { width, height, points }
  }, [ticketVisuals])

  const ticketsGridTemplate = `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.sla}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.endUser}px ${columnWidths.lastAction}px ${columnWidths.date}px 1fr`
  const ticketsGridStyle = { gridTemplateColumns: ticketsGridTemplate, width: '100%', minWidth: `${tableWidth}px` }
  const activeSlaPriorityRank = Number(selectedTicket?.sla?.priorityRank || rankFromPriorityLabel(selectedTicket?.sla?.priority || selectedTicket?.priority))
  const activeSlaPolicyName = String(selectedTicket?.sla?.policyName || 'Select Policy')
  const currentSlaPolicyName = String(selectedSlaPolicyName || activeSlaPolicyName)
  const activePolicies = React.useMemo(() => {
    const names = Array.from(
      new Set(
        slaPolicies
          .filter((p) => p?.active !== false)
          .map((p) => String(p?.name || '').trim())
          .filter(Boolean)
      )
    )
    return names
  }, [slaPolicies])
  const activePolicyRows = React.useMemo(() => {
    if (!selectedTicket) return []
    return slaPolicies
      .filter((p) => p?.active !== false && String(p?.name || '') === currentSlaPolicyName)
      .slice()
      .sort((a, b) => Number(a?.priorityRank || rankFromPriorityLabel(a?.priority)) - Number(b?.priorityRank || rankFromPriorityLabel(b?.priority)))
  }, [slaPolicies, selectedTicket, currentSlaPolicyName])
  const activeSlaPriorityLabel = (() => {
    const matched = activePolicyRows.find((row) => Number(row?.priorityRank || rankFromPriorityLabel(row?.priority)) === activeSlaPriorityRank)
    if (matched?.priority) return String(matched.priority)
    return String(selectedTicket?.sla?.priority || selectedTicket?.priority || 'P3')
  })()
  const slaToneClass = (() => {
    const rank = Number.isFinite(activeSlaPriorityRank) ? activeSlaPriorityRank : 3
    if (rank <= 1) return 'sla-tone-p1'
    if (rank === 2) return 'sla-tone-p2'
    if (rank === 3) return 'sla-tone-p3'
    return 'sla-tone-p4'
  })()
  const policyRowForActivePriority = activePolicyRows.find((row) => Number(row?.priorityRank || rankFromPriorityLabel(row?.priority)) === activeSlaPriorityRank) || activePolicyRows[0]
  const getPolicyMinutes = (kind: 'response' | 'resolution'): number => {
    const keyPrimary = kind === 'response' ? 'responseTimeMin' : 'resolutionTimeMin'
    const keyAlt = kind === 'response' ? 'responseMinutes' : 'resolutionMinutes'
    const raw = Number(policyRowForActivePriority?.[keyPrimary] ?? policyRowForActivePriority?.[keyAlt] ?? 0)
    return Number.isFinite(raw) && raw > 0 ? raw : 0
  }
  const computeSlaProgress = (kind: 'response' | 'resolution') => {
    const branch = selectedTicket?.sla?.[kind] || {}
    const policyMinutes = getPolicyMinutes(kind)
    const fallbackStart = toTimestamp(selectedTicket?.dateReported) ?? slaNowMs
    const targetAtMs = toTimestamp(branch?.targetAt)
    let startAtMs = toTimestamp(branch?.startedAt) ?? toTimestamp(selectedTicket?.sla?.startedAt) ?? fallbackStart
    let effectiveTargetMs = targetAtMs
    if (!effectiveTargetMs && policyMinutes > 0) {
      effectiveTargetMs = startAtMs + policyMinutes * 60_000
    }
    if (effectiveTargetMs && !startAtMs && policyMinutes > 0) {
      startAtMs = effectiveTargetMs - policyMinutes * 60_000
    }
    const totalMs = Math.max(0, (effectiveTargetMs ?? startAtMs) - startAtMs)
    const remainingMsRaw = (effectiveTargetMs ?? slaNowMs) - slaNowMs
    const balancePercent = totalMs > 0 ? Math.max(0, Math.min(100, (remainingMsRaw / totalMs) * 100)) : 0
    const percent = Math.max(0, 100 - balancePercent)
    const remainingMs = remainingMsRaw
    return {
      percent,
      balancePercent,
      remainingLabel: formatSlaClock(remainingMs),
      targetLabel: toLocalDateTime(effectiveTargetMs),
      breached: !!branch?.breached || (effectiveTargetMs ? slaNowMs > effectiveTargetMs : false),
      color: getSlaElapsedColor(percent),
    }
  }
  const responseSla = computeSlaProgress('response')
  const resolutionSla = computeSlaProgress('resolution')
  const parseSlaClockToSeconds = (raw: string) => {
    const txt = String(raw || '').trim()
    if (!txt) return null
    const negative = txt.startsWith('-')
    const normalized = negative ? txt.slice(1) : txt
    const parts = normalized.split(':').map((p) => Number(p))
    if (parts.some((p) => !Number.isFinite(p))) return null
    let seconds = 0
    if (parts.length === 2) {
      seconds = parts[0] * 60 + parts[1]
    } else if (parts.length === 3) {
      seconds = parts[0] * 3600 + parts[1] * 60 + parts[2]
    } else {
      return null
    }
    return negative ? -seconds : seconds
  }
  const getDefaultResolutionWindowMinutes = (priority: string) => {
    const p = String(priority || '').toLowerCase()
    if (p === 'critical' || p === 'p1') return 4 * 60
    if (p === 'high' || p === 'p2') return 8 * 60
    if (p === 'medium' || p === 'p3') return 24 * 60
    return 72 * 60
  }
  const getTableSlaVisual = (incident: Incident) => {
    const now = slaNowMs
    const startMs = toTimestamp((incident as any)?.sla?.resolution?.startedAt) ?? toTimestamp((incident as any)?.createdAt) ?? toTimestamp(incident.dateReported)
    const targetMs = toTimestamp((incident as any)?.sla?.resolution?.targetAt)
    let balancePercent = 0
    let breached = false
    let label = String(incident.slaTimeLeft || '--:--')

    if (startMs && targetMs && targetMs > startMs) {
      const total = targetMs - startMs
      const remaining = targetMs - now
      breached = remaining < 0
      balancePercent = breached ? 0 : Math.max(0, Math.min(100, (remaining / total) * 100))
      label = formatSlaClock(remaining)
    } else {
      const parsedSeconds = parseSlaClockToSeconds(String(incident.slaTimeLeft || ''))
      if (parsedSeconds !== null) {
        breached = parsedSeconds < 0
        const defaultWindowSeconds = getDefaultResolutionWindowMinutes(String(incident.priority || 'Low')) * 60
        balancePercent = breached ? 0 : Math.max(0, Math.min(100, (parsedSeconds / Math.max(1, defaultWindowSeconds)) * 100))
      } else {
        breached = String(incident.slaTimeLeft || '').trim().startsWith('-')
        balancePercent = breached ? 0 : 50
      }
    }

    const elapsedPercent = Math.max(0, 100 - balancePercent)
    return { balancePercent, elapsedPercent, breached, label, color: getSlaElapsedColor(elapsedPercent) }
  }
  const isTicketClosed = String(selectedTicket?.status || '').trim().toLowerCase() === 'closed'
  const closingEntry = React.useMemo(() => {
    if (!selectedTicket) return null
    const timeline = ticketComments[selectedTicket.id] || []
    return timeline
      .slice()
      .sort((a, b) => (toTimestamp(b.time) || 0) - (toTimestamp(a.time) || 0))
      .find((entry) => {
        const text = String(entry?.text || '').toLowerCase()
        return text.startsWith('closed:') || text.includes('status updated to closed') || text.includes('ticket resolved/closed')
      }) || null
  }, [selectedTicket, ticketComments])
  const closedAtMs =
    toTimestamp((selectedTicket as any)?.closedAt) ??
    toTimestamp(closingEntry?.time) ??
    (isTicketClosed ? (toTimestamp((selectedTicket as any)?.updatedAt) ?? slaNowMs) : null)
  const closedByName =
    String((selectedTicket as any)?.closedByName || '').trim() ||
    String(closingEntry?.author || '').trim() ||
    String(selectedTicket?.assignedAgentName || '').trim() ||
    'System'
  const createdAtMs = toTimestamp((selectedTicket as any)?.createdAt) ?? toTimestamp(selectedTicket?.dateReported)
  const timeToCloseLabel =
    closedAtMs && createdAtMs
      ? formatElapsedClock(Math.max(0, closedAtMs - createdAtMs))
      : '--:--'

  React.useEffect(() => {
    setSlaPolicyMenuOpen(false)
    setSlaPriorityMenuOpen(false)
    setSelectedSlaPolicyName('')
    setActiveDetailTab('Progress')
  }, [selectedTicket?.id])

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const updateCompactLayout = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      setIsCompactDetailLayout(viewportWidth <= 1360)
    }
    updateCompactLayout()
    window.addEventListener('resize', updateCompactLayout)
    window.visualViewport?.addEventListener('resize', updateCompactLayout)
    return () => {
      window.removeEventListener('resize', updateCompactLayout)
      window.visualViewport?.removeEventListener('resize', updateCompactLayout)
    }
  }, [])

  const mainContent = showDetailView && selectedTicket ? (
    <div className={`tickets-shell main-only ${queueCollapsed ? 'queue-collapsed' : ''}`}>
      <div className="work-main">
        <div className="detail-view-container">
      <div className="detail-action-bar">
        <div className="action-toolbar">
          <button
            className="pill-icon-btn"
            title={queueCollapsed ? 'Show side panel' : 'Hide side panel'}
            aria-label={queueCollapsed ? 'Show side panel' : 'Hide side panel'}
            onClick={() => setQueueCollapsed((prev) => !prev)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          {getActionButtons().map((btn, idx) => (
            btn.label === 'Back' ? (
              <button key={idx} className="pill-icon-btn back-icon-btn" onClick={btn.onClick} title="Back" aria-label="Back">
                {renderActionIcon(btn.label)}
              </button>
            ) : (
              <button key={idx} className="pill-btn" onClick={btn.onClick}>
                {renderActionIcon(btn.label)}
                {btn.label}
              </button>
            )
          ))}
        </div>
      </div>
            {isCompactDetailLayout && (
              <div className="detail-tabs compact">
                <button
                  className={`tab-btn${activeDetailTab === 'Progress' ? ' active' : ''}`}
                  onClick={() => setActiveDetailTab('Progress')}
                >
                  Progress
                </button>
                <button
                  className={`tab-btn${activeDetailTab === 'Details' ? ' active' : ''}`}
                  onClick={() => setActiveDetailTab('Details')}
                >
                  Details
                </button>
              </div>
            )}
            <div className={`detail-view-card${isCompactDetailLayout ? ' compact' : ''}`}>
        {(!isCompactDetailLayout || activeDetailTab === 'Progress') && (
        <div className="progress-card">
          <div className="progress-card-header">
            <span className="progress-title">Progress</span>
          </div>
          <div className={`progress-list${showActionComposer || showInternalNoteEditor ? ' progress-list-editor-open' : ''}`}>
            {showActionComposer && (
              <div className="action-compose-modal inline-compose-card">
                <div className="compose-header">
                  <div className="compose-identity">
                    <div className="compose-avatar">{getInitials(getCurrentAgentName()).slice(0, 1)}</div>
                    <div>
                      <div className="compose-user">{getCurrentAgentName()}</div>
                      <div className="compose-mode">| {getComposerHeading()}</div>
                    </div>
                  </div>
                  <div className="compose-header-actions">
                    <button className="compose-icon-btn" onClick={() => setComposerMenuOpen((v) => !v)} aria-label="More actions">...</button>
                    <button className="compose-icon-btn" aria-label="High priority">!</button>
                    <button className="compose-icon-btn compose-icon-btn-active" aria-label="Mail mode">@</button>
                    <button
                      className="compose-icon-btn"
                      aria-label="Attach file"
                      onClick={() => composerFileInputRef.current?.click()}
                      type="button"
                    >
                      +
                    </button>
                    {composerMenuOpen && (
                      <div className="compose-menu">
                        <button onClick={() => setShowCcField((v) => !v)}>Show Cc</button>
                        <button onClick={() => setShowBccField((v) => !v)}>Show Bcc</button>
                        <button onClick={() => setComposerForm((prev) => ({ ...prev, to: endUser?.email || '' }))}>Reply directly to me</button>
                      </div>
                    )}
                    <button
                      className="compose-icon-btn"
                      onClick={() => {
                        setComposerAttachments([])
                        setShowActionComposer(false)
                      }}
                      aria-label="Close"
                    >
                      x
                    </button>
                  </div>
                </div>

                <div className="compose-row compose-row-line">
                  <label>To</label>
                  <input
                    value={composerForm.to}
                    onChange={(e) => setComposerForm((prev) => ({ ...prev, to: e.target.value }))}
                    placeholder="Enter recipient"
                  />
                  <div className="compose-row-tools">
                    <button type="button" onClick={() => setComposerMenuOpen((v) => !v)} aria-label="Recipient options">v</button>
                    <button type="button" onClick={() => setShowCcField((v) => !v)} aria-label="Toggle Cc">cc</button>
                  </div>
                </div>
                {showCcField && (
                  <div className="compose-row compose-row-line">
                    <label>Cc</label>
                    <input value={composerForm.cc} onChange={(e) => setComposerForm((prev) => ({ ...prev, cc: e.target.value }))} placeholder="Enter cc recipient" />
                  </div>
                )}
                {showBccField && (
                  <div className="compose-row compose-row-line">
                    <label>Bcc</label>
                    <input value={composerForm.bcc} onChange={(e) => setComposerForm((prev) => ({ ...prev, bcc: e.target.value }))} placeholder="Enter bcc recipient" />
                  </div>
                )}
                <div className="compose-row compose-row-line compose-row-subject">
                  <label />
                  <input
                    value={composerForm.subject}
                    onChange={(e) => setComposerForm((prev) => ({ ...prev, subject: e.target.value }))}
                    placeholder="Enter a subject here"
                  />
                </div>

                <div className="compose-editor-shell">
                  <div className="compose-editor-toolbar">
                    <button type="button">[]</button>
                    <button type="button">A:</button>
                    <button type="button">-</button>
                    <button type="button">=</button>
                    <button type="button">::</button>
                    <button type="button">""</button>
                    <button type="button">()</button>
                    <button type="button">[]</button>
                    <button type="button">#</button>
                    <button type="button">+/-</button>
                    <button type="button">+</button>
                    <button type="button">-</button>
                    <button type="button">A</button>
                    <button type="button">&lt;&gt;</button>
                  </div>
                  <textarea
                    className="compose-editor-body"
                    placeholder="Type your update/note here"
                    value={composerForm.body}
                    onChange={(e) => setComposerForm((prev) => ({ ...prev, body: e.target.value }))}
                  />
                  <div className="compose-editor-assist">
                    <button type="button" aria-label="AI assist">Q</button>
                    <button type="button" aria-label="Assistant">G</button>
                  </div>
                </div>
                <input
                  ref={composerFileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    pushAttachments(e.target.files, 'composer')
                    e.currentTarget.value = ''
                  }}
                />
                {composerAttachments.length > 0 && (
                  <div className="compose-attachments">
                    {composerAttachments.map((attachment) => (
                      <div className="compose-attachment-chip" key={attachment.key}>
                        <span>{attachment.file.name} ({formatAttachmentSize(attachment.file.size)})</span>
                        <button type="button" onClick={() => removeAttachment(attachment.key, 'composer')}>x</button>
                      </div>
                    ))}
                  </div>
                )}

                {(composerMode === 'logSupplier' || composerMode === 'emailSupplier' || composerMode === 'callbackSupplier') && (
                  <div className="compose-grid three">
                    <label>
                      Supplier
                      <input value={composerForm.supplier} onChange={(e) => setComposerForm((prev) => ({ ...prev, supplier: e.target.value }))} />
                    </label>
                    <label>
                      Supplier Ref
                      <input value={composerForm.supplierRef} onChange={(e) => setComposerForm((prev) => ({ ...prev, supplierRef: e.target.value }))} />
                    </label>
                    <label>
                      Priority
                      <input value={composerForm.approvalPriority} onChange={(e) => setComposerForm((prev) => ({ ...prev, approvalPriority: e.target.value }))} />
                    </label>
                  </div>
                )}

                {composerMode === 'approval' && (
                  <div className="compose-grid three">
                    <label>
                      Approval Team
                      <select value={composerForm.approvalTeam} onChange={(e) => setComposerForm((prev) => ({ ...prev, approvalTeam: e.target.value }))}>
                        <option>Management Team</option>
                        <option>HR Team</option>
                        <option>Account Team</option>
                      </select>
                    </label>
                    <label>
                      Priority
                      <input value={composerForm.approvalPriority} onChange={(e) => setComposerForm((prev) => ({ ...prev, approvalPriority: e.target.value }))} />
                    </label>
                    <label>
                      Current Action
                      <input value={composerForm.currentAction} onChange={(e) => setComposerForm((prev) => ({ ...prev, currentAction: e.target.value }))} />
                    </label>
                  </div>
                )}

                <div className="compose-footer-actions">
                  <button className="btn-submit" onClick={handleSendActionComposer} disabled={isUploadingAttachments}>
                    {isUploadingAttachments ? 'Uploading...' : 'Send'}
                  </button>
                  <button className="btn-cancel" onClick={() => { setComposerAttachments([]); setShowActionComposer(false) }}>Discard</button>
                  <button type="button" className="compose-footer-icon" aria-label="Schedule">[]</button>
                </div>
              </div>
            )}
            {showInternalNoteEditor && (
              <div className="action-compose-modal inline-compose-card">
                <div className="compose-header">
                  <div className="compose-identity">
                    <div className="compose-avatar">{getInitials(getCurrentAgentName()).slice(0, 1)}</div>
                    <div>
                    <div className="compose-user">{getCurrentAgentName()}</div>
                    <div className="compose-mode">Internal Note</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className="compose-icon-btn"
                      onClick={() => internalNoteFileInputRef.current?.click()}
                      type="button"
                      aria-label="Attach file"
                    >
                      +
                    </button>
                    <button className="compose-icon-btn" onClick={() => { setInternalNoteAttachments([]); setShowInternalNoteEditor(false) }}>x</button>
                  </div>
                </div>
                <div className="compose-editor-shell">
                  <div className="compose-editor-toolbar">
                    <button type="button">A:</button>
                    <button type="button">-</button>
                    <button type="button">1.</button>
                    <button type="button">"</button>
                    <button type="button">link</button>
                    <button type="button">img</button>
                    <button type="button">table</button>
                  </div>
                  <textarea
                    className="compose-editor-body"
                    placeholder="Enter your note here"
                    value={internalNoteForm.body}
                    onChange={(e) => setInternalNoteForm((prev) => ({ ...prev, body: e.target.value }))}
                  />
                </div>
                <input
                  ref={internalNoteFileInputRef}
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    pushAttachments(e.target.files, 'note')
                    e.currentTarget.value = ''
                  }}
                />
                {internalNoteAttachments.length > 0 && (
                  <div className="compose-attachments">
                    {internalNoteAttachments.map((attachment) => (
                      <div className="compose-attachment-chip" key={attachment.key}>
                        <span>{attachment.file.name} ({formatAttachmentSize(attachment.file.size)})</span>
                        <button type="button" onClick={() => removeAttachment(attachment.key, 'note')}>x</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="compose-grid four">
                  <label>Status
                    <select value={internalNoteForm.status} onChange={(e) => setInternalNoteForm((prev) => ({ ...prev, status: e.target.value }))}>
                      <option>In Progress</option>
                      <option>Awaiting Approval</option>
                      <option>With Supplier</option>
                      <option>Resolved</option>
                      <option>Closed</option>
                    </select>
                  </label>
                  <label>Team
                    <input value={internalNoteForm.team} onChange={(e) => setInternalNoteForm((prev) => ({ ...prev, team: e.target.value }))} />
                  </label>
                  <label>Staff
                    <input value={internalNoteForm.staff} onChange={(e) => setInternalNoteForm((prev) => ({ ...prev, staff: e.target.value }))} />
                  </label>
                  <label>Time Taken
                    <div className="inline-row">
                      <input value={internalNoteForm.timeHours} onChange={(e) => setInternalNoteForm((prev) => ({ ...prev, timeHours: e.target.value }))} />
                      <input value={internalNoteForm.timeMinutes} onChange={(e) => setInternalNoteForm((prev) => ({ ...prev, timeMinutes: e.target.value }))} />
                    </div>
                  </label>
                </div>
                <div className="compose-footer-actions">
                  <button className="btn-submit" onClick={handleSaveInternalNote} disabled={isUploadingAttachments}>
                    {isUploadingAttachments ? 'Uploading...' : 'Save'}
                  </button>
                  <button className="btn-cancel" onClick={() => { setInternalNoteAttachments([]); setShowInternalNoteEditor(false) }}>Discard</button>
                </div>
              </div>
            )}
            {(ticketComments[selectedTicket.id] || [])
              .slice()
              .sort((a, b) => {
                const ta = new Date(a.time).getTime()
                const tb = new Date(b.time).getTime()
                if (Number.isNaN(ta) || Number.isNaN(tb)) return 0
                return tb - ta
              })
              .map((c, idx) => {
                const authorName = String((c as any)?.author ?? '')
                const identity = resolveCommentIdentity(authorName)
                return (
              <div key={`${c.time}-${idx}`} className="progress-item">
                <div className="progress-avatar">
                  {identity.avatarUrl ? (
                    <img
                      src={identity.avatarUrl}
                      alt={identity.name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : identity.initials}
                </div>
                <div className="progress-body">
                  <div className="progress-meta">
                    <div className="progress-author">{identity.name}</div>
                    <div className="progress-time">{c.time}</div>
                  </div>
                  <div className="progress-text">{c.text}</div>
                </div>
              </div>
            )})}
            {(!ticketComments[selectedTicket.id] || ticketComments[selectedTicket.id].length === 0) && (
              <div className="progress-item">
                <div className="progress-avatar">
                  {getInboundDisplayUser().avatarUrl ? (
                    <img
                      src={getInboundDisplayUser().avatarUrl}
                      alt={getInboundDisplayUser().name}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }}
                    />
                  ) : getInitials(getInboundDisplayUser().name)}
                </div>
                <div className="progress-body">
                  <div className="progress-meta">
                    <div className="progress-author">{getInboundDisplayUser().name}</div>
                    <div className="progress-time">{selectedTicket.dateReported}</div>
                  </div>
                  <div className="progress-text">{selectedTicket.subject}</div>
                </div>
              </div>
            )}
          </div>
        </div>
        )}
        {(!isCompactDetailLayout || activeDetailTab === 'Details') && (
        <div className="detail-sidebar-wrap">
          <div className="detail-sidebar">
            <div className="sidebar-stack">
              <div className="ticket-info-card">
                <h3 className="sidebar-title">Ticket information</h3>
                <div className="sidebar-field">
                  <label>Date Reported</label>
                  <span>{selectedTicket.dateReported}</span>
                </div>
                <div className="sidebar-field">
                  <label>Created by</label>
                  <span>Admin</span>
                </div>
                <div className="sidebar-field">
                  <label>Ticket Type</label>
                  <span className="ticket-type-link">{selectedTicket.type}</span>
                </div>
                <div className="sidebar-field">
                  <label>Workflow</label>
                  <span className="workflow-link">Incident Management Workflow</span>
                </div>
                <div className="sidebar-field">
                  <label>Status</label>
                  <span className={`status-badge ${statusClass(selectedTicket.status)}`}>{selectedTicket.status}</span>
                </div>
                <div className="sidebar-field">
                  <label>Team</label>
                  <span className="team-link">2nd Line Support</span>
                </div>
                <div className="sidebar-field assigned-field">
                  <div className="assigned-label">Assigned Agent</div>
                  <div className="assigned-agent">
                    <div className="agent-avatar">{getInitials(selectedTicket.assignedAgentName || 'Not set')}</div>
                    <div className="agent-info">
                      <span className="agent-name">{selectedTicket.assignedAgentName || 'Not set'}</span>
                    </div>
                  </div>
                </div>
                <div className="sidebar-field">
                  <label>Additional Agents</label>
                  <span>Not set</span>
                </div>
                <div className="sidebar-field">
                  <label>Source</label>
                  <span>Manual</span>
                </div>
                <div className="sidebar-field">
                  <label>Assigned Asset</label>
                  <span>{ticketAsset ? `${ticketAsset.name} (${ticketAsset.serial || 'no-serial'})` : 'None'}</span>
                </div>
              </div>
              <div className={`sla-card ${slaToneClass}`}>
                <h3 className="sidebar-title">Service Level Agreement</h3>
                <div className="sla-pill">
                  <div
                    className="sla-pill-select-wrap"
                    ref={slaPolicyMenuRef}
                  >
                    <button
                      type="button"
                      className="sla-pill-select"
                      onClick={() => setSlaPolicyMenuOpen((v) => !v)}
                      disabled={slaApplying}
                    >
                      <span>{currentSlaPolicyName}</span>
                    </button>
                    {slaPolicyMenuOpen && (
                      <div className="sla-pill-dropdown">
                        {activePolicies.map((policyName) => (
                          <button
                            key={policyName}
                            type="button"
                            className={`sla-pill-option${String(currentSlaPolicyName) === String(policyName) ? ' active' : ''}`}
                            onClick={() => handlePolicySelectFromPill(String(policyName))}
                          >
                            {policyName}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div
                    className="sla-pill-select-wrap"
                    ref={slaPriorityMenuRef}
                  >
                    <button
                      type="button"
                      className="sla-pill-select"
                      onClick={() => setSlaPriorityMenuOpen((v) => !v)}
                      disabled={slaApplying}
                    >
                      <span>{activeSlaPriorityLabel}</span>
                    </button>
                    {slaPriorityMenuOpen && (
                      <div className="sla-pill-dropdown">
                        {activePolicyRows.map((row) => {
                          const rank = Number(row?.priorityRank || rankFromPriorityLabel(row?.priority))
                          const canonical = canonicalPriorityForRank(rank)
                          const label = String(row?.priority || canonical)
                          return (
                          <button
                            key={`${row.id}-${label}`}
                            type="button"
                            className={`sla-pill-option${String(activeSlaPriorityLabel).toLowerCase() === label.toLowerCase() ? ' active' : ''}`}
                            onClick={() => {
                              setSlaPriorityMenuOpen(false)
                              applySlaPriority(canonical)
                              setSelectedSlaPolicyName(currentSlaPolicyName)
                            }}
                          >
                            {label}
                          </button>
                        )})}
                      </div>
                    )}
                  </div>
                </div>
                <div className="sla-metric">
                  <div className="sla-row">
                    <span>Response Target</span>
                    <span>{responseSla.targetLabel}</span>
                    <span className="sla-x">{responseSla.breached ? 'x' : 'ok'}</span>
                  </div>
                  <div className="sla-progress-track" role="progressbar" aria-label="Response SLA progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(responseSla.percent)}>
                    <div
                      className="sla-progress-fill"
                      style={{
                        width: `${responseSla.breached ? 100 : responseSla.percent}%`,
                        background: responseSla.breached ? '#8B0000' : responseSla.color,
                      }}
                    />
                    <span className="sla-progress-time">{responseSla.remainingLabel}</span>
                  </div>
                </div>
                <div className="sla-metric">
                  <div className="sla-row">
                    <span>Resolution Target</span>
                    <span>{resolutionSla.targetLabel}</span>
                    <span className="sla-x">{resolutionSla.breached ? 'x' : 'ok'}</span>
                  </div>
                  <div className="sla-progress-track" role="progressbar" aria-label="Resolution SLA progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(resolutionSla.percent)}>
                    <div
                      className="sla-progress-fill"
                      style={{
                        width: `${resolutionSla.breached ? 100 : resolutionSla.percent}%`,
                        background: resolutionSla.breached ? '#8B0000' : resolutionSla.color,
                      }}
                    />
                    <span className="sla-progress-time">{resolutionSla.remainingLabel}</span>
                  </div>
                </div>
                {isTicketClosed && (
                  <div className="closure-section">
                    <div className="closure-title-row">
                      <h4 className="closure-title">Closure details</h4>
                      <span className="closure-chevron">^</span>
                    </div>
                    <div className="sidebar-field">
                      <label>Date Closed</label>
                      <span>{closedAtMs ? new Date(closedAtMs).toLocaleString() : '-'}</span>
                    </div>
                    <div className="sidebar-field">
                      <label>Closed by</label>
                      <span>{closedByName}</span>
                    </div>
                    <div className="sidebar-field">
                      <label>Time to Close</label>
                      <span>{timeToCloseLabel}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="enduser-card">
                <h3 className="sidebar-title" style={{ marginTop: 0, marginBottom: 8 }}>End-User details</h3>
                <div className="enduser-header" style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                  <div className="enduser-avatar">{(endUser && endUser.name ? endUser.name.split(' ').map((n:string)=>n[0]).slice(0,2).join('') : 'EU')}</div>
                  <div>
                    <div className="enduser-name" style={{ fontWeight: 700 }}>{endUser?.name || 'Not set'}</div>
                    <div className="enduser-client" style={{ color: '#6b7280', fontSize: 13 }}>{endUser?.client || 'Not set'}</div>
                  </div>
                </div>
                <div className="sidebar-field">
                  <label>User Name</label>
                  <span>{endUser?.name || 'Not set'}</span>
                </div>
                <div className="sidebar-field">
                  <label>Email Address</label>
                  <span>{endUser?.email || 'Not set'}</span>
                </div>
                <div className="sidebar-field">
                  <label>Phone Number</label>
                  <span>{endUser?.phone || 'Not set'}</span>
                </div>
                <div className="sidebar-field">
                  <label>Site</label>
                  <span>{endUser?.site || 'Not set'}</span>
                </div>
                <div className="sidebar-field">
                  <label>Reporting Manager</label>
                  <span>{endUser?.accountManager || 'Not set'}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button className="message-button" onClick={handleOpenGChat}>Message Directly on GChat</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}
        </div>
      </div>
      </div>
    </div>
  ) : (
    <div className={`tickets-shell main-only ${queueCollapsed ? 'queue-collapsed' : ''}`}>
      <div className="work-main">
        <div className="tickets-tool-bar">
          <div className="tool-bar-left">
            {queueCollapsed && (
              <button
                className="table-icon-btn"
                title="Show Menu"
                onClick={() => {
                  setQueueCollapsed(false)
                }}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </button>
            )}
            <div className="filter-dropdown">
              <button 
                className="filter-button"
                onClick={() => setShowFilterMenu(!showFilterMenu)}
              >
                {filterType}
                <span className="dropdown-icon">?</span>
              </button>
              {showFilterMenu && (
                <div className="filter-menu">
                  {filterOptions.map((option) => (
                    <div
                      key={option}
                      className={`filter-option ${option === filterType ? 'active' : ''}`}
                      onClick={() => {
                        setFilterType(option)
                        setShowFilterMenu(false)
                      }}
                    >
                      {option}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="global-search tickets-search">
              <input 
                type="text" 
                placeholder="Search..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleGlobalSearch()}
              />
              <span className="search-icon" onClick={handleGlobalSearch}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="16.5" y1="16.5" x2="21" y2="21" />
                </svg>
              </span>
            </div>
          </div>
          <div className="tool-bar-right">
            <span className="pagination">{rangeStart}-{rangeEnd} of {totalTickets}</span>
            <div className="toolbar-pagination-group">
              <button
                className="users-page-btn"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="Previous page"
              >
                {'<'}
              </button>
              <button className="users-page-btn active" aria-label="Current page">
                {safePage}
              </button>
              <button
                className="users-page-btn"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                aria-label="Next page"
              >
                {'>'}
              </button>
            </div>
            <button
              className="table-icon-btn"
              title="Refresh"
              aria-label="Refresh"
              onClick={loadTickets}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
            <button className="table-primary-btn" onClick={() => setShowNewIncidentModal(true)}>+ New</button>
            <button
              className="table-icon-btn"
              title="Filter"
              onClick={() => {
                setShowFilterMenu(false)
                setShowSearchBar((v) => {
                  const next = !v
                  if (!next) clearColumnFilters()
                  return next
                })
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </button>
          </div>
        </div>
        <div className="incidents-table" ref={tableRef}>
          <div className="table-header" style={ticketsGridStyle}>
            <div className="col-checkbox col-header">
              <input type="checkbox" checked={selectAll} onChange={handleSelectAll} aria-label="Select all tickets" />
              <span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'checkbox')} />
            </div>
            <div className="col-status col-header">Status<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'status')} onDoubleClick={() => handleAutoFit('status')} /></div>
            <div className="col-id col-header">Ticket ID<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'id')} onDoubleClick={() => handleAutoFit('id')} /></div>
            <div className="col-summary col-header">Summary<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'subject')} onDoubleClick={() => handleAutoFit('subject')} /></div>
            <div className="col-category col-header">Category<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'category')} onDoubleClick={() => handleAutoFit('category')} /></div>
            <div className="col-sla col-header">SLA Time Left<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'sla')} onDoubleClick={() => handleAutoFit('sla')} /></div>
            <div className="col-priority col-header">Priority<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'priority')} onDoubleClick={() => handleAutoFit('priority')} /></div>
            <div className="col-type col-header">Type<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'type')} onDoubleClick={() => handleAutoFit('type')} /></div>
            <div className="col-endUser col-header">End User<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'endUser')} onDoubleClick={() => handleAutoFit('endUser')} /></div>
            <div className="col-lastAction col-header">Last Action<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'lastAction')} onDoubleClick={() => handleAutoFit('lastAction')} /></div>
            <div className="col-date col-header">Date Reported<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'date')} onDoubleClick={() => handleAutoFit('date')} /></div>
            <div className="col-spacer col-header" aria-hidden="true" />
          </div>
          {showSearchBar && (
            <div className="table-row table-search-row" style={ticketsGridStyle}>
              <div className="col-checkbox">
                <button className="search-close-btn" onClick={() => { setShowSearchBar(false); clearColumnFilters() }} aria-label="Close search">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="col-status"><input className="table-filter-input" value={searchValues.status} onChange={(e) => handleSearchChange('status', e.target.value)} /></div>
              <div className="col-id"><input className="table-filter-input" value={searchValues.id} onChange={(e) => handleSearchChange('id', e.target.value)} /></div>
              <div className="col-summary"><input className="table-filter-input" value={searchValues.subject} onChange={(e) => handleSearchChange('subject', e.target.value)} /></div>
              <div className="col-category"><input className="table-filter-input" value={searchValues.category} onChange={(e) => handleSearchChange('category', e.target.value)} /></div>
              <div className="col-sla"><input className="table-filter-input" value={searchValues.slaTimeLeft} onChange={(e) => handleSearchChange('slaTimeLeft', e.target.value)} /></div>
              <div className="col-priority"><input className="table-filter-input" value={searchValues.priority} onChange={(e) => handleSearchChange('priority', e.target.value)} /></div>
              <div className="col-type"><input className="table-filter-input" value={searchValues.type} onChange={(e) => handleSearchChange('type', e.target.value)} /></div>
              <div className="col-endUser"><input className="table-filter-input" value={searchValues.endUser} onChange={(e) => handleSearchChange('endUser', e.target.value)} /></div>
              <div className="col-lastAction"><input className="table-filter-input" value={searchValues.lastAction} onChange={(e) => handleSearchChange('lastAction', e.target.value)} /></div>
              <div className="col-date"><input className="table-filter-input" value={searchValues.dateReported} onChange={(e) => handleSearchChange('dateReported', e.target.value)} /></div>
              <div className="col-spacer" aria-hidden="true" />
            </div>
          )}
          {pageItems.map((incident) => (
            <div key={incident.id} className="table-row" style={ticketsGridStyle}>
              <div className="col-checkbox">
                <input
                  type="checkbox"
                  checked={selectedTickets.includes(incident.id)}
                  onChange={() => handleSelectTicket(incident.id)}
                  aria-label={`Select ${incident.id}`}
                />
              </div>
              <div className="col-status">
                <span className={`status-badge ${statusClass(incident.status)}`}>{incident.status}</span>
              </div>
              <div className="col-id">{incident.id}</div>
              <div className="col-summary">
                <a href="#" onClick={(e) => { e.preventDefault(); handleTicketClick(incident) }}>{incident.subject || '-'}</a>
              </div>
              <div className="col-category">{incident.category || '-'}</div>
              <div className="col-sla">
                {(() => {
                  const slaVisual = getTableSlaVisual(incident)
                  return (
                    <div className={`sla-table-track${slaVisual.breached ? ' is-breached' : ''}`}>
                      <div
                        className="sla-table-fill"
                        style={{
                          width: `${slaVisual.breached ? 100 : slaVisual.elapsedPercent}%`,
                          background: slaVisual.breached ? '#8B0000' : slaVisual.color,
                        }}
                      />
                      <span className="sla-table-text">{slaVisual.label}</span>
                    </div>
                  )
                })()}
              </div>
              <div className="col-priority">{incident.priority || '-'}</div>
              <div className="col-type">{incident.type || '-'}</div>
              <div className="col-endUser">{incident.endUser || '-'}</div>
              <div className="col-lastAction">{incident.lastAction || '-'}</div>
              <div className="col-date">{incident.dateReported || '-'}</div>
              <div className="col-spacer" aria-hidden="true" />
            </div>
          ))}
          {pageItems.length === 0 && (
            <div className="table-empty">No tickets found.</div>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="tickets-view">
      {queueSidebar}
      {mainContent}

      {showNewIncidentModal && (
        <div className="modal-overlay" onClick={() => setShowNewIncidentModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Incident Details</h2>
              <button className="modal-close" onClick={() => setShowNewIncidentModal(false)}>✕</button>
            </div>

            <div className="modal-body">
              <div className="form-section">
                <label className="form-label">Ticket Type *</label>
                <select 
                  value={newIncidentForm.ticketType}
                  onChange={(e) => setNewIncidentForm({...newIncidentForm, ticketType: e.target.value})}
                  className="form-select"
                >
                  <option value="" disabled>Select Ticket Type</option>
                  <option value="Fault">Fault</option>
                  <option value="HR request">HR request</option>
                  <option value="Change request">Change request</option>
                  <option value="Return request">Return request</option>
                  <option value="Incident">Incident</option>
                  <option value="Task">Task</option>
                </select>
              </div>

              <div className="form-section">
                <label className="form-label">Subject *</label>
                <input 
                  type="text" 
                  placeholder="Enter subject"
                  value={newIncidentForm.subject}
                  onChange={(e) => setNewIncidentForm({...newIncidentForm, subject: e.target.value})}
                  className="form-input"
                />
              </div>

              <div className="form-section">
                <label className="form-label">Description</label>
                <textarea 
                  placeholder="Please provide a detailed description and include screenshots where possible."
                  value={newIncidentForm.description}
                  onChange={(e) => setNewIncidentForm({...newIncidentForm, description: e.target.value})}
                  className="form-textarea"
                />
              </div>

              <div className="form-section">
                <label className="form-label">Category</label>
                <div className="custom-category-dropdown">
                  <div 
                    className="category-select-input"
                    onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  >
                    {newIncidentForm.category || 'Select Category'}
                    <span className="dropdown-arrow">▼</span>
                  </div>
                  
                  {showCategoryDropdown && (
                    <div className="category-dropdown-menu">
                      <div className="category-list">
                        {Object.keys(categoryOptions).filter(key => !key.includes('>')).map((category) => (
                          <div key={category} className="category-item">
                            <div className="category-header">
                              {categoryOptions[category as keyof typeof categoryOptions]?.length > 0 ? (
                                <button 
                                  className="expand-btn"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleCategoryExpand(category)
                                  }}
                                >
                                  {expandedCategories.includes(category) ? '▼' : '▶'}
                                </button>
                              ) : (
                                <span className="expand-placeholder"></span>
                              )}
                              <span 
                                className="category-name"
                                onClick={() => handleCategorySelect(category)}
                              >
                                {category}
                              </span>
                            </div>
                            
                            {expandedCategories.includes(category) && (
                              <div className="subcategories-list">
                                {categoryOptions[category as keyof typeof categoryOptions]?.map((subcat) => (
                                  <div key={subcat} className="subcategory-item">
                                    <div className="subcategory-header">
                                      {categoryOptions[`${category}>${subcat}` as keyof typeof categoryOptions]?.length > 0 ? (
                                        <button 
                                          className="expand-btn"
                                          onClick={(e) => {
                                            e.stopPropagation()
                                            toggleCategoryExpand(`${category}>${subcat}`)
                                          }}
                                        >
                                          {expandedCategories.includes(`${category}>${subcat}`) ? '▼' : '▶'}
                                        </button>
                                      ) : (
                                        <span className="expand-placeholder"></span>
                                      )}
                                      <span 
                                        className="subcategory-name"
                                        onClick={() => handleCategorySelect(`${category}>${subcat}`)}
                                      >
                                        {subcat}
                                      </span>
                                    </div>
                                    
                                    {expandedCategories.includes(`${category}>${subcat}`) && categoryOptions[`${category}>${subcat}` as keyof typeof categoryOptions]?.length > 0 && (
                                      <div className="leaf-items">
                                        {categoryOptions[`${category}>${subcat}` as keyof typeof categoryOptions]?.map((item) => (
                                          <div 
                                            key={item} 
                                            className="leaf-item"
                                            onClick={() => handleCategorySelect(`${category}>${subcat}>${item}`)}
                                          >
                                            {item}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Priority *</label>
                <select 
                  value={newIncidentForm.priority}
                  onChange={(e) => setNewIncidentForm({...newIncidentForm, priority: e.target.value as any})}
                  className="form-select"
                >
                  <option value="" disabled>Select Priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowNewIncidentModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={handleCreateIncident}>Create Ticket</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}




















