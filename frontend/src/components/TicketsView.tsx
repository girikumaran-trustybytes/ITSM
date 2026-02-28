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
import SubmitTicketForm from './shared/SubmitTicketForm'
const MAX_ATTACHMENT_BYTES = 32 * 1024 * 1024
const EMAIL_SIGNATURE_STORAGE_KEY = 'admin.mail.signatures.v1'
const MAIL_BANNER_STORAGE_KEY = 'admin.mail.banners.v1'

type LocalAttachment = {
  key: string
  file: File
}

type ProgressFilterType =
  | 'All Actions'
  | 'Conversation & Internal'
  | 'Conversation'
  | 'Internal Conversations'
  | 'Staff'
  | 'Public ( User View)'
  | 'Private'

type TimelineEntry = {
  author: string
  text: string
  time: string
  action?: string
  internal?: boolean
  changedById?: number | null
  kind?: 'conversation' | 'internal' | 'private' | 'sla' | 'asset' | 'user' | 'system' | 'public'
}

type EmailSignatureRecord = {
  id: string
  userId: string
  userLabel: string
  signatureHtml: string
  active: boolean
}

type MailBannerRecord = {
  id: string
  title: string
  message: string
  tone: 'info' | 'success' | 'warning' | 'danger'
  active: boolean
}

