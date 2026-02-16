import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import * as ticketService from '../services/ticket.service'
import * as ticketSvc from '../services/ticket.service'
import * as assetService from '../services/asset.service'
import * as userService from '../services/user.service'
import { useAuth } from '../contexts/AuthContext'
import { getRowsPerPage } from '../utils/pagination'
import { loadLeftPanelConfig, type QueueRule } from '../utils/leftPanelConfig'

export type Incident = {
  id: string
  slaTimeLeft: string
  subject: string
  category: string
  priority: 'Low' | 'Medium' | 'High'
  status: 'Re-Opened' | 'New' | 'Rejected' | 'Approved' | 'Awaiting Ap' | 'Awaiting Approval' | 'In Progress' | 'Draft' | 'Updated' | 'With Supplier' | 'With HR' | 'With User' | 'Closed'
  type: string
  endUser: string
  dateReported: string
  lastAction: string
  lastActionTime: string
  assignedAgentId?: string
  assignedAgentName?: string
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
  const [activeDetailTab, setActiveDetailTab] = useState('Progress')
  const [showEmailComposer, setShowEmailComposer] = useState(false)
  const [emailTo, setEmailTo] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailStatus, setEmailStatus] = useState('With Customer')
  const [agents, setAgents] = useState<any[]>([])
  const [queueCollapsed, setQueueCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [ticketMyListRules, setTicketMyListRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().ticketsMyLists)
  const [newIncidentForm, setNewIncidentForm] = useState({
    ticketType: 'Fault',
    subject: '',
    category: '',
    priority: '' as const,
    description: ''
  })

  const loadTickets = async () => {
    try {
      const data: any = await ticketService.listTickets({ page: 1, pageSize: 200 })
      const items = Array.isArray(data) ? data : (data?.items || [])
      const mapped = items.map((t: any) => ({
        id: t.ticketId || String(t.id),
        slaTimeLeft: '00:00',
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
        assignedAgentName: t.assignedTo?.name || t.assignee?.name
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
      setShowDetailView(true)
      return
    }
    ticketService.getTicket(id).then((d: any) => {
      const mapped: Incident = {
        id: d.ticketId || String(d.id || id),
        slaTimeLeft: '00:00',
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
      }
      setSelectedTicket(mapped)
      setShowDetailView(true)
    }).catch(() => {
      setSelectedTicket({
        id: id,
        slaTimeLeft: '00:00',
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
    if (!showDetailView) {
      Promise.all([
        userService.listUsers({ role: 'ADMIN', limit: 200 }),
        userService.listUsers({ role: 'AGENT', limit: 200 }),
      ]).then(([admins, agents]) => {
        const a = Array.isArray(admins) ? admins : []
        const b = Array.isArray(agents) ? agents : []
        setAgents([...a, ...b])
      }).catch(() => {
        setAgents([])
      })
    }
  }, [showDetailView])

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
    const handler = () => setTicketMyListRules(loadLeftPanelConfig().ticketsMyLists)
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
    import('../services/ticket.service').then(svc => {
      svc.getTicket(ticket.id).then((d: any) => {
        // backend returns ticket with requester included as `requester`
        setEndUser(d.requester || null)
        setTicketAsset(d.asset || null)
        setAssetAssignId(d.asset?.id || '')
        // merge any additional ticket fields (e.g., updated status)
        setSelectedTicket(prev => prev ? { ...prev, status: d.status || prev.status, dateReported: d.createdAt ? new Date(d.createdAt).toLocaleString() : prev.dateReported } : prev)
      }).catch(() => {
        // ignore failures; keep demo state
      })
    })
  }

  // Comments keyed by ticket id (simple in-memory store for demo)
  const [ticketComments, setTicketComments] = useState<Record<string, {author: string; text: string; time: string}[]>>({})

  // Inline note editor state for detail view
  const [showNoteEditor, setShowNoteEditor] = useState(false)
  const [noteDraft, setNoteDraft] = useState('')
  const [responseDraft, setResponseDraft] = useState('')

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

  const closeDetail = () => {
    setShowDetailView(false)
    navigate('/tickets')
  }

  const getActionButtons = () => {
    if (!selectedTicket) return []
    if (!isIncidentOrFault(selectedTicket.type)) return []
    if (user?.role === 'USER') {
      return [{ label: 'Back', onClick: closeDetail }]
    }

    const status = (selectedTicket.status || '').toLowerCase()
    const buttons: { label: string; onClick: () => void; className?: string }[] = []

    // Always include back
    buttons.push({ label: 'Back', onClick: closeDetail })

    if (status === 'new') {
      buttons.push({ label: 'Accept', onClick: handleAccept })
      buttons.push({ label: 'Internal note', onClick: handleAddNote })
      buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
      return buttons
    }

    if (status === 'acknowledged') {
      buttons.push({ label: 'Acknowledge', onClick: () => applyStatus('In Progress', 'Acknowledged') })
      buttons.push({ label: 'Internal note', onClick: handleAddNote })
      buttons.push({ label: 'Re-assign', onClick: () => addTicketComment(selectedTicket.id, 'Re-assign') })
      buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
      return buttons
    }

    if (status === 'resolved') {
      buttons.push({ label: 'Internal note', onClick: handleAddNote })
      buttons.push({ label: 'User Confirmation', onClick: () => applyStatus('Waiting for User', 'User confirmation requested') })
      buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
      return buttons
    }

    if (status === 'closed') {
      buttons.push({ label: 'Internal note', onClick: handleAddNote })
      buttons.push({ label: 'Re-open', onClick: () => applyStatus('Re-Opened', 'Re-opened') })
      buttons.push({ label: 'Reclose', onClick: () => applyStatus('Closed', 'Reclosed') })
      return buttons
    }

    if (status === 'waiting for supplier') {
      buttons.push({ label: 'Email User', onClick: handleEmailUser })
      buttons.push({ label: 'Internal note', onClick: handleAddNote })
      buttons.push({ label: 'Email Supplier', onClick: () => addTicketComment(selectedTicket.id, 'Emailed supplier') })
      buttons.push({ label: 'Request Approval', onClick: () => applyStatus('Waiting for Approval', 'Approval requested') })
      buttons.push({ label: 'Re-assign', onClick: () => addTicketComment(selectedTicket.id, 'Re-assign') })
      buttons.push({ label: 'Resolve', onClick: () => applyStatus('Resolved', 'Resolved') })
      buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
      return buttons
    }

    if (status === 'waiting for approval') {
      buttons.push({ label: 'Email User', onClick: handleEmailUser })
      buttons.push({ label: 'Internal note', onClick: handleAddNote })
      buttons.push({ label: 'Log to Supplier', onClick: () => applyStatus('Waiting for Supplier', 'Logged to supplier') })
      buttons.push({ label: 'Recall to Approval', onClick: () => applyStatus('In Progress', 'Recall to approval') })
      buttons.push({ label: 'Re-assign', onClick: () => addTicketComment(selectedTicket.id, 'Re-assign') })
      buttons.push({ label: 'Resolve', onClick: () => applyStatus('Resolved', 'Resolved') })
      buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
      return buttons
    }

    // In Progress / Re-Opened / other
    buttons.push({ label: 'Email User', onClick: handleEmailUser })
    buttons.push({ label: 'Internal note', onClick: handleAddNote })
    buttons.push({ label: 'Log to Supplier', onClick: () => applyStatus('Waiting for Supplier', 'Logged to supplier') })
    buttons.push({ label: 'Request Approval', onClick: () => applyStatus('Waiting for Approval', 'Approval requested') })
    buttons.push({ label: 'Re-assign', onClick: () => addTicketComment(selectedTicket.id, 'Re-assign') })
    buttons.push({ label: 'Resolve', onClick: () => applyStatus('Resolved', 'Resolved') })
    buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
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
    'Request Approval': 'clipboard-check',
    'Re-assign': 'user-cog',
    Resolve: 'circle-check-big',
    'User Confirmation': 'user-check',
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
  const mapTeam = (incident: Incident) => {
    const c = String(incident.category || '').toLowerCase()
    if (c.includes('helpdesk')) return 'Helpdesk (Line1)'
    if (c.includes('hardware') || c.includes('network')) return 'Helpdesk (Line1)'
    if (c.includes('email') || c.includes('monitor')) return 'Monitor queue'
    if (c.includes('on-site') || c.includes('onsite')) return 'On-Site'
    return 'Technical Team (Line2)'
  }
  const countUnassigned = openIncidents.filter((i) => !i.assignedAgentId && !i.assignedAgentName).length
  const countWithSupplier = openIncidents.filter((i) => {
    const s = (i.status || '').toLowerCase()
    return s.includes('supplier')
  }).length
  const teamBuckets = openIncidents.reduce<Record<string, number>>((acc, i) => {
    const t = mapTeam(i)
    acc[t] = (acc[t] || 0) + 1
    return acc
  }, {})
  const teamGroups = openIncidents.reduce<Record<string, { total: number; unassigned: number; agents: Record<string, { label: string; count: number }> }>>((acc, i) => {
    const team = mapTeam(i)
    if (!acc[team]) acc[team] = { total: 0, unassigned: 0, agents: {} }
    acc[team].total += 1
    const agentKey = String(i.assignedAgentId || i.assignedAgentName || '').trim()
    if (!agentKey) {
      acc[team].unassigned += 1
      return acc
    }
    const label = i.assignedAgentName || String(i.assignedAgentId)
    if (!acc[team].agents[agentKey]) acc[team].agents[agentKey] = { label, count: 0 }
    acc[team].agents[agentKey].count += 1
    return acc
  }, {})
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
    { key: 'myLists', label: 'My Lists', icon: '☰' },
    { key: 'staff', label: 'Tickets by Staff', icon: '♟' },
    { key: 'team', label: 'Tickets by Team', icon: '👥' },
    { key: 'type', label: 'Tickets by Ticket Type', icon: '🎟' },
    { key: 'status', label: 'Tickets by Status', icon: 'ⓘ' },
    { key: 'all', label: 'All Tickets', icon: '⌕' },
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
      <div className="queue-search">
        <input placeholder="Search Tickets..." value={globalSearch} onChange={(e) => setGlobalSearch(e.target.value)} />
        <span className="queue-search-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
        </span>
      </div>
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
                    <div className="queue-avatar">{isExpanded ? '▼' : '▶'}</div>
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
                          <div className="queue-avatar">{getInitials(agent.label || 'A')}</div>
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
                <div className="queue-avatar">{getInitials(getAgentDisplayName(a) || 'U')}</div>
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

  const handleAccept = () => {
    if (!selectedTicket) return
    const assigneeName = getCurrentAgentName()
    const assigneeId = user?.id || assigneeName
    // optimistic local update for assignment and status
    setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: 'Acknowledged', assignedAgentId: assigneeId, assignedAgentName: assigneeName } : i))
    setSelectedTicket(prev => prev ? { ...prev, status: 'Acknowledged', assignedAgentId: assigneeId, assignedAgentName: assigneeName } : prev)
    addTicketComment(selectedTicket.id, `Accepted by ${assigneeName}`)
    // transition on backend (ignore assignment if not supported)
    ticketService.transitionTicket(selectedTicket.id, 'Acknowledged').catch((err) => {
      console.warn('Accept transition failed', err)
    })
  }

  const renderActionIcon = (label: string) => {
    const icon = actionIconMap[label]
    if (!icon) return null
    const src = `https://unpkg.com/lucide-static@latest/icons/${icon}.svg`
    return <img className="action-icon" src={src} alt="" aria-hidden="true" />
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

  const handleEmailUser = () => {
    if (!selectedTicket) return
    setEmailTo(endUser?.email || '')
    setShowEmailComposer(true)
    addTicketComment(selectedTicket.id, 'Email user action started')
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
      // ignore errors â€” kept in UI as demo
    })
  }

  const handleMarkResponded = async () => {
    if (!selectedTicket) return
    try {
      const updated = await ticketSvc.transitionTicket(selectedTicket.id, 'In Progress')
      // update UI
      setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: updated.status as any } : i))
      setSelectedTicket(prev => prev ? { ...prev, status: updated.status } : prev)
      addTicketComment(selectedTicket.id, 'Marked as responded (In Progress)')
    } catch (e) {
      // fallback: optimistic update
      setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: 'In Progress' } : i))
      setSelectedTicket(prev => prev ? { ...prev, status: 'In Progress' } : prev)
      addTicketComment(selectedTicket.id, 'Marked as responded (local)')
    }
  }

  const handleSendResponse = async () => {
    if (!selectedTicket) return
    const body = showEmailComposer ? emailBody : responseDraft
    if (!body.trim()) return alert('Please enter a message')
    try {
      await ticketService.respond(selectedTicket.id, { message: body, sendEmail: true })
      addTicketComment(selectedTicket.id, `You: ${body}`)
      setResponseDraft('')
      setEmailBody('')
      setShowEmailComposer(false)
      // mark In Progress locally
      setIncidents(prev => prev.map(i => i.id === selectedTicket.id ? { ...i, status: 'In Progress' } : i))
      setSelectedTicket(prev => prev ? { ...prev, status: 'In Progress' } : prev)
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to send response'
      alert(msg)
      addTicketComment(selectedTicket.id, `You: ${body}`)
      setResponseDraft('')
      setEmailBody('')
      setShowEmailComposer(false)
    }
  }

  const handleSaveNote = () => {
    if (!selectedTicket) return
    if (noteDraft && noteDraft.trim()) {
      addTicketComment(selectedTicket.id, noteDraft.trim())
    }
    setNoteDraft('')
    setShowNoteEditor(false)
  }

  const handleDiscardNote = () => {
    setNoteDraft('')
    setShowNoteEditor(false)
  }

  const handleLogToSupplier = () => {
    if (!selectedTicket) return
    addTicketComment(selectedTicket.id, 'Logged to supplier')
    alert('Logged to supplier (demo)')
  }

  const handleResolveTicket = () => {
    if (!selectedTicket) return
    (async () => {
      try {
        const resolution = window.prompt('Enter resolution details (e.g. Replaced battery)')
        if (!resolution) return
        const category = window.prompt('Resolution category (e.g. Hardware Replaced)', 'Hardware Replaced') || undefined
        const sendEmail = window.confirm('Send resolution email to requester?')
        const res = await ticketService.resolveTicketWithDetails(selectedTicket.id, { resolution, resolutionCategory: category, sendEmail })
        const updated = incidents.map(i => i.id === selectedTicket.id ? { ...i, status: res.status } : i)
        setIncidents(updated)
        setSelectedTicket(prev => prev ? { ...prev, status: res.status } : prev)
        addTicketComment(selectedTicket.id, `Resolved: ${resolution}`)
      } catch (err: any) {
        console.warn('Resolve transition failed', err)
        alert(err?.response?.data?.error || err?.message || 'Failed to resolve ticket')
      }
    })()
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
      if (mapTeam(incident) !== queueFilter.value) return false
    } else if (queueFilter.type === 'teamUnassigned') {
      if (mapTeam(incident) !== queueFilter.team) return false
      if (incident.assignedAgentId || incident.assignedAgentName) return false
    } else if (queueFilter.type === 'teamAgent') {
      if (mapTeam(incident) !== queueFilter.team) return false
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

  const ticketsGridTemplate = `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.endUser}px ${columnWidths.lastAction}px ${columnWidths.date}px 1fr`
  const ticketsGridStyle = { gridTemplateColumns: ticketsGridTemplate, width: '100%', minWidth: `${tableWidth}px` }

  const mainContent = showDetailView && selectedTicket ? (
    <div className="detail-view-container">
      <div className="detail-action-bar">
        <div className="action-toolbar">
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
            <div className="detail-view-card">
        <div className="progress-card">
          <div className="progress-card-header">
            <span className="progress-title">Progress</span>
            <div className="progress-actions">
              <button className="progress-icon-btn" title="View">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button className="progress-icon-btn" title="Note" onClick={() => setShowNoteEditor(true)}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h12l4 4v12H4z"/><path d="M14 4v4h4"/></svg>
              </button>
              <button className="progress-icon-btn" title="Scroll">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M7 14l5 5 5-5"/></svg>
              </button>
            </div>
          </div>
          <div className="progress-list">
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
                return (
              <div key={`${c.time}-${idx}`} className="progress-item">
                <div className="progress-avatar">{getInitials(authorName)}</div>
                <div className="progress-body">
                  <div className="progress-meta">
                    <div className="progress-author">{authorName || 'Unknown'}</div>
                    <div className="progress-time">{c.time}</div>
                  </div>
                  <div className="progress-text">{c.text}</div>
                </div>
              </div>
            )})}
            {(!ticketComments[selectedTicket.id] || ticketComments[selectedTicket.id].length === 0) && (
              <div className="progress-item">
                <div className="progress-avatar">EU</div>
                <div className="progress-body">
                  <div className="progress-meta">
                    <div className="progress-author">End User</div>
                    <div className="progress-time">{selectedTicket.dateReported}</div>
                  </div>
                  <div className="progress-text">{selectedTicket.subject}</div>
                </div>
              </div>
            )}
          </div>
        </div>
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
              <div className="sla-card">
                <h3 className="sidebar-title">Service Level Agreement</h3>
                <div className="sla-pill">
                  <span>Incident SLA</span>
                  <span>Medium</span>
                </div>
                <div className="sla-bar">
                  <span>-119:45</span>
                </div>
                <div className="sla-row">
                  <span>Response Target</span>
                  <span>1/16/2026 15:14</span>
                  <span className="sla-x">âœ–</span>
                </div>
                <div className="sla-row">
                  <span>Resolution Target</span>
                  <span>1/19/2026 09:14</span>
                  <span className="sla-x">âœ–</span>
                </div>
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
      </div>{showEmailComposer && (
        <div className="modal-overlay" onClick={() => setShowEmailComposer(false)}>
          <div className="modal-content email-modal" onClick={(e) => e.stopPropagation()}>
            <div className="email-header">
              <div>
                <div className="email-title">Girikumaran M S</div>
                <div className="email-subtitle">Reply</div>
              </div>
              <button className="modal-close" onClick={() => setShowEmailComposer(false)}>x</button>
            </div>
            <div className="email-row">
              <label>To</label>
              <input className="email-to" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="email-toolbar">
              <button>AI</button>
              <button>B</button>
              <button>I</button>
              <button>U</button>
              <button>â€¢</button>
              <button>1.</button>
              <button>"</button>
              <button>@</button>
              <button>+</button>
            </div>
            <textarea className="email-body" placeholder="Type your update/note here" value={emailBody} onChange={(e) => setEmailBody(e.target.value)} />
            <div className="email-row">
              <label>Status</label>
              <select className="email-status" value={emailStatus} onChange={(e) => setEmailStatus(e.target.value)}>
                <option>With Customer</option>
                <option>In Progress</option>
                <option>Closed</option>
              </select>
            </div>
            <div className="email-actions">
              <button className="btn-submit" onClick={handleSendResponse}>Send</button>
              <button className="btn-cancel" onClick={() => setShowEmailComposer(false)}>Discard</button>
            </div>
          </div>
        </div>
      )}
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
              <button className="modal-close" onClick={() => setShowNewIncidentModal(false)}>âœ•</button>
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
                    <span className="dropdown-arrow">â–¼</span>
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
                                  {expandedCategories.includes(category) ? 'â–¼' : 'â–¶'}
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
                                          {expandedCategories.includes(`${category}>${subcat}`) ? 'â–¼' : 'â–¶'}
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



