export type Incident = {
  id: string
  slaTimeLeft: string
  sla?: any
  subject: string
  category: string
  issueDetail?: string
  resolution?: string
  priority: 'Low' | 'Medium' | 'High' | 'Critical'
  status: string
  type: string
  endUser: string
  dateReported: string
  lastAction: string
  lastActionTime: string
  assignedAgentId?: string
  assignedAgentName?: string
  workflow?: string
  team?: string
  additionalAgents?: string[]
  requesterId?: number
  createdFrom?: string
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
  const [isMobileView, setIsMobileView] = useState(() => {
    if (typeof window === 'undefined') return false
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    return viewportWidth <= 900
  })
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filterType, setFilterType] = useState('Open Tickets')
  const [queueFilter, setQueueFilter] = useState<{ type: 'all' | 'unassigned' | 'supplier' | 'agent' | 'team' | 'teamUnassigned' | 'teamAgent' | 'ticketType' | 'status' | 'myList'; agentId?: string; agentName?: string; value?: string; team?: string }>({ type: 'all' })
  const [queueView, setQueueView] = useState<'all' | 'team' | 'staff' | 'type' | 'status' | 'myLists'>('team')
  const [expandedTeams, setExpandedTeams] = useState<string[]>([])
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showBulkActionMenu, setShowBulkActionMenu] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
  const [page, setPage] = useState(1)
  const rowsPerPage = getRowsPerPage()
  const [selectedTickets, setSelectedTickets] = useState<string[]>([])
  const [globalSearch, setGlobalSearch] = useState('')
  const [showNewIncidentModal, setShowNewIncidentModal] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState<Incident | null>(null)
  const [showDetailView, setShowDetailView] = useState(false)
  const [endUser, setEndUser] = useState<any>(null)
  const [ticketAsset, setTicketAsset] = useState<any>(null)
  const [assetList, setAssetList] = useState<any[]>([])
  const [assetQuery, setAssetQuery] = useState('')
  const [assetAssignId, setAssetAssignId] = useState<number | ''>('')
  const [slaNowMs, setSlaNowMs] = useState(() => Date.now())
  const [activeDetailTab, setActiveDetailTab] = useState('Progress')
  const [progressFilter, setProgressFilter] = useState<ProgressFilterType>('All Actions')
  const [showProgressFilterMenu, setShowProgressFilterMenu] = useState(false)
  const [progressExpanded, setProgressExpanded] = useState(true)
  const [progressAtEnd, setProgressAtEnd] = useState(false)
  const [isCompactDetailLayout, setIsCompactDetailLayout] = useState(() => {
    if (typeof window === 'undefined') return false
    const viewportWidth = window.visualViewport?.width ?? window.innerWidth
    return viewportWidth <= 1360
  })
  const [showActionComposer, setShowActionComposer] = useState(false)
  const [showInternalNoteEditor, setShowInternalNoteEditor] = useState(false)
  const [internalNoteVisibility, setInternalNoteVisibility] = useState<'public' | 'private'>('private')
  const [slaPolicies, setSlaPolicies] = useState<any[]>([])
  const [slaApplying, setSlaApplying] = useState(false)
  const [slaPolicyMenuOpen, setSlaPolicyMenuOpen] = useState(false)
  const [slaPriorityMenuOpen, setSlaPriorityMenuOpen] = useState(false)
  const [selectedSlaPolicyName, setSelectedSlaPolicyName] = useState('')
  const [composerAttachments, setComposerAttachments] = useState<LocalAttachment[]>([])
  const [internalNoteAttachments, setInternalNoteAttachments] = useState<LocalAttachment[]>([])
  const [isUploadingAttachments, setIsUploadingAttachments] = useState(false)
  const [composerBodyHtml, setComposerBodyHtml] = useState('')
  const [composerBodyText, setComposerBodyText] = useState('')
  const [showSendReview, setShowSendReview] = useState(false)
  const composerFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const internalNoteFileInputRef = React.useRef<HTMLInputElement | null>(null)
  const composerEditorRef = React.useRef<HTMLDivElement | null>(null)
  const selectAllCheckboxRef = React.useRef<HTMLInputElement | null>(null)
  const filterMenuRef = React.useRef<HTMLDivElement | null>(null)
  const bulkActionMenuRef = React.useRef<HTMLDivElement | null>(null)
  const slaPolicyMenuRef = React.useRef<HTMLDivElement | null>(null)
  const slaPriorityMenuRef = React.useRef<HTMLDivElement | null>(null)
  const progressFilterMenuRef = React.useRef<HTMLDivElement | null>(null)
  const progressListRef = React.useRef<HTMLDivElement | null>(null)
  const [composerMenuOpen, setComposerMenuOpen] = useState(false)
  const [showCcField, setShowCcField] = useState(false)
  const [showBccField, setShowBccField] = useState(false)
  const [composerFullscreen, setComposerFullscreen] = useState(false)
  const [showFontMenu, setShowFontMenu] = useState(false)
  const [showAlignMenu, setShowAlignMenu] = useState(false)
  const [showOrderedMenu, setShowOrderedMenu] = useState(false)
  const [showUnorderedMenu, setShowUnorderedMenu] = useState(false)
  const [showQuoteMenu, setShowQuoteMenu] = useState(false)
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [linkForm, setLinkForm] = useState({ url: '', text: '' })
  const [showImageModal, setShowImageModal] = useState(false)
  const [imageForm, setImageForm] = useState({ url: '' })
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [tableSize, setTableSize] = useState({ rows: 3, cols: 3 })
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [showCannedMenu, setShowCannedMenu] = useState(false)
  const [showCannedModal, setShowCannedModal] = useState(false)
  const [cannedForm, setCannedForm] = useState({ name: '', html: '' })
  const [actionStateByTicket, setActionStateByTicket] = useState<Record<string, { accepted: boolean; ackSent: boolean; supplierLogged: boolean }>>({})
  const [composerMode, setComposerMode] = useState<
    'acknowledge' | 'emailUser' | 'logSupplier' | 'emailSupplier' | 'callbackSupplier' | 'approval' | 'resolve' | 'close' | 'noteEmail'
  >('emailUser')
  const [composerForm, setComposerForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    actionStatus: 'With User',
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

  const openInternalNoteEditor = (mode: 'public' | 'private') => {
    setInternalNoteVisibility(mode)
    setShowInternalNoteEditor(true)
  }
  const [agents, setAgents] = useState<any[]>([])
  const [myPresenceStatus, setMyPresenceStatus] = useState<PresenceStatus>(() => getStoredPresenceStatus())
  const [, setAvatarRefreshTick] = useState(0)
  const [queueCollapsed, setQueueCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [ticketMyListRules, setTicketMyListRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().ticketsMyLists)
  const [ticketQueues, setTicketQueues] = useState<TicketQueueConfig[]>(() => loadLeftPanelConfig().ticketQueues)

  const inferInboundEndUser = (ticketData: any) => {
    const requester = ticketData?.requester
    if (requester && (requester.name || requester.email || requester.username)) {
      return {
        id: requester.id,
        role: requester.role,
        name: requester.name || requester.username || requester.email || 'End User',
        username: requester.username || requester.userName || requester.name || '',
        email: requester.email || '',
        phone: requester.phone || '',
        site: requester.site || '',
        accountManager: requester.accountManager || requester.reportingManager || '',
        avatarUrl: requester.avatarUrl || requester.profilePic || requester.avatar || '',
      }
    }

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
      phone: undefined,
      site: undefined,
      accountManager: undefined,
    }
  }

  const inferCreatedFrom = (ticketData: any) => {
    const explicitSource = String(ticketData?.createdFrom || ticketData?.source || '').trim().toLowerCase()
    if (explicitSource.includes('portal')) return 'User portal'
    if (explicitSource.includes('itsm') || explicitSource.includes('platform')) return 'ITSM Platform'

    if (Number(ticketData?.requesterId || 0) > 0 && String(ticketData?.assigneeId || '').trim() === '') {
      return 'User portal'
    }

    const requesterRole = String(ticketData?.requester?.role || ticketData?.requesterRole || '').trim().toUpperCase()
    if (requesterRole === 'USER') return 'User portal'
    if (requesterRole) return 'ITSM Platform'
    return 'ITSM Platform'
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
      if (progressFilterMenuRef.current && !progressFilterMenuRef.current.contains(target)) {
        setShowProgressFilterMenu(false)
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(target)) {
        setShowFilterMenu(false)
      }
      if (bulkActionMenuRef.current && !bulkActionMenuRef.current.contains(target)) {
        setShowBulkActionMenu(false)
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
    if (!isInboundReply) return 'Platform Field'
    const requester = inferInboundEndUser(ticketData)
    if (requester?.name || requester?.email || requester?.username) {
      return String(requester.name || requester.email || requester.username)
    }
    return 'Platform Field'
  }

  const isEmailRaisedTicket = (ticketData: any) => {
    const sourceRaw = String(ticketData?.createdFrom || ticketData?.source || '').toLowerCase()
    if (sourceRaw.includes('email') || sourceRaw.includes('mail')) return true

    const description = String(ticketData?.description || '').toLowerCase()
    if (description.includes('inbound email') || description.includes('mailbox:') || description.includes('\nfrom:')) return true

    const historyItems = Array.isArray(ticketData?.history) ? ticketData.history : []
    return historyItems.some((h: any) => String(h?.note || '').toLowerCase().includes('inbound email'))
  }

  const getCreatedTimelineAction = (ticketData: any): 'Opened' | 'New' => {
    if (isEmailRaisedTicket(ticketData)) return 'New'
    const createdFrom = String(inferCreatedFrom(ticketData) || '').trim().toLowerCase()
    if (createdFrom.includes('user portal')) return 'New'
    return 'Opened'
  }

  const resolveTimelineAction = (opts: { noteRaw?: string; note?: string; fromStatus?: string; toStatus?: string; internal?: boolean; kind?: string; createdAction?: 'Opened' | 'New' }) => {
    const noteRaw = String(opts.noteRaw || '').toLowerCase()
    const note = String(opts.note || '').toLowerCase()
    const fromStatus = String(opts.fromStatus || '').trim()
    const toStatus = String(opts.toStatus || '').trim()
    const internal = Boolean(opts.internal)
    const kind = String(opts.kind || '').toLowerCase()

    if (note.includes('ticket created')) return opts.createdAction || 'Opened'
    if (note.includes('response sla marked as responded')) return 'Mark As Responded'
    if (note.includes('asset assigned')) return 'Asset Assigned'
    if (note.includes('asset unassigned')) return 'Asset Unassigned'
    if (noteRaw.startsWith('[email]')) return 'Email+Note'
    if (note.includes('inbound email reply received')) return 'Conversation'
    if (internal && note.startsWith('private:')) return 'Private Note'
    if (note.startsWith('public:')) return 'Public Note'
    if (internal) return 'Public Note'
    if (fromStatus || toStatus) {
      const toKey = toStatus.toLowerCase()
      if (toKey === 'acknowledged') return 'Accept Ticket'
      if (toKey === 'resolved') return 'Resolve Ticket'
      if (toKey === 'closed') return 'Close Ticket'
      if (toStatus) return toStatus
    }
    if (kind === 'conversation') return 'First Response'
    if (kind === 'system') return 'Updated'
    return 'Updated'
  }

  const hydrateTimelineFromTicket = (ticketData: any) => {
    const ticketKey = String(ticketData?.ticketId || ticketData?.id || '')
    if (!ticketKey) return

    const requester = inferInboundEndUser(ticketData)
    const initialAuthor = String(requester?.name || requester?.email || requester?.username || 'Platform Field')
    const initialText = String(ticketData?.subject || ticketData?.description || 'Ticket created').trim()
    const initialTime = formatTimelineTime(ticketData?.createdAt)
    const createdAction = getCreatedTimelineAction(ticketData)

    const historyItems = Array.isArray(ticketData?.history) ? ticketData.history : []
    const historyComments = historyItems
      .map((h: any) => {
        const noteRaw = String(h?.note || '').trim()
        const note = noteRaw.replace(/^\[EMAIL\]\s*/i, '').trim()
        const fromStatus = String(h?.fromStatus || '').trim()
        const toStatus = String(h?.toStatus || '').trim()
        const fallback = fromStatus || toStatus ? `Status changed: ${fromStatus || '-'} -> ${toStatus || '-'}` : 'Ticket updated'
        const internal = Boolean(h?.internal)
        const kind = noteRaw.toLowerCase().startsWith('[email]')
          ? 'conversation'
          : classifyTimelineKind(note || fallback, internal)
        return {
          author: resolveHistoryAuthor(h, ticketData),
          text: note || fallback,
          time: formatTimelineTime(h?.createdAt),
          action: resolveTimelineAction({ noteRaw, note: note || fallback, fromStatus, toStatus, internal, kind, createdAction }),
          internal,
          changedById: Number(h?.changedById || 0) || null,
          kind,
        }
      })
      .filter((e: any) => String(e.text || '').trim().length > 0)

    const merged = [
      { author: initialAuthor, text: `Ticket created: ${initialText}`, time: initialTime, action: createdAction, internal: false, changedById: null, kind: 'public' as const },
      ...historyComments,
    ]

    const seen = new Set<string>()
    const deduped = merged.filter((e) => {
    const key = `${e.author}|${e.action || ''}|${e.text}|${e.time}`
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
        issueDetail: t.issueDetail || t.subCategory || t.resolutionCategory || '',
        resolution: t.resolution || t.resolutionText || t.closureNotes || '',
        priority: t.priority || 'Low',
        status: t.status,
        type: t.type,
        endUser: t.requester?.name || t.requester?.email || '',
        dateReported: t.createdAt ? new Date(t.createdAt).toLocaleString() : '',
        lastAction: '',
        lastActionTime: '',
        assignedAgentId: t.assignedTo?.id || t.assignee?.id,
        assignedAgentName: t.assignedTo?.name || t.assignee?.name,
        workflow: t.workflow || undefined,
        team: t.team || t.category || undefined,
        requesterId: t.requesterId || t.requester?.id || undefined,
        createdFrom: inferCreatedFrom(t),
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
        issueDetail: d.issueDetail || d.subCategory || d.resolutionCategory || '',
        resolution: d.resolution || d.resolutionText || d.closureNotes || '',
        priority: d.priority || 'Low',
        status: d.status || 'New',
        type: d.type || 'Incident',
        endUser: d.requester?.name || d.requester?.email || '',
        dateReported: d.createdAt ? new Date(d.createdAt).toLocaleString() : '',
        lastAction: '',
        lastActionTime: '',
        assignedAgentId: d.assignedTo?.id || d.assignee?.id,
        assignedAgentName: d.assignedTo?.name || d.assignee?.name,
        workflow: d.workflow || undefined,
        team: d.team || d.category || undefined,
        requesterId: d.requesterId || d.requester?.id || undefined,
        createdFrom: inferCreatedFrom(d),
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
        issueDetail: '',
        resolution: '',
        priority: 'Low',
        status: 'New',
        type: 'Incident',
        endUser: '',
        createdFrom: 'ITSM Platform',
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
    if (String(user?.role || '').toUpperCase() !== 'ADMIN') {
      setSlaPolicies([])
      return
    }
    listSlaConfigs()
      .then((rows: any) => setSlaPolicies(Array.isArray(rows) ? rows : []))
      .catch(() => setSlaPolicies([]))
  }, [user?.role])

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
      if (detail.action === 'toggle-left-panel') {
        setQueueCollapsed((v) => !v)
      }
      if (detail.action === 'refresh') {
        loadTickets()
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
  const defaultTicketTypeOptions = ['Fault', 'Live Chat', 'Problem', 'Change', 'Service Request']
  const defaultWorkflowOptions = ['Fault Workflow', 'Incident Management Workflow', 'Service Request Workflow', 'Change Workflow']
  const defaultStatusOptions = ['New', 'Acknowledged', 'In Progress', 'With User', 'With Supplier', 'Awaiting Approval', 'Resolved', 'Closed']
  const defaultResolutionOptions = ['Not set', '3rd Party', 'AutoRecover', 'Internal Repair', 'Repaired']
  const createdFromOptions = ['User portal', 'ITSM Platform']

  const uniqueOptions = (values: Array<string | null | undefined>) =>
    Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))

  const [ticketWorkflowValue, setTicketWorkflowValue] = useState('Incident Management Workflow')
  const [ticketTeamValue, setTicketTeamValue] = useState('')
  const [createdFromValue, setCreatedFromValue] = useState('ITSM Platform')
  const [additionalStaffValue, setAdditionalStaffValue] = useState('')
  const [issueValue, setIssueValue] = useState('')
  const [issueDetailValue, setIssueDetailValue] = useState('')
  const [resolutionValue, setResolutionValue] = useState('Not set')
  const [editingTicketField, setEditingTicketField] = useState<string | null>(null)
  const [editingEndUserField, setEditingEndUserField] = useState<null | 'name' | 'email' | 'phone' | 'site' | 'accountManager'>(null)
  const [endUserDraft, setEndUserDraft] = useState({
    name: '',
    email: '',
    phone: '',
    site: '',
    accountManager: '',
  })
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
    dateReported: '',
    issueDetail: '',
    resolution: '',
    dateClosed: ''
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
    date: 120,
    issueDetail: 140,
    resolution: 140,
    dateClosed: 130
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
    date: 140,
    issueDetail: 160,
    resolution: 150,
    dateClosed: 150
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
    date: baseColWidths.date,
    issueDetail: baseColWidths.issueDetail,
    resolution: baseColWidths.resolution,
    dateClosed: baseColWidths.dateClosed
  })
  const [resizingColumn, setResizingColumn] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)
  const [resizeStartWidth, setResizeStartWidth] = useState(0)

  const filterOptions = [
    'All Tickets',
    'Closed Tickets',
    'Open Tickets'
  ]
  const progressFilterOptions: ProgressFilterType[] = [
    'All Actions',
    'Conversation & Internal',
    'Conversation',
    'Internal Conversations',
    'Staff',
    'Public ( User View)',
    'Private',
  ]
  const progressFilterIcons: Record<ProgressFilterType, string> = {
    'All Actions': 'eye',
    'Conversation & Internal': 'message-circle',
    'Conversation': 'messages-square',
    'Internal Conversations': 'corner-up-left',
    'Staff': 'user',
    'Public ( User View)': 'eye',
    'Private': 'eye-off',
  }

  const handleSelectAll = () => {
    const filteredIds = filteredIncidents.map((i) => i.id)
    if (filteredIds.length === 0) return
    const visibleSet = new Set(filteredIds)
    const allVisibleSelected = filteredIds.every((id) => selectedTickets.includes(id))
    setSelectedTickets((prev) => {
      if (allVisibleSelected) return prev.filter((id) => !visibleSet.has(id))
      const merged = new Set(prev)
      filteredIds.forEach((id) => merged.add(id))
      return Array.from(merged)
    })
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
  const handleTicketCreated = async () => {
    setShowNewIncidentModal(false)
    await loadTickets()
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
      endUser: '',
      lastAction: '',
      dateReported: '',
      issueDetail: '',
      resolution: '',
      dateClosed: ''
    })
  }

  const statusClass = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9\-]/g, '')

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
          createdFrom: inferCreatedFrom(d),
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

  // Timeline entries keyed by ticket id
  const [ticketComments, setTicketComments] = useState<Record<string, TimelineEntry[]>>({})

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

  const classifyTimelineKind = (text: string, internal = false, explicitKind?: TimelineEntry['kind']): TimelineEntry['kind'] => {
    if (explicitKind) return explicitKind
    const t = String(text || '').toLowerCase()
    if (t.includes('[email]') || t.includes('inbound email reply received') || t.includes('email user') || t.includes('note + email') || t.includes('email supplier')) {
      return 'conversation'
    }
    if (t.includes('response sla') || t.includes('resolution sla') || t.includes('sla')) return 'sla'
    if (t.includes('asset assigned') || t.includes('asset unassigned')) return 'asset'
    if (t.includes('user name') || t.includes('email address') || t.includes('phone number') || t.includes('reporting manager') || t.includes('site')) return 'user'
    if (internal && (t.includes('private') || t.startsWith('internal:'))) return 'private'
    if (internal) return 'internal'
    if (t.includes('status changed') || t.includes('accepted by') || t.includes('acknowledge')) return 'system'
    return 'public'
  }

  const addTicketComment = (
    ticketId: string,
    text: string,
    meta?: { internal?: boolean; kind?: TimelineEntry['kind']; changedById?: number | null }
  ) => {
    const now = new Date().toLocaleString()
    const author = getCurrentAgentName()
    const internal = Boolean(meta?.internal)
    const kind = classifyTimelineKind(text, internal, meta?.kind)
    const changedById = Number(meta?.changedById || user?.id || 0) || null
    setTicketComments(prev => ({
      ...prev,
      [ticketId]: [ ...(prev[ticketId] || []), { author, text, time: now, internal, kind, changedById } ]
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
    const actionState = getTicketActionState(selectedTicket)
    const acceptedDone = actionState.accepted || statusKey !== 'new'
    const acknowledgedDone = actionState.ackSent || (acceptedDone && statusKey !== 'acknowledged')
    const buttons: { label: string; onClick: () => void; className?: string }[] = [{ label: 'Back', onClick: closeDetail }]
    const responseMarked = Boolean((selectedTicket as any)?.sla?.response?.completedAt) && Number((selectedTicket as any)?.sla?.response?.completedById || 0) > 0
    if (acknowledgedDone && !responseMarked) buttons.push({ label: 'Mark as responsed', onClick: handleMarkAsResponsed })
    buttons.push({ label: 'Public note', onClick: () => openInternalNoteEditor('public') })
    buttons.push({ label: 'Private note', onClick: () => openInternalNoteEditor('private') })
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
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
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
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
    }
    if (typeKey === 'accessrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Send to Manager', onClick: go('Manager Approval') })
      else if (statusKey === 'manager approval') {
        buttons.push({ label: 'Approve', onClick: go('IT Approval') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'it approval') buttons.push({ label: 'IT Approve', onClick: go('Provisioning') })
      else if (statusKey === 'provisioning') buttons.push({ label: 'Provision Access', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
    }
    if (typeKey === 'newstarterrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Confirm by HR', onClick: go('HR Confirmation') })
      else if (statusKey === 'hr confirmation') buttons.push({ label: 'Start IT Setup', onClick: go('IT Setup') })
      else if (statusKey === 'it setup') buttons.push({ label: 'Allocate Asset', onClick: go('Asset Allocation') })
      else if (statusKey === 'asset allocation') buttons.push({ label: 'Mark Ready', onClick: go('Ready for Joining') })
      else if (statusKey === 'ready for joining') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
    }
    if (typeKey === 'leaverrequest') {
      if (statusKey === 'new') buttons.push({ label: 'HR Confirm', onClick: go('HR Confirmation') })
      else if (statusKey === 'hr confirmation') buttons.push({ label: 'Revoke Access', onClick: go('Access Revoked') })
      else if (statusKey === 'access revoked') buttons.push({ label: 'Collect Asset', onClick: go('Asset Collected') })
      else if (statusKey === 'asset collected') buttons.push({ label: 'Complete Offboarding', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
    }
    if (typeKey === 'task') {
      if (statusKey === 'new') buttons.push({ label: 'Accept', onClick: go('Assigned') })
      else if (statusKey === 'assigned') buttons.push({ label: 'Start', onClick: go('In Progress') })
      else if (statusKey === 'in progress') buttons.push({ label: 'Complete', onClick: go('Completed') })
      else if (statusKey === 'completed') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
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
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
    }
    if (typeKey === 'hrrequest') {
      if (statusKey === 'new') buttons.push({ label: 'Send to HR', onClick: go('HR Review') })
      else if (statusKey === 'hr review') {
        buttons.push({ label: 'Start Review', onClick: go('In Progress') })
        buttons.push({ label: 'Reject', onClick: go('Rejected') })
      } else if (statusKey === 'in progress') buttons.push({ label: 'Resolve', onClick: go('Resolved') })
      else if (statusKey === 'resolved') buttons.push({ label: 'Close', onClick: go('Closed') })
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
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
      return buttons.filter((btn) => {
        const key = String(btn.label || '').trim().toLowerCase()
        if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
        return true
      })
    }
    return buttons.filter((btn) => {
      const key = String(btn.label || '').trim().toLowerCase()
      if (!acceptedDone && ['mark as responsed', 'acknowledge', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
      if (!acknowledgedDone && ['mark as responsed', 'log to supplier', 'approval', 'requesting approval', 'resolve', 'resolve ticket'].includes(key)) return false
      return true
    })
  }

  const closeDetail = () => {
    setShowDetailView(false)
    navigate('/tickets')
  }

  const getTicketActionState = (ticket: Incident | null) => {
    if (!ticket) return { accepted: false, ackSent: false, supplierLogged: false }
    const key = ticket.id
    const base = actionStateByTicket[key] || { accepted: false, ackSent: false, supplierLogged: false }
    const status = String(ticket.status || '').toLowerCase()
    const inferredAccepted = status !== 'new'
    const inferredAck = ['in progress', 'resolved', 'closed', 'with supplier', 'awaiting approval'].includes(status)
    const inferredSupplier = status.includes('supplier')
    return {
      accepted: base.accepted || inferredAccepted,
      ackSent: base.ackSent || inferredAck,
      supplierLogged: base.supplierLogged || inferredSupplier,
    }
  }

  const updateTicketStatusLocal = (ticketId: string, status: string) => {
    setIncidents((prev) => prev.map((i) => (i.id === ticketId ? { ...i, status } : i)))
    setSelectedTicket((prev) => (prev ? { ...prev, status } : prev))
  }

  const markTicketActionState = (ticketId: string, patch: Partial<{ accepted: boolean; ackSent: boolean; supplierLogged: boolean }>) => {
    setActionStateByTicket((prev) => ({
      ...prev,
      [ticketId]: {
        accepted: prev[ticketId]?.accepted || false,
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
    if (mode === 'approval') return 'Requesting Approval'
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

  const htmlToPlainText = (html: string) => {
    if (typeof window === 'undefined') return html
    const container = document.createElement('div')
    container.innerHTML = html
    return String(container.textContent || container.innerText || '').trim()
  }

  const escapeHtml = (value: string) => (
    String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  )

  const formatTemplateDate = (raw: string) => {
    if (!raw) return '-'
    const d = new Date(raw)
    if (Number.isNaN(d.getTime())) return raw
    return d.toLocaleDateString()
  }

  const getApprovalTemplate = () => {
    if (!selectedTicket) return ''
    const approverName = composerForm.approvalTeam || 'Approver'
    const requesterName = String(endUser?.name || selectedTicket.endUser || 'Requester').trim() || 'Requester'
    const department = String(selectedTicket.team || selectedTicket.category || '-').trim() || '-'
    const requestType = String(selectedTicket.type || 'Service').trim() || 'Service'
    const priority = String(selectedTicket.priority || '-').trim() || '-'
    const shortDescription = String(selectedTicket.subject || '-').trim() || '-'
    const businessJustification = String(selectedTicket.issueDetail || '-').trim() || '-'
    const impactDetails = String(selectedTicket.resolution || '-').trim() || '-'
    const plannedStartDate = formatTemplateDate(selectedTicket.createdAt || '')
    const plannedEndDate = '-'

    return `Dear ${approverName},

Approval is required for the following request:

Ticket ID: ${selectedTicket.id}
Request Type: ${requestType}
Requested By: ${requesterName}
Department: ${department}
Priority: ${priority}

Description:
${shortDescription}

Business Justification:
${businessJustification}

Impact:
${impactDetails}

Planned Start Date: ${plannedStartDate}
Planned End Date: ${plannedEndDate}

Kindly review and approve or reject this request at your earliest convenience.

You may respond by:
- Clicking Approve in the system
- Clicking Reject in the system
- Replying to this email with "Approved" or "Rejected"

If rejected, please provide a reason for tracking purposes.

Thank you for your prompt action.

Regards,
Service Desk
TrustyBytes

---
Quick Approval Template

Hi ${approverName},

Please review the below request:

Ticket ID: ${selectedTicket.id}
Requested By: ${requesterName}
Request: ${shortDescription}

Kindly reply with:
YES - to approve
NO - to reject

If rejecting, please mention the reason.

Thank you,
Service Desk Team

---
System Notification Version

Subject: Approval Pending - Ticket #${selectedTicket.id}

You have a pending approval request.

Ticket: #${selectedTicket.id}
Requester: ${requesterName}
Priority: ${priority}
Summary: ${shortDescription}

Click below to proceed:
[Approve] [Reject]`
  }

  const loadStoredList = <T,>(key: string, fallback: T): T => {
    if (typeof window === 'undefined') return fallback
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) return fallback
      const parsed = JSON.parse(raw)
      return parsed as T
    } catch {
      return fallback
    }
  }

  const buildMailPreviewHtml = () => {
    const bannerList = loadStoredList<MailBannerRecord[]>(MAIL_BANNER_STORAGE_KEY, [])
    const signatureList = loadStoredList<EmailSignatureRecord[]>(EMAIL_SIGNATURE_STORAGE_KEY, [])
    const activeBanner = bannerList.find((b) => b && b.active)
    const userId = user?.id ? String(user.id) : ''
    const signature = signatureList.find((s) => s && s.active && String(s.userId || '') === userId)
    const bannerTone = activeBanner?.tone || 'info'
    const bannerColor =
      bannerTone === 'success' ? '#16a34a' :
      bannerTone === 'warning' ? '#f59e0b' :
      bannerTone === 'danger' ? '#ef4444' :
      '#2563eb'
    const bannerHtml = activeBanner
      ? `<div style="border:1px solid ${bannerColor};background:${bannerColor}1a;border-radius:10px;padding:10px 12px;margin-bottom:16px">
          <div style="font-weight:700;margin-bottom:4px;color:#111827">${activeBanner.title}</div>
          <div style="color:#111827;font-size:13px">${activeBanner.message}</div>
        </div>`
      : ''
    const recipientName = String(endUser?.name || '').trim()
    const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,'
    const bodyHtml = composerBodyHtml || '<p>(Empty message)</p>'
    let signatureHtml = ''
    if (signature?.signatureHtml) {
      const raw = String(signature.signatureHtml)
      const hasTags = /<[^>]+>/.test(raw)
      const safe = hasTags ? raw : raw.replace(/\n/g, '<br/>')
      signatureHtml = `<div style="margin-top:18px">${safe}</div>`
    }

    return `
      ${bannerHtml}
      <p>${greeting}</p>
      <div>${bodyHtml}</div>
      ${signatureHtml}
    `
  }

  const CANNED_TEXT_STORAGE_KEY = 'composer.canned_texts.v1'
  const loadCannedTexts = () => loadStoredList<{ id: string; name: string; html: string }[]>(CANNED_TEXT_STORAGE_KEY, [])
  const saveCannedTexts = (items: { id: string; name: string; html: string }[]) => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CANNED_TEXT_STORAGE_KEY, JSON.stringify(items))
  }

  const insertHtmlAtCursor = (html: string) => {
    const editor = composerEditorRef.current
    if (!editor) return
    editor.focus()
    document.execCommand('insertHTML', false, html)
    handleComposerInput(editor.innerHTML)
  }

  const getClosestListEl = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    let node = sel.getRangeAt(0).commonAncestorContainer as HTMLElement | null
    if (node?.nodeType === 3) node = node.parentElement
    while (node && node !== composerEditorRef.current) {
      if (node.tagName === 'OL' || node.tagName === 'UL') return node
      node = node.parentElement
    }
    return null
  }

  const applyListStyle = (style: string) => {
    const list = getClosestListEl()
    if (list) (list as HTMLElement).style.listStyleType = style
  }

  const applyComposerCommand = (command: string, value?: string) => {
    const editor = composerEditorRef.current
    if (!editor) return
    editor.focus()
    if (command === 'createLink') {
      if (!value) return
      document.execCommand('createLink', false, value)
      return
    }
    if (command === 'insertImage') {
      if (!value) return
      document.execCommand('insertImage', false, value)
      return
    }
    if (command === 'insertText' && value) {
      document.execCommand('insertText', false, value)
      return
    }
    if (value !== undefined) {
      document.execCommand(command, false, value)
    } else {
      document.execCommand(command, false)
    }
  }

  const handleComposerInput = (html: string) => {
    const text = htmlToPlainText(html)
    setComposerBodyHtml(html)
    setComposerBodyText(text)
    setComposerForm((prev) => ({ ...prev, body: text }))
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
      mode === 'approval' ? `Approval Pending - Ticket #${selectedTicket.id}` :
      mode === 'resolve' ? `Resolution update - ${subjectPrefix}` :
      mode === 'close' ? `Ticket closed - ${subjectPrefix}` :
      mode === 'acknowledge' ? `Acknowledged - ${subjectPrefix}` :
      `Update - ${subjectPrefix}`

    const defaultBody = mode === 'approval' ? getApprovalTemplate() : ''
    const defaultBodyHtml = defaultBody
      ? `<div>${escapeHtml(defaultBody).replace(/\n/g, '<br/>')}</div>`
      : ''

    setComposerForm((prev) => ({
      ...prev,
      to: toDefault,
      cc: '',
      bcc: '',
      subject: subjectDefault,
      body: defaultBody,
      actionStatus: 'With User',
      currentAction: '',
      nextAction: '',
      asset: '',
    }))
    setComposerBodyHtml(defaultBodyHtml)
    setComposerBodyText(defaultBody)
    if (composerEditorRef.current) composerEditorRef.current.innerHTML = defaultBodyHtml
    setComposerAttachments([])
    setShowCcField(false)
    setShowBccField(false)
    setComposerMenuOpen(false)
    setShowActionComposer(true)
    window.requestAnimationFrame(() => {
      if (composerEditorRef.current) composerEditorRef.current.innerHTML = defaultBodyHtml
    })
  }

  const getActionButtons = () => {
    if (!selectedTicket) return []
    if (!isIncidentOrFault(selectedTicket.type)) return getNonIncidentWorkflowButtons()
    if (user?.role === 'USER') {
      return [{ label: 'Back', onClick: closeDetail }]
    }

    const status = (selectedTicket.status || '').toLowerCase()
    const actionState = getTicketActionState(selectedTicket)
    const acceptedDone = actionState.accepted || status !== 'new'
    const acknowledgedDone = actionState.ackSent || (acceptedDone && status !== 'acknowledged')
    const responseMarked = Boolean((selectedTicket as any)?.sla?.response?.completedAt) && Number((selectedTicket as any)?.sla?.response?.completedById || 0) > 0
    const buttons: { label: string; onClick: () => void; className?: string }[] = []

    buttons.push({ label: 'Back', onClick: closeDetail })
    if (acknowledgedDone && !responseMarked) buttons.push({ label: 'Mark as responsed', onClick: handleMarkAsResponsed })

    if (status === 'closed') {
      buttons.push({ label: 'Re-open', onClick: () => applyStatus('In Progress', 'Re-opened') })
      buttons.push({ label: 'Public note', onClick: () => openInternalNoteEditor('public') })
      buttons.push({ label: 'Private note', onClick: () => openInternalNoteEditor('private') })
      buttons.push({ label: 'Email User', onClick: () => openComposer('emailUser') })
      return buttons
    }

    if (status === 'new' && !actionState.accepted) {
      buttons.push({ label: 'Accept', onClick: handleAccept })
      buttons.push({ label: 'Private note', onClick: () => openInternalNoteEditor('private') })
      buttons.push({ label: 'Close', onClick: () => openComposer('close') })
      return buttons
    }

    if (status === 'acknowledged' && !actionState.ackSent) {
      buttons.push({ label: 'Acknowledge', onClick: () => openComposer('acknowledge') })
      buttons.push({ label: 'Private note', onClick: () => openInternalNoteEditor('private') })
      buttons.push({ label: 'Close', onClick: () => openComposer('close') })
      return buttons
    }

    if (acceptedDone && !actionState.ackSent) buttons.push({ label: 'Acknowledge', onClick: () => openComposer('acknowledge') })
    buttons.push({ label: 'Email User', onClick: () => openComposer('emailUser') })

    if (acknowledgedDone && !actionState.supplierLogged) {
      buttons.push({ label: 'Log to Supplier', onClick: () => openComposer('logSupplier') })
    } else if (acknowledgedDone) {
      buttons.push({ label: 'Email Supplier', onClick: () => openComposer('emailSupplier') })
      buttons.push({ label: 'Call Back Supplier', onClick: () => openComposer('callbackSupplier') })
    }

    buttons.push({ label: 'Public note', onClick: () => openInternalNoteEditor('public') })
    buttons.push({ label: 'Private note', onClick: () => openInternalNoteEditor('private') })
    buttons.push({ label: 'Note + Email', onClick: () => openComposer('noteEmail') })
    if (acknowledgedDone) buttons.push({ label: 'Requesting Approval', onClick: () => openComposer('approval') })
    if (acknowledgedDone) buttons.push({ label: 'Resolve', onClick: () => openComposer('resolve') })
    buttons.push({ label: 'Close', onClick: () => openComposer('close') })
    return buttons
  }

  const actionIconMap: Record<string, string> = {
    Back: 'arrow-left',
    Accept: 'circle-check-big',
    Acknowledge: 'check',
    'Public note': 'sticky-note',
    'Private note': 'sticky-note',
    Close: 'circle-x',
    'Email User': 'mail',
    'Log to Supplier': 'package',
    Approval: 'clipboard-check',
    'Requesting Approval': 'clipboard-check',
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
    'Mark as responsed': 'badge-check',
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

  const ticketTypeOptions = React.useMemo(
    () => uniqueOptions([...defaultTicketTypeOptions, ...incidents.map((incident) => incident.type), selectedTicket?.type]),
    [incidents, selectedTicket?.type]
  )
  const workflowOptions = React.useMemo(
    () => uniqueOptions([...defaultWorkflowOptions, selectedTicket?.workflow]),
    [selectedTicket?.workflow]
  )
  const statusOptions = React.useMemo(
    () => uniqueOptions([...defaultStatusOptions, ...incidents.map((incident) => incident.status), selectedTicket?.status]),
    [incidents, selectedTicket?.status]
  )
  const teamOptions = React.useMemo(
    () =>
      uniqueOptions([
        ...visibleTicketQueues.map((queue) => queue.label),
        selectedTicket?.team,
        selectedTicket?.category,
        selectedTicket ? mapTeam(selectedTicket).team : '',
      ]),
    [visibleTicketQueues, selectedTicket]
  )
  const agentOptions = React.useMemo(
    () =>
      agents.map((agent) => ({
        id: String(agent?.id || ''),
        label: getAgentDisplayName(agent),
      })),
    [agents]
  )
  const issueOptions = React.useMemo(
    () => uniqueOptions(Object.keys(categoryOptions).map((key) => key.split('>')[0])),
    [categoryOptions]
  )
  const issueDetailOptions = React.useMemo(() => {
    if (!issueValue) return []
    const direct = categoryOptions[issueValue as keyof typeof categoryOptions] || []
    const nested = Object.entries(categoryOptions)
      .filter(([key]) => key.startsWith(`${issueValue}>`))
      .flatMap(([, values]) => values)
    return uniqueOptions([...direct, ...nested, selectedTicket?.issueDetail, issueDetailValue])
  }, [categoryOptions, issueDetailValue, issueValue, selectedTicket?.issueDetail])

  const syncSelectedTicketInList = (ticketId: string, patch: Partial<Incident>) => {
    setSelectedTicket((prev) => (prev && prev.id === ticketId ? { ...prev, ...patch } : prev))
    setIncidents((prev) => prev.map((incident) => (incident.id === ticketId ? { ...incident, ...patch } : incident)))
  }

  const updateTicketPatch = async (patch: any, localPatch: Partial<Incident>) => {
    if (!selectedTicket) return
    syncSelectedTicketInList(selectedTicket.id, localPatch)
    try {
      await ticketService.updateTicket(selectedTicket.id, patch)
    } catch (error: any) {
      alert(error?.response?.data?.error || error?.message || 'Failed to update ticket details')
    }
  }

  React.useEffect(() => {
    if (!selectedTicket) return
    const fallbackTeam = String(
      ticketQueues.find((queue) => {
        if (!Array.isArray(queue.visibilityRoles) || queue.visibilityRoles.length === 0) return true
        return queue.visibilityRoles.map((r) => String(r || '').toUpperCase()).includes(String(user?.role || '').toUpperCase())
      })?.label || ''
    ).trim()
    setEditingTicketField(null)
    setEditingEndUserField(null)
    setCreatedFromValue(String(selectedTicket.createdFrom || inferCreatedFrom(selectedTicket)))
    setTicketWorkflowValue(String(selectedTicket.workflow || 'Incident Management Workflow'))
    setTicketTeamValue(String(selectedTicket.team || mapTeam(selectedTicket).team || selectedTicket.category || fallbackTeam || ''))
    setAdditionalStaffValue(String((selectedTicket.additionalAgents || [])[0] || ''))
    setIssueValue(String(selectedTicket.category || ''))
    setIssueDetailValue(String(selectedTicket.issueDetail || ''))
    setResolutionValue(String(selectedTicket.resolution || 'Not set'))
    setEndUserDraft({
      name: String(endUser?.name || ''),
      email: String(endUser?.email || ''),
      phone: String(endUser?.phone || ''),
      site: String(endUser?.site || ''),
      accountManager: String(endUser?.accountManager || ''),
    })
  }, [endUser?.accountManager, endUser?.email, endUser?.name, endUser?.phone, endUser?.site, selectedTicket?.id, ticketQueues, user?.role])

  React.useEffect(() => {
    if (!endUser) return
    const byId = endUser?.id ? agents.find((a: any) => Number(a?.id) === Number(endUser.id)) : null
    const byEmail = !byId && endUser?.email
      ? agents.find((a: any) => String(a?.email || '').trim().toLowerCase() === String(endUser.email || '').trim().toLowerCase())
      : null
    const match: any = byId || byEmail
    if (!match) return
    const next = {
      id: endUser?.id || match.id,
      name: endUser?.name || match.name || match.username || endUser?.email || 'End User',
      username: endUser?.username || match.username || match.userName || '',
      email: endUser?.email || match.email || '',
      phone: endUser?.phone || match.phone || '',
      site: endUser?.site || match.site || '',
      accountManager: endUser?.accountManager || match.accountManager || match.reportingManager || '',
      avatarUrl: endUser?.avatarUrl || match.avatarUrl || '',
    }
    const changed =
      String(endUser?.id || '') !== String(next.id || '') ||
      String(endUser?.name || '') !== String(next.name || '') ||
      String(endUser?.username || '') !== String(next.username || '') ||
      String(endUser?.email || '') !== String(next.email || '') ||
      String(endUser?.phone || '') !== String(next.phone || '') ||
      String(endUser?.site || '') !== String(next.site || '') ||
      String(endUser?.accountManager || '') !== String(next.accountManager || '') ||
      String(endUser?.avatarUrl || '') !== String(next.avatarUrl || '')
    if (!changed) return
    setEndUser((prev: any) => ({
      ...(prev || {}),
      ...next,
    }))
  }, [agents, endUser])
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
    const acceptStatus = isIncidentOrFault(selectedTicket.type) ? 'In Progress' : 'Assigned'
    setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: acceptStatus, assignedAgentId: assigneeId, assignedAgentName: assigneeName } : i))
    setSelectedTicket(prev => prev ? { ...prev, status: acceptStatus, assignedAgentId: assigneeId, assignedAgentName: assigneeName } : prev)
    addTicketComment(selectedTicket.id, `Accepted by ${assigneeName}`)
    markTicketActionState(selectedTicket.id, { accepted: true, ackSent: false })
    const syncFromServer = (res: any) => {
      if (!res) return
      setSelectedTicket((prev) => prev ? {
        ...prev,
        status: res.status || prev.status,
        sla: res.sla || prev.sla,
        slaTimeLeft: res.slaTimeLeft || prev.slaTimeLeft,
      } : prev)
      setIncidents((prev) => prev.map((i) => i.id === selectedTicket.id ? {
        ...i,
        status: res.status || i.status,
        sla: res.sla || i.sla,
        slaTimeLeft: res.slaTimeLeft || i.slaTimeLeft,
      } : i))
    }
    ;(async () => {
      let canTransitionFromServerState = true
      try {
        const live = await ticketService.getTicket(selectedTicket.id)
        syncFromServer(live)
        const liveStatus = String(live?.status || '').trim().toLowerCase()
        canTransitionFromServerState = liveStatus === 'new'
      } catch {
        // If live read fails, fall back to optimistic transition attempt.
      }

      try {
        if (canTransitionFromServerState) {
          const transitioned = await ticketService.transitionTicket(selectedTicket.id, acceptStatus)
          syncFromServer(transitioned)
        }
      } catch (err) {
        const statusCode = Number((err as any)?.response?.status || 0)
        if (statusCode !== 400) {
          console.warn('Accept transition failed', err)
        }
      }
      if (user?.id) {
        ticketService.updateTicket(selectedTicket.id, { assigneeId: Number(user.id) }).then(syncFromServer).catch((err) => {
          console.warn('Assign after accept failed', err)
        })
      }
    })()
  }

  const handleMarkAsResponsed = () => {
    if (!selectedTicket) return
    ;(async () => {
      try {
        const res = await ticketService.markResponded(selectedTicket.id)
        setSelectedTicket((prev) => prev ? {
          ...prev,
          sla: res.sla || prev.sla,
          slaTimeLeft: res.slaTimeLeft || prev.slaTimeLeft,
        } : prev)
        setIncidents((prev) => prev.map((i) => i.id === selectedTicket.id ? {
          ...i,
          sla: res.sla || i.sla,
          slaTimeLeft: res.slaTimeLeft || i.slaTimeLeft,
        } : i))
        addTicketComment(selectedTicket.id, 'Response SLA marked as responded')
      } catch (err: any) {
        console.warn('Mark response SLA failed', err)
        alert(err?.response?.data?.error || err?.message || 'Failed to mark response SLA')
      }
    })()
  }

  const renderIconGlyph = (icon: string, className: string) => {
    const glyphMap: Record<string, string> = {
      'arrow-left': '\u2190',
      'circle-check-big': '\u2713',
      check: '\u2713',
      'sticky-note': '\u270E',
      'circle-x': '\u2715',
      mail: '\u2709',
      package: '\u25A3',
      'clipboard-check': '\u2611',
      'mail-plus': '\u2709',
      'phone-call': '\u260E',
      'rotate-ccw': '\u21BA',
      lock: 'L',
      send: '\u27A4',
      'refresh-ccw': '\u21BA',
      'badge-check': '\u2714',
      'messages-square': '\u25A6',
      'square-plus': '+',
      'square-minus': '\u2212',
      'arrow-up': '\u2191',
      'arrow-down': '\u2193',
    }
    return <span className={className} aria-hidden="true">{glyphMap[icon] || '\u2022'}</span>
  }

  const renderActionIcon = (label: string) => {
    const icon = actionIconMap[label]
    if (!icon) return null
    return renderIconGlyph(icon, 'action-icon')
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

  const uploadSelectedAttachments = async (
    ticketId: string,
    localFiles: LocalAttachment[],
    opts?: { note?: string; internal?: boolean }
  ) => {
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
      const uploaded = await ticketService.uploadAttachments(ticketId, {
        files: filesPayload,
        ...(opts?.note ? { note: opts.note } : {}),
        ...(typeof opts?.internal === 'boolean' ? { internal: opts.internal } : {}),
      })
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
    addTicketComment(selectedTicket.id, `Public: ${note}`, { internal: false, kind: 'public' })
    // try to persist to backend as a public note
    ticketService.createHistory(selectedTicket.id, { note: `Public: ${note}` }).catch(() => {
      // ignore errors — kept in UI as demo
    })
  }

  const openSendReview = () => {
    const bodyText = composerBodyText.trim() || htmlToPlainText(composerBodyHtml)
    if (!bodyText) {
      alert('Please enter message')
      return
    }
    setComposerBodyText(bodyText)
    setShowSendReview(true)
  }

  const handleSendActionComposer = async () => {
    if (!selectedTicket) return
    const body = composerBodyText.trim()
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
      setComposerBodyHtml('')
      setComposerBodyText('')
      setShowActionComposer(false)
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to send action')
    }
  }

  const handleSaveInternalNote = async () => {
    if (!selectedTicket) return
    const note = internalNoteForm.body.trim()
    const noteTypeLabel = internalNoteVisibility === 'public' ? 'public note' : 'private note'
    if (!note) {
      alert(`Please enter ${noteTypeLabel}`)
      return
    }
    const normalizedText = internalNoteVisibility === 'public'
      ? (/^public:/i.test(note) ? note : `Public: ${note}`)
      : (/^private:/i.test(note) ? note : `Private: ${note}`)
    const isPrivateNote = internalNoteVisibility === 'private'
    addTicketComment(selectedTicket.id, normalizedText, {
      internal: isPrivateNote,
      kind: isPrivateNote ? 'private' : 'public',
      changedById: Number(user?.id || 0) || null
    })
    try {
      if (isPrivateNote) {
        const uploadedItems = await uploadSelectedAttachments(selectedTicket.id, internalNoteAttachments)
        const attachmentIds = uploadedItems.map((a: any) => Number(a.id)).filter((n: number) => Number.isFinite(n))
        await ticketService.privateNote(selectedTicket.id, { note: normalizedText, attachmentIds })
      } else if (internalNoteAttachments.length) {
        await uploadSelectedAttachments(selectedTicket.id, internalNoteAttachments, {
          note: normalizedText,
          internal: false,
        })
      } else {
        await ticketService.createHistory(selectedTicket.id, { note: normalizedText })
      }
      if (internalNoteForm.status && internalNoteForm.status !== selectedTicket.status) {
        await ticketSvc.transitionTicket(selectedTicket.id, internalNoteForm.status).catch(() => undefined)
        updateTicketStatusLocal(selectedTicket.id, internalNoteForm.status)
      }
      setInternalNoteAttachments([])
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to save note')
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
          incident.dateReported.toLowerCase().includes(searchLower) ||
          String(incident.issueDetail || '').toLowerCase().includes(searchLower) ||
          String(incident.resolution || '').toLowerCase().includes(searchLower) ||
          String(incident.closedAt ? new Date(incident.closedAt).toLocaleString() : '').toLowerCase().includes(searchLower)
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
    if (searchValues.issueDetail && !String(incident.issueDetail || '').toLowerCase().includes(searchValues.issueDetail.toLowerCase())) return false
    if (searchValues.resolution && !String(incident.resolution || '').toLowerCase().includes(searchValues.resolution.toLowerCase())) return false
    if (searchValues.dateClosed) {
      const closedLabel = incident.closedAt ? new Date(incident.closedAt).toLocaleString() : ''
      if (!closedLabel.toLowerCase().includes(searchValues.dateClosed.toLowerCase())) return false
    }

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
    const incidentIds = new Set(incidents.map((i) => i.id))
    setSelectedTickets((prev) => prev.filter((id) => incidentIds.has(id)))
  }, [incidents])

  React.useEffect(() => {
    if (selectedTickets.length === 0) setShowBulkActionMenu(false)
  }, [selectedTickets.length])

  const filteredTicketIds = filteredIncidents.map((i) => i.id)
  const allFilteredSelected = filteredTicketIds.length > 0 && filteredTicketIds.every((id) => selectedTickets.includes(id))
  const someFilteredSelected = filteredTicketIds.some((id) => selectedTickets.includes(id))

  React.useEffect(() => {
    if (!selectAllCheckboxRef.current) return
    selectAllCheckboxRef.current.indeterminate = !allFilteredSelected && someFilteredSelected
  }, [allFilteredSelected, someFilteredSelected])

  const handleBulkAction = async (action: string) => {
    if (!selectedTickets.length) return
    setShowBulkActionMenu(false)
    const selectedSet = new Set(selectedTickets)

    if (action === 'changeStatus') {
      const toStatus = String(window.prompt('Enter status (New, In Progress, Awaiting Approval, With Supplier, On Hold, Closed):', 'In Progress') || '').trim()
      if (!toStatus) return
      await Promise.allSettled(selectedTickets.map((id) => ticketSvc.transitionTicket(id, toStatus)))
      setIncidents((prev) => prev.map((i) => (selectedSet.has(i.id) ? { ...i, status: toStatus } : i)))
      return
    }

    if (action === 'changePriority') {
      const toPriority = String(window.prompt('Enter priority (Low, Medium, High, Critical):', 'Medium') || '').trim()
      if (!toPriority) return
      await Promise.allSettled(selectedTickets.map((id) => ticketService.updateTicket(id, { priority: toPriority })))
      setIncidents((prev) => prev.map((i) => (selectedSet.has(i.id) ? { ...i, priority: toPriority as Incident['priority'] } : i)))
      return
    }

    const labels: Record<string, string> = {
      markRead: 'Marked as read',
      markUnread: 'Marked as unread',
      flag: 'Flagged',
      unflag: 'Unflagged',
      merge: 'Merge requested',
      clone: 'Clone requested',
      reassign: 'Reassign requested',
      privateNote: 'Private note action opened',
      publicNote: 'Public note action opened',
    }
    alert(`${labels[action] || 'Action applied'} for ${selectedTickets.length} ticket(s).`)
  }

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
      endUser: 'endUser',
      issueDetail: 'issueDetail',
      resolution: 'resolution',
      dateClosed: 'dateClosed'
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

  const ticketsGridTemplate = `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.sla}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.endUser}px ${columnWidths.lastAction}px ${columnWidths.date}px ${columnWidths.issueDetail}px ${columnWidths.resolution}px ${columnWidths.dateClosed}px 1fr`
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
    const completedAtMs = toTimestamp(branch?.completedAt)
    const responseCompletedById = Number(branch?.completedById || 0)
    const done = kind === 'response'
      ? Boolean(completedAtMs && responseCompletedById > 0)
      : Boolean(completedAtMs)
    const breachedByCompletion = Boolean(done && effectiveTargetMs && completedAtMs && completedAtMs > effectiveTargetMs)
    const breachedByRunning = Boolean(!done && effectiveTargetMs ? slaNowMs > effectiveTargetMs : false)
    const breached = Boolean(branch?.breached) || breachedByCompletion || breachedByRunning
    const met = done && !breached
    return {
      percent,
      balancePercent,
      remainingLabel: formatSlaClock(remainingMs),
      targetLabel: toLocalDateTime(effectiveTargetMs),
      completedLabel: toLocalDateTime(completedAtMs),
      done,
      met,
      breached,
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
  const getDefaultResponseWindowMinutes = (priority: string) => {
    const p = String(priority || '').toLowerCase()
    if (p === 'critical' || p === 'p1') return 15
    if (p === 'high' || p === 'p2') return 30
    if (p === 'medium' || p === 'p3') return 60
    return 240
  }
  const getDefaultResolutionWindowMinutes = (priority: string) => {
    const p = String(priority || '').toLowerCase()
    if (p === 'critical' || p === 'p1') return 2 * 60
    if (p === 'high' || p === 'p2') return 4 * 60
    if (p === 'medium' || p === 'p3') return 8 * 60
    return 24 * 60
  }
  const getTableSlaVisual = (incident: Incident) => {
    const now = slaNowMs
    const responseBranch = (incident as any)?.sla?.response || {}
    const resolutionBranch = (incident as any)?.sla?.resolution || {}
    const responseDone = Boolean(responseBranch?.completedAt) && Number(responseBranch?.completedById || 0) > 0
    const activeBranch = responseDone ? resolutionBranch : responseBranch
    const startMs = toTimestamp(activeBranch?.startedAt) ?? toTimestamp((incident as any)?.sla?.startedAt) ?? toTimestamp((incident as any)?.createdAt) ?? toTimestamp(incident.dateReported)
    const targetMs = toTimestamp(activeBranch?.targetAt)
    let balancePercent = 0
    let breached = false
    let label = responseDone
      ? String((incident as any)?.sla?.resolution?.remainingLabel || incident.slaTimeLeft || '--:--')
      : String((incident as any)?.sla?.response?.remainingLabel || incident.slaTimeLeft || '--:--')

    if (startMs && targetMs && targetMs > startMs) {
      const total = targetMs - startMs
      const remaining = targetMs - now
      const completedAtMs = toTimestamp(activeBranch?.completedAt)
      breached = completedAtMs ? completedAtMs > targetMs : remaining < 0
      balancePercent = breached ? 0 : Math.max(0, Math.min(100, (remaining / total) * 100))
      label = completedAtMs ? 'SLA met' : formatSlaClock(remaining)
    } else {
      const parsedSeconds = parseSlaClockToSeconds(label)
      if (parsedSeconds !== null) {
        breached = parsedSeconds < 0
        const defaultWindowSeconds = (
          responseDone
            ? getDefaultResolutionWindowMinutes(String(incident.priority || 'Low'))
            : getDefaultResponseWindowMinutes(String(incident.priority || 'Low'))
        ) * 60
        balancePercent = breached ? 0 : Math.max(0, Math.min(100, (parsedSeconds / Math.max(1, defaultWindowSeconds)) * 100))
      } else {
        breached = String(label || '').trim().startsWith('-')
        balancePercent = breached ? 0 : 50
      }
    }

    const elapsedPercent = Math.max(0, 100 - balancePercent)
    return { balancePercent, elapsedPercent, breached, label, color: getSlaElapsedColor(elapsedPercent) }
  }
  const isTicketClosed = String(selectedTicket?.status || '').trim().toLowerCase() === 'closed'
  const isPortalUser = String(user?.role || '').trim().toUpperCase() === 'USER'
  const selectedTicketTimeline = React.useMemo<TimelineEntry[]>(() => {
    if (!selectedTicket) return []
    return ticketComments[selectedTicket.id] || []
  }, [selectedTicket, ticketComments])
  const filteredProgressTimeline = React.useMemo<TimelineEntry[]>(() => {
    const list = selectedTicketTimeline
    const meId = Number(user?.id || 0)
    const meName = String(getCurrentAgentName() || '').trim().toLowerCase()
    const isConversation = (entry: TimelineEntry) => {
      const kind = String(entry?.kind || '').toLowerCase()
      const text = String(entry?.text || '').toLowerCase()
      return kind === 'conversation' || text.includes('inbound email reply received') || text.includes('[email]')
    }
    const isInternal = (entry: TimelineEntry) => Boolean(entry?.internal) || String(entry?.kind || '').toLowerCase() === 'internal' || String(entry?.kind || '').toLowerCase() === 'private'
    const isPrivate = (entry: TimelineEntry) => String(entry?.kind || '').toLowerCase() === 'private' || (Boolean(entry?.internal) && String(entry?.text || '').toLowerCase().startsWith('private'))
    const isSlaOrUserOrAsset = (entry: TimelineEntry) => {
      const kind = String(entry?.kind || '').toLowerCase()
      return kind === 'sla' || kind === 'user' || kind === 'asset'
    }
    const isAllActionsOnlyEntry = (entry: TimelineEntry) => {
      if (isSlaOrUserOrAsset(entry)) return true
      const text = String(entry?.text || '').toLowerCase()
      return (
        text.includes('ticket updated') ||
        text.includes('created from') ||
        text.includes('ticket type') ||
        text.includes('workflow') ||
        text.includes('assigned staff') ||
        text.includes('additional staff') ||
        text.includes('issue - detail') ||
        text.includes('service level agreement') ||
        text.includes('response target') ||
        text.includes('resolution target') ||
        text.includes('end-user') ||
        text.includes('reporting manager') ||
        text.includes('phone number')
      )
    }
    const isPublic = (entry: TimelineEntry) => !isPrivate(entry) && !isInternal(entry) && !isSlaOrUserOrAsset(entry)
    const isStaff = (entry: TimelineEntry) => {
      const kind = String(entry?.kind || '').toLowerCase()
      const changedById = Number(entry?.changedById || 0)
      return (kind === 'system' || kind === 'internal' || kind === 'private') && changedById > 0
    }

    // User portal visibility: show only conversation timeline.
    if (isPortalUser) return list.filter((entry) => isConversation(entry) && !isAllActionsOnlyEntry(entry))

    switch (progressFilter) {
      case 'Conversation & Internal':
        return list.filter((entry) => (isConversation(entry) || isInternal(entry) || String(entry?.kind || '').toLowerCase() === 'system' || String(entry?.kind || '').toLowerCase() === 'public') && !isAllActionsOnlyEntry(entry))
      case 'Conversation':
        return list.filter((entry) => isConversation(entry) && !isAllActionsOnlyEntry(entry))
      case 'Internal Conversations':
        return list.filter((entry) => isInternal(entry) && !isAllActionsOnlyEntry(entry))
      case 'Staff':
        return list.filter((entry) => isStaff(entry) && !isAllActionsOnlyEntry(entry))
      case 'Public ( User View)':
        return list.filter((entry) => isPublic(entry) && !isAllActionsOnlyEntry(entry))
      case 'Private':
        return list.filter((entry) => {
          if (isAllActionsOnlyEntry(entry)) return false
          if (!isPrivate(entry)) return false
          const byId = meId > 0 && Number(entry?.changedById || 0) === meId
          const byAuthor = !byId && meName && String(entry?.author || '').trim().toLowerCase() === meName
          return byId || byAuthor
        })
      case 'All Actions':
      default:
        return list
    }
  }, [isPortalUser, progressFilter, selectedTicketTimeline, user?.id, user?.name, user?.email, user?.username])
  const closingEntry = React.useMemo(() => {
    if (!selectedTicket) return null
    const timeline = selectedTicketTimeline
    return timeline
      .slice()
      .sort((a, b) => (toTimestamp(b.time) || 0) - (toTimestamp(a.time) || 0))
      .find((entry) => {
        const text = String(entry?.text || '').toLowerCase()
        return text.startsWith('closed:') || text.includes('status updated to closed') || text.includes('ticket resolved/closed')
      }) || null
  }, [selectedTicket, selectedTicketTimeline])
  const updateProgressScrollState = React.useCallback(() => {
    const el = progressListRef.current
    if (!el) return
    const threshold = 24
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold
    setProgressAtEnd(atEnd)
  }, [])
  const jumpProgressList = () => {
    const el = progressListRef.current
    if (!el) return
    if (progressAtEnd) {
      el.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }
  React.useEffect(() => {
    const timer = window.setTimeout(() => updateProgressScrollState(), 0)
    return () => window.clearTimeout(timer)
  }, [selectedTicket?.id, filteredProgressTimeline.length, showActionComposer, showInternalNoteEditor, progressExpanded, updateProgressScrollState])
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
  const createdDateObj = createdAtMs ? new Date(createdAtMs) : new Date()
  const createdTimeValue = `${String(createdDateObj.getHours()).padStart(2, '0')}:${String(createdDateObj.getMinutes()).padStart(2, '0')}`

  const pendingOpenTicketFieldRef = React.useRef<string | null>(null)
  const openTicketFieldEditor = (field: string) => {
    pendingOpenTicketFieldRef.current = field
    setEditingTicketField(field)
  }
  const closeTicketFieldEditor = () => setEditingTicketField(null)

  const renderTicketFieldValue = (
    field: string,
    value: string,
    onSelect: (next: string) => void,
    options: string[],
    fallback = 'Not set'
  ) => {
    if (editingTicketField === field) {
      return (
        <select
          className="sidebar-select"
          autoFocus
          ref={(el) => {
            if (!el) return
            if (pendingOpenTicketFieldRef.current !== field) return
            pendingOpenTicketFieldRef.current = null
            // Open option list immediately on first click (single-click edit+open).
            window.setTimeout(() => {
              try {
                el.focus()
                const picker = (el as any).showPicker
                if (typeof picker === 'function') picker.call(el)
              } catch {
                // keep focused as fallback for browsers without showPicker
                el.focus()
              }
            }, 0)
          }}
          value={value || ''}
          onBlur={closeTicketFieldEditor}
          onChange={(e) => {
            onSelect(e.target.value)
            closeTicketFieldEditor()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeTicketFieldEditor()
          }}
        >
          {options.map((option) => (
            <option key={`${field}-${option || 'empty'}`} value={option}>{option || fallback}</option>
          ))}
        </select>
      )
    }
    return (
      <button type="button" className="sidebar-inline-value" onClick={() => openTicketFieldEditor(field)}>
        {String(value || '').trim() || fallback}
      </button>
    )
  }

  const saveEndUserField = async (field: 'name' | 'email' | 'phone' | 'site' | 'accountManager') => {
    const value = String(endUserDraft[field] || '').trim()
    setEndUser((prev: any) => ({ ...(prev || {}), [field]: value }))
    if (field === 'name' && selectedTicket) {
      syncSelectedTicketInList(selectedTicket.id, { endUser: value || selectedTicket.endUser })
    }
    setEditingEndUserField(null)
    if (!endUser?.id) return
    try {
      await userService.updateUser(Number(endUser.id), { [field]: value })
    } catch (error: any) {
      alert(error?.response?.data?.error || error?.message || 'Failed to update end-user details')
    }
  }

  const renderEndUserField = (label: string, field: 'name' | 'email' | 'phone' | 'site' | 'accountManager') => {
    const value = String((endUser as any)?.[field] || '')
    const isEditing = editingEndUserField === field
    return (
      <div className="sidebar-field">
        <label>{label}</label>
        {isEditing ? (
          <input
            className="sidebar-select"
            autoFocus
            value={endUserDraft[field]}
            onChange={(e) => setEndUserDraft((prev) => ({ ...prev, [field]: e.target.value }))}
            onBlur={() => saveEndUserField(field)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEndUserField(field)
              if (e.key === 'Escape') {
                setEndUserDraft((prev) => ({ ...prev, [field]: value }))
                setEditingEndUserField(null)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="sidebar-inline-value"
            onClick={() => {
              setEndUserDraft((prev) => ({ ...prev, [field]: value }))
              setEditingEndUserField(field)
            }}
          >
            {value || 'Not set'}
          </button>
        )}
      </div>
    )
  }

  React.useEffect(() => {
    setSlaPolicyMenuOpen(false)
    setSlaPriorityMenuOpen(false)
    setShowProgressFilterMenu(false)
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

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const syncMobileView = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth
      setIsMobileView(viewportWidth <= 900)
    }
    syncMobileView()
    window.addEventListener('resize', syncMobileView)
    window.visualViewport?.addEventListener('resize', syncMobileView)
    return () => {
      window.removeEventListener('resize', syncMobileView)
      window.visualViewport?.removeEventListener('resize', syncMobileView)
    }
  }, [])

  React.useEffect(() => {
    if (isMobileView) setQueueCollapsed(true)
  }, [isMobileView])

  const mainContent = showDetailView && selectedTicket ? (
    <div className={`tickets-shell main-only ${queueCollapsed ? 'queue-collapsed' : ''}`}>
      <div className="work-main">
        <div className="detail-view-container">
        <div className="detail-action-bar">
        <div className="action-toolbar">
          {!isMobileView && queueCollapsed && (
            <button
              className="pill-icon-btn"
              title="Show side panel"
              aria-label="Show side panel"
              onClick={() => setQueueCollapsed(false)}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
          )}
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
            <div className="progress-header-right">
              {!isPortalUser && (
                <div className="filter-dropdown progress-filter-dropdown" ref={progressFilterMenuRef}>
                  <button
                    className="progress-icon-btn progress-icon-btn-filter"
                    type="button"
                    onClick={() => setShowProgressFilterMenu((v) => !v)}
                    title={progressFilter}
                    aria-label="Progress filter"
                  >
                    {renderIconGlyph('messages-square', 'progress-icon-image')}
                  </button>
                  {showProgressFilterMenu && (
                    <div className="filter-menu progress-filter-menu">
                      {progressFilterOptions.map((option) => (
                        <button
                          key={option}
                          type="button"
                          className={`filter-option progress-filter-option ${option === progressFilter ? 'active' : ''}`}
                          onClick={() => {
                            setProgressFilter(option)
                            setShowProgressFilterMenu(false)
                          }}
                        >
                          {renderIconGlyph(progressFilterIcons[option], 'progress-filter-icon')}
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="progress-actions">
                <button
                  type="button"
                  className="progress-icon-btn"
                  title={progressExpanded ? 'Collapse All' : 'Expand All'}
                  aria-label={progressExpanded ? 'Collapse All' : 'Expand All'}
                  onClick={() => setProgressExpanded((v) => !v)}
                >
                  {renderIconGlyph(progressExpanded ? 'square-minus' : 'square-plus', 'progress-icon-image')}
                </button>
                <button
                  type="button"
                  className="progress-icon-btn"
                  title={progressAtEnd ? 'Move to Top' : 'Move to Last'}
                  aria-label={progressAtEnd ? 'Move to Top' : 'Move to Last'}
                  onClick={jumpProgressList}
                >
                  {renderIconGlyph(progressAtEnd ? 'arrow-up' : 'arrow-down', 'progress-icon-image')}
                </button>
              </div>
            </div>
          </div>
          <div
            ref={progressListRef}
            onScroll={updateProgressScrollState}
            className={`progress-list${showActionComposer || showInternalNoteEditor ? ' progress-list-editor-open' : ''}${!progressExpanded ? ' progress-list-collapsed' : ''}`}
          >
            {showActionComposer && (
              <div className={`action-compose-modal inline-compose-card${composerFullscreen ? ' compose-fullscreen' : ''}`}>
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
                        setShowSendReview(false)
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
                    <button type="button" onClick={() => setComposerFullscreen((v) => !v)} aria-label="Fullscreen">[]</button>
                    <button type="button" onClick={() => setShowFontMenu((v) => !v)} aria-label="Font styles">A:</button>
                    {showFontMenu && (
                      <div className="compose-toolbar-menu">
                        <div className="compose-toolbar-group">
                          <button type="button" onClick={() => applyComposerCommand('bold')}>B</button>
                          <button type="button" onClick={() => applyComposerCommand('italic')}>i</button>
                          <button type="button" onClick={() => applyComposerCommand('underline')}>U</button>
                          <button type="button" onClick={() => applyComposerCommand('strikeThrough')}>S</button>
                        </div>
                        <div className="compose-toolbar-group">
                          <button type="button" onClick={() => applyComposerCommand('fontName', 'Arial')}>Aa</button>
                          <button type="button" onClick={() => applyComposerCommand('fontName', 'Georgia')}>Gg</button>
                          <button type="button" onClick={() => applyComposerCommand('fontName', 'Courier New')}>Mono</button>
                        </div>
                        <div className="compose-toolbar-group">
                          <button type="button" onClick={() => applyComposerCommand('fontSize', '2')}>A-</button>
                          <button type="button" onClick={() => applyComposerCommand('fontSize', '3')}>A</button>
                          <button type="button" onClick={() => applyComposerCommand('fontSize', '5')}>A+</button>
                        </div>
                      </div>
                    )}
                    <button type="button" onClick={() => setShowAlignMenu((v) => !v)} aria-label="Align">=</button>
                    {showAlignMenu && (
                      <div className="compose-toolbar-menu">
                        <button type="button" onClick={() => applyComposerCommand('justifyLeft')}>Left</button>
                        <button type="button" onClick={() => applyComposerCommand('justifyCenter')}>Center</button>
                        <button type="button" onClick={() => applyComposerCommand('justifyRight')}>Right</button>
                        <button type="button" onClick={() => applyComposerCommand('justifyFull')}>Justify</button>
                      </div>
                    )}
                    <button type="button" onClick={() => { applyComposerCommand('insertOrderedList'); setShowOrderedMenu((v) => !v) }} aria-label="Ordered list">1.</button>
                    {showOrderedMenu && (
                      <div className="compose-toolbar-menu">
                        <button type="button" onClick={() => applyListStyle('decimal')}>Default</button>
                        <button type="button" onClick={() => applyListStyle('lower-alpha')}>Lower Alpha</button>
                        <button type="button" onClick={() => applyListStyle('upper-alpha')}>Upper Alpha</button>
                        <button type="button" onClick={() => applyListStyle('lower-roman')}>Lower Roman</button>
                        <button type="button" onClick={() => applyListStyle('upper-roman')}>Upper Roman</button>
                      </div>
                    )}
                    <button type="button" onClick={() => { applyComposerCommand('insertUnorderedList'); setShowUnorderedMenu((v) => !v) }} aria-label="Unordered list">•</button>
                    {showUnorderedMenu && (
                      <div className="compose-toolbar-menu">
                        <button type="button" onClick={() => applyListStyle('disc')}>Disc</button>
                        <button type="button" onClick={() => applyListStyle('circle')}>Circle</button>
                        <button type="button" onClick={() => applyListStyle('square')}>Square</button>
                      </div>
                    )}
                    <button type="button" onClick={() => { applyComposerCommand('formatBlock', 'blockquote'); setShowQuoteMenu((v) => !v) }} aria-label="Quote">""</button>
                    {showQuoteMenu && (
                      <div className="compose-toolbar-menu">
                        <button type="button" onClick={() => applyComposerCommand('indent')}>Increase</button>
                        <button type="button" onClick={() => applyComposerCommand('outdent')}>Decrease</button>
                      </div>
                    )}
                    <button type="button" onClick={() => setShowLinkModal(true)} aria-label="Insert link">link</button>
                    <button type="button" onClick={() => setShowImageModal(true)} aria-label="Insert image">img</button>
                    <button type="button" onClick={() => setShowTablePicker((v) => !v)} aria-label="Insert table">table</button>
                    {showTablePicker && (
                      <div className="compose-toolbar-menu">
                        <label>
                          Rows
                          <input value={tableSize.rows} onChange={(e) => setTableSize((prev) => ({ ...prev, rows: Number(e.target.value || 1) }))} />
                        </label>
                        <label>
                          Cols
                          <input value={tableSize.cols} onChange={(e) => setTableSize((prev) => ({ ...prev, cols: Number(e.target.value || 1) }))} />
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const rows = Math.max(1, tableSize.rows)
                            const cols = Math.max(1, tableSize.cols)
                            const table = `<table style="border-collapse:collapse;width:100%;">${Array.from({ length: rows })
                              .map(() => `<tr>${Array.from({ length: cols }).map(() => `<td style="border:1px solid #d1d5db;padding:6px;">&nbsp;</td>`).join('')}</tr>`)
                              .join('')}</table>`
                            insertHtmlAtCursor(table)
                            setShowTablePicker(false)
                          }}
                        >
                          Insert
                        </button>
                      </div>
                    )}
                    <button type="button" onClick={() => setShowEmojiPicker((v) => !v)} aria-label="Emoticons">:)</button>
                    {showEmojiPicker && (
                      <div className="compose-toolbar-menu emoji">
                        {['😀','😁','😂','😅','😊','😍','😎','😇','😢','😡','👍','🙏','🎉','✅','⚠️','❗','💡','📌'].map((e) => (
                          <button key={e} type="button" onClick={() => { applyComposerCommand('insertText', e); setShowEmojiPicker(false) }}>{e}</button>
                        ))}
                      </div>
                    )}
                    <button type="button" onClick={() => setShowCannedMenu((v) => !v)} aria-label="Insert canned">+:</button>
                    {showCannedMenu && (
                      <div className="compose-toolbar-menu">
                        {loadCannedTexts().length === 0 && <span style={{ fontSize: 12, color: '#6b7280' }}>No canned text</span>}
                        {loadCannedTexts().map((item) => (
                          <button key={item.id} type="button" onClick={() => { insertHtmlAtCursor(item.html); setShowCannedMenu(false) }}>
                            {item.name}
                          </button>
                        ))}
                        <button type="button" onClick={() => { setShowCannedMenu(false); setShowCannedModal(true) }}>Create Canned Text</button>
                      </div>
                    )}
                    <button type="button" onClick={() => applyComposerCommand('insertHorizontalRule')} aria-label="Horizontal line">-</button>
                    <button type="button" onClick={() => applyComposerCommand('removeFormat')} aria-label="Clear formatting">Tx</button>
                  </div>
                  <div
                    ref={composerEditorRef}
                    className="compose-editor-body rich"
                    contentEditable
                    suppressContentEditableWarning
                    data-placeholder="Type your update/note here"
                    onInput={(e) => handleComposerInput(e.currentTarget.innerHTML)}
                  />
                </div>
                <div className="compose-meta-row">
                  <label className="compose-meta-field">
                    <span>Status *</span>
                    <select
                      value={composerForm.actionStatus}
                      onChange={(e) => setComposerForm((prev) => ({ ...prev, actionStatus: e.target.value }))}
                    >
                      <option>With User</option>
                      <option>In Progress</option>
                      <option>Awaiting Approval</option>
                      <option>On Hold</option>
                    </select>
                  </label>
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
                  <button className="btn-submit" onClick={openSendReview} disabled={isUploadingAttachments}>
                    {isUploadingAttachments ? 'Uploading...' : 'Send'}
                  </button>
                  <button className="btn-cancel" onClick={() => { setComposerAttachments([]); setShowSendReview(false); setShowActionComposer(false) }}>Discard</button>
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
                    <div className="compose-mode">{internalNoteVisibility === 'public' ? 'Public Note' : 'Private Note'}</div>
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
                <div className="compose-footer-actions">
                  <button className="btn-submit" onClick={handleSaveInternalNote} disabled={isUploadingAttachments}>
                    {isUploadingAttachments ? 'Uploading...' : 'Save'}
                  </button>
                  <button className="btn-cancel" onClick={() => { setInternalNoteAttachments([]); setShowInternalNoteEditor(false) }}>Discard</button>
                </div>
              </div>
            )}
            {filteredProgressTimeline
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
                const actionLabel = String((c as any)?.action || '').trim()
                return (
              <div key={`${c.time}-${idx}`} className={`progress-item${!progressExpanded ? ' is-collapsed' : ''}`}>
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
                    <div className="progress-head-left">
                      <div className="progress-author">{identity.name}</div>
                      {actionLabel ? <div className="progress-action-line">| {actionLabel}</div> : null}
                    </div>
                    <div className="progress-time">{c.time}</div>
                  </div>
                  <div className="progress-text">{c.text}</div>
                </div>
              </div>
            )})}
            {filteredProgressTimeline.length === 0 && (
              <div className="progress-item">
                {isPortalUser ? (
                  <div className="progress-body">
                    <div className="progress-meta">
                      <div className="progress-author">No conversation yet</div>
                    </div>
                  </div>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            )}
            {progressAtEnd && filteredProgressTimeline.length > 0 && (
              <button
                type="button"
                className="progress-float-btn"
                title="Move to Top"
                aria-label="Move to Top"
                onClick={jumpProgressList}
              >
                ↑
              </button>
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
                  <label>Date Created</label>
                  <span>{createdDateObj.toLocaleDateString()} {createdTimeValue}</span>
                </div>
                <div className="sidebar-field">
                  <label>Created from</label>
                  {renderTicketFieldValue(
                    'createdFrom',
                    createdFromValue,
                    (value) => {
                      setCreatedFromValue(value)
                      syncSelectedTicketInList(selectedTicket.id, { createdFrom: value })
                    },
                    createdFromOptions
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Ticket Type</label>
                  {renderTicketFieldValue(
                    'type',
                    selectedTicket.type || '',
                    (value) => updateTicketPatch({ type: value }, { type: value }),
                    ticketTypeOptions
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Workflow</label>
                  {renderTicketFieldValue(
                    'workflow',
                    ticketWorkflowValue,
                    (value) => {
                      setTicketWorkflowValue(value)
                      syncSelectedTicketInList(selectedTicket.id, { workflow: value })
                    },
                    workflowOptions
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Status</label>
                  {renderTicketFieldValue(
                    'status',
                    selectedTicket.status || '',
                    (value) => applyStatus(value, `Status updated to ${value}`),
                    statusOptions
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Team</label>
                  {renderTicketFieldValue(
                    'team',
                    ticketTeamValue,
                    (value) => {
                      setTicketTeamValue(value)
                      syncSelectedTicketInList(selectedTicket.id, { team: value, category: value })
                      ticketService.updateTicket(selectedTicket.id, { category: value }).catch(() => undefined)
                    },
                    teamOptions
                  )}
                </div>
                <div className="sidebar-field assigned-field">
                  <label>Assigned Staff</label>
                  {renderTicketFieldValue(
                    'assignedStaff',
                    selectedTicket.assignedAgentName || '',
                    (value) => {
                      const match = agentOptions.find((option) => option.label === value)
                      const selectedId = String(match?.id || '')
                      const name = match?.label || 'Not set'
                      updateTicketPatch(
                        { assigneeId: selectedId ? Number(selectedId) : null },
                        { assignedAgentId: selectedId, assignedAgentName: name }
                      )
                    },
                    ['Not set', ...uniqueOptions(agentOptions.map((option) => option.label))]
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Additional Staff</label>
                  {renderTicketFieldValue(
                    'additionalStaff',
                    additionalStaffValue,
                    (value) => {
                      const next = value === 'Not set' ? '' : value
                      setAdditionalStaffValue(next)
                      syncSelectedTicketInList(selectedTicket.id, { additionalAgents: next ? [next] : [] })
                    },
                    ['Not set', ...uniqueOptions(agentOptions.map((option) => option.label))]
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Issue</label>
                  {renderTicketFieldValue(
                    'issue',
                    issueValue,
                    (value) => {
                      const next = value === 'Not set' ? '' : value
                      setIssueValue(next)
                      updateTicketPatch({ category: next }, { category: next })
                    },
                    ['Not set', ...issueOptions]
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Issue - Detail</label>
                  {renderTicketFieldValue(
                    'issueDetail',
                    issueDetailValue,
                    (value) => {
                      const next = value === 'Not set' ? '' : value
                      setIssueDetailValue(next)
                      syncSelectedTicketInList(selectedTicket.id, { issueDetail: next })
                    },
                    ['Not set', ...issueDetailOptions]
                  )}
                </div>
                <div className="sidebar-field">
                  <label>Resolution</label>
                  {renderTicketFieldValue(
                    'resolution',
                    resolutionValue,
                    (value) => {
                      setResolutionValue(value)
                      syncSelectedTicketInList(selectedTicket.id, { resolution: value })
                    },
                    uniqueOptions([...defaultResolutionOptions, selectedTicket.resolution, resolutionValue])
                  )}
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
                    <span className={`sla-x${responseSla.met ? ' sla-check' : ''}`}>{responseSla.met ? '✓' : responseSla.breached ? 'x' : ''}</span>
                  </div>
                  {!responseSla.done ? (
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
                  ) : (
                    <div className="sla-done-line">First response completed {responseSla.completedLabel !== '-' ? `at ${responseSla.completedLabel}` : ''}</div>
                  )}
                </div>
                <div className="sla-metric">
                  <div className="sla-row">
                    <span>Resolution Target</span>
                    <span>{resolutionSla.targetLabel}</span>
                    <span className={`sla-x${resolutionSla.met ? ' sla-check' : ''}`}>{resolutionSla.met ? '✓' : resolutionSla.breached ? 'x' : ''}</span>
                  </div>
                  {!resolutionSla.done ? (
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
                  ) : (
                    <div className="sla-done-line">Resolution completed {resolutionSla.completedLabel !== '-' ? `at ${resolutionSla.completedLabel}` : ''}</div>
                  )}
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
                    <div className="enduser-client" style={{ color: '#6b7280', fontSize: 13 }}>{endUser?.email || 'Not set'}</div>
                  </div>
                </div>
                {renderEndUserField('User Name', 'name')}
                {renderEndUserField('Email Address', 'email')}
                {renderEndUserField('Phone Number', 'phone')}
                {renderEndUserField('Site', 'site')}
                {renderEndUserField('Reporting Manager', 'accountManager')}
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
            {!isMobileView && queueCollapsed && (
              <button
                className="table-icon-btn mobile-queue-toggle"
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
            {selectedTickets.length > 0 && (
              <div className="filter-dropdown bulk-action-dropdown" ref={bulkActionMenuRef}>
                <button
                  className="filter-button bulk-edit-button"
                  onClick={() => {
                    setShowFilterMenu(false)
                    setShowBulkActionMenu((v) => !v)
                  }}
                >
                  Edit({selectedTickets.length})
                  <span className="dropdown-icon">▼</span>
                </button>
                {showBulkActionMenu && (
                  <div className="filter-menu bulk-action-menu">
                    <div className="filter-option" onClick={() => handleBulkAction('markRead')}>Mark as read</div>
                    <div className="filter-option" onClick={() => handleBulkAction('markUnread')}>Mark as unread</div>
                    <div className="filter-option" onClick={() => handleBulkAction('flag')}>Flag</div>
                    <div className="filter-option" onClick={() => handleBulkAction('unflag')}>Unflag</div>
                    <div className="filter-option" onClick={() => handleBulkAction('merge')}>Merge Ticket(s)</div>
                    <div className="filter-option" onClick={() => handleBulkAction('clone')}>Clone Ticket(s)</div>
                    <div className="filter-option" onClick={() => handleBulkAction('reassign')}>Re-assign</div>
                    <div className="filter-option" onClick={() => handleBulkAction('privateNote')}>Add Private Note</div>
                    <div className="filter-option" onClick={() => handleBulkAction('publicNote')}>Add Public Note</div>
                    <div className="filter-option" onClick={() => handleBulkAction('changeStatus')}>Change Status</div>
                    <div className="filter-option" onClick={() => handleBulkAction('changePriority')}>Change Priority</div>
                  </div>
                )}
              </div>
            )}
            <div className={`filter-dropdown${isMobileView ? ' tickets-filter-mobile' : ''}`} ref={filterMenuRef}>
              {isMobileView && <span className="tickets-mobile-view-label">View</span>}
              <button 
                className="filter-button"
                onClick={() => {
                  setShowBulkActionMenu(false)
                  setShowFilterMenu(!showFilterMenu)
                }}
              >
                {isMobileView ? `${filterType} (${totalTickets})` : filterType}
                <span className="dropdown-icon">▼</span>
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
            {isMobileView && (
              <button
                className="table-icon-btn mobile-sub-sidebar-btn"
                title="More options"
                aria-label="Open sub sidebar"
                onClick={() => setQueueCollapsed((v) => !v)}
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="12" cy="19" r="1.8" />
                </svg>
              </button>
            )}
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
        {isMobileView ? (
          <div className="tickets-mobile-cards">
            {pageItems.map((incident) => {
              const isClosed = String(incident.status || '').trim().toLowerCase() === 'closed'
              const slaVisual = getTableSlaVisual(incident)
              return (
                <article key={incident.id} className="tickets-mobile-card">
                  <div className="tickets-mobile-card-head">
                    <label className="tickets-mobile-select">
                      <input
                        type="checkbox"
                        checked={selectedTickets.includes(incident.id)}
                        onChange={() => handleSelectTicket(incident.id)}
                        aria-label={`Select ${incident.id}`}
                      />
                      <span>{incident.id}</span>
                    </label>
                    <span className={`status-badge ${statusClass(incident.status)}`}>{incident.status || '-'}</span>
                  </div>
                  <button type="button" className="tickets-mobile-subject" onClick={() => handleTicketClick(incident)}>
                    {incident.subject || '-'}
                  </button>
                  {!isClosed && (
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
                  )}
                  <div className="tickets-mobile-meta">
                    <span><strong>Priority:</strong> {incident.priority || '-'}</span>
                    <span><strong>Type:</strong> {incident.type || '-'}</span>
                    <span><strong>Client:</strong> {incident.endUser || '-'}</span>
                    <span><strong>Created:</strong> {incident.dateReported || '-'}</span>
                  </div>
                </article>
              )
            })}
            {pageItems.length === 0 && (
              <div className="table-empty">No tickets found.</div>
            )}
          </div>
        ) : (
        <div className="incidents-table" ref={tableRef}>
          <div className="table-header" style={ticketsGridStyle}>
            <div className="col-checkbox col-header">
              <input ref={selectAllCheckboxRef} type="checkbox" checked={allFilteredSelected} onChange={handleSelectAll} aria-label="Select all tickets" />
              <span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'checkbox')} />
            </div>
            <div className="col-status col-header">Status<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'status')} onDoubleClick={() => handleAutoFit('status')} /></div>
            <div className="col-id col-header">Ticket ID<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'id')} onDoubleClick={() => handleAutoFit('id')} /></div>
            <div className="col-summary col-header">Subject<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'subject')} onDoubleClick={() => handleAutoFit('subject')} /></div>
            <div className="col-category col-header">Issue<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'category')} onDoubleClick={() => handleAutoFit('category')} /></div>
            <div className="col-sla col-header">SLA Time Left<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'sla')} onDoubleClick={() => handleAutoFit('sla')} /></div>
            <div className="col-priority col-header">Priority<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'priority')} onDoubleClick={() => handleAutoFit('priority')} /></div>
            <div className="col-type col-header">Ticket Type<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'type')} onDoubleClick={() => handleAutoFit('type')} /></div>
            <div className="col-endUser col-header">Client<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'endUser')} onDoubleClick={() => handleAutoFit('endUser')} /></div>
            <div className="col-lastAction col-header">Last Action Date<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'lastAction')} onDoubleClick={() => handleAutoFit('lastAction')} /></div>
            <div className="col-date col-header">Date Created<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'date')} onDoubleClick={() => handleAutoFit('date')} /></div>
            <div className="col-issueDetail col-header">Issue - Detail<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'issueDetail')} onDoubleClick={() => handleAutoFit('issueDetail')} /></div>
            <div className="col-resolution col-header">Resolution<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'resolution')} onDoubleClick={() => handleAutoFit('resolution')} /></div>
            <div className="col-dateClosed col-header">Date Closed<span className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'dateClosed')} onDoubleClick={() => handleAutoFit('dateClosed')} /></div>
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
              <div className="col-issueDetail"><input className="table-filter-input" value={searchValues.issueDetail} onChange={(e) => handleSearchChange('issueDetail', e.target.value)} /></div>
              <div className="col-resolution"><input className="table-filter-input" value={searchValues.resolution} onChange={(e) => handleSearchChange('resolution', e.target.value)} /></div>
              <div className="col-dateClosed"><input className="table-filter-input" value={searchValues.dateClosed} onChange={(e) => handleSearchChange('dateClosed', e.target.value)} /></div>
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
                  const isClosed = String(incident.status || '').trim().toLowerCase() === 'closed'
                  if (isClosed) return <span>-</span>
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
              <div className="col-issueDetail">{incident.issueDetail || '-'}</div>
              <div className="col-resolution">{incident.resolution || '-'}</div>
              <div className="col-dateClosed">{incident.closedAt ? new Date(incident.closedAt).toLocaleString() : '-'}</div>
              <div className="col-spacer" aria-hidden="true" />
            </div>
          ))}
          {pageItems.length === 0 && (
            <div className="table-empty">No tickets found.</div>
          )}
        </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="tickets-view">
      {queueSidebar}
      {mainContent}

      {showSendReview && (
        <div className="compose-review-overlay" onClick={() => setShowSendReview(false)}>
          <div className="compose-review-card" onClick={(e) => e.stopPropagation()}>
            <div className="compose-review-topbar">
              <button
                className="compose-review-send"
                onClick={async () => {
                  setShowSendReview(false)
                  await handleSendActionComposer()
                }}
                disabled={isUploadingAttachments}
              >
                Send
              </button>
              <button className="compose-review-cancel" onClick={() => setShowSendReview(false)}>Cancel</button>
              <button className="compose-review-close" onClick={() => setShowSendReview(false)} aria-label="Close">x</button>
            </div>
            <div className="compose-review-header">
              <div className="compose-review-avatar">{getInitials(getCurrentAgentName()).slice(0, 1)}</div>
              <div>
                <div className="compose-review-title">{getComposerHeading()}</div>
                <div className="compose-review-subtitle">Email</div>
              </div>
            </div>
            <div className="compose-review-body">
              <div className="compose-review-row">
                <span>Sent:</span>
                <span>Not yet ready to send (press "Send" to save your Action and send this Email or "Cancel" to edit your Action).</span>
              </div>
              <div className="compose-review-row">
                <span>From:</span>
                <span>{user?.email || 'support@itsm.local'}</span>
              </div>
              <div className="compose-review-row">
                <span>To:</span>
                <span>{composerForm.to || 'Not set'}</span>
              </div>
              <div className="compose-review-row">
                <span>Cc:</span>
                <span>{composerForm.cc || 'Not set'}</span>
              </div>
              <div className="compose-review-row">
                <span>Bcc:</span>
                <span>{composerForm.bcc || 'Not set'}</span>
              </div>
              <div className="compose-review-row">
                <span>Subject:</span>
                <span>{composerForm.subject || 'Not set'}</span>
              </div>
              <div className="compose-review-row">
                <span>Status:</span>
                <span>{composerForm.actionStatus || 'Not set'}</span>
              </div>
              {composerAttachments.length > 0 && (
                <div className="compose-review-row">
                  <span>Attachments:</span>
                  <span>{composerAttachments.map((a) => a.file.name).join(', ')}</span>
                </div>
              )}
              <div className="compose-review-content" dangerouslySetInnerHTML={{ __html: buildMailPreviewHtml() }} />
            </div>
          </div>
        </div>
      )}

      {showLinkModal && (
        <div className="compose-modal-overlay" onClick={() => setShowLinkModal(false)}>
          <div className="compose-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Insert Link</h4>
            <label>
              URL
              <input value={linkForm.url} onChange={(e) => setLinkForm((prev) => ({ ...prev, url: e.target.value }))} placeholder="https://..." />
            </label>
            <label>
              Text
              <input value={linkForm.text} onChange={(e) => setLinkForm((prev) => ({ ...prev, text: e.target.value }))} placeholder="Link text" />
            </label>
            <div className="compose-modal-actions">
              <button onClick={() => setShowLinkModal(false)}>Cancel</button>
              <button
                onClick={() => {
                  const url = linkForm.url.trim()
                  if (!url) return
                  const text = linkForm.text.trim()
                  if (text) insertHtmlAtCursor(`<a href="${url}">${text}</a>`)
                  else applyComposerCommand('createLink', url)
                  setLinkForm({ url: '', text: '' })
                  setShowLinkModal(false)
                }}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageModal && (
        <div className="compose-modal-overlay" onClick={() => setShowImageModal(false)}>
          <div className="compose-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Insert Image</h4>
            <label>
              Image URL
              <input value={imageForm.url} onChange={(e) => setImageForm((prev) => ({ ...prev, url: e.target.value }))} placeholder="https://..." />
            </label>
            <div className="compose-modal-actions">
              <button onClick={() => setShowImageModal(false)}>Cancel</button>
              <button
                onClick={() => {
                  const url = imageForm.url.trim()
                  if (!url) return
                  insertHtmlAtCursor(`<img src="${url}" alt="" style="max-width:100%;" />`)
                  setImageForm({ url: '' })
                  setShowImageModal(false)
                }}
              >
                Insert
              </button>
            </div>
          </div>
        </div>
      )}

      {showCannedModal && (
        <div className="compose-modal-overlay" onClick={() => setShowCannedModal(false)}>
          <div className="compose-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Create Canned Text</h4>
            <label>
              Name
              <input value={cannedForm.name} onChange={(e) => setCannedForm((prev) => ({ ...prev, name: e.target.value }))} />
            </label>
            <label>
              Text
              <textarea value={cannedForm.html} onChange={(e) => setCannedForm((prev) => ({ ...prev, html: e.target.value }))} />
            </label>
            <div className="compose-modal-actions">
              <button onClick={() => setShowCannedModal(false)}>Cancel</button>
              <button
                onClick={() => {
                  const name = cannedForm.name.trim()
                  const raw = (cannedForm.html.trim() || composerBodyHtml).trim()
                  const hasTags = /<[^>]+>/.test(raw)
                  const html = hasTags ? raw : raw.replace(/\n/g, '<br/>')
                  if (!name || !html) return
                  const items = loadCannedTexts()
                  saveCannedTexts([{ id: `ct-${Date.now()}`, name, html }, ...items])
                  setCannedForm({ name: '', html: '' })
                  setShowCannedModal(false)
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showNewIncidentModal && (
        <div className="modal-overlay" onClick={() => setShowNewIncidentModal(false)}>
          <div className="modal-content ticket-submit-modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="ticket-submit-modal-close" onClick={() => setShowNewIncidentModal(false)} aria-label="Close">x</button>
            <SubmitTicketForm
              className="agent-submit-ticket-form"
              createdFrom="ITSM Platform"
              requesterId={user?.id}
              requesterEmail={user?.email}
              submitLabel="Submit"
              onSubmitted={handleTicketCreated}
              onDiscard={() => setShowNewIncidentModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}




















