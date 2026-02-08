import React, { useState } from 'react'
import { createPortal } from 'react-dom'
import * as ticketService from '../services/ticket.service'
import * as ticketSvc from '../services/ticket.service'
import * as assetService from '../services/asset.service'
import * as userService from '../services/user.service'
import { useAuth } from '../contexts/AuthContext'

export type Incident = {
  id: string
  slaTimeLeft: string
  subject: string
  category: string
  priority: 'Low' | 'Medium' | 'High'
  status: 'Re-Opened' | 'New' | 'Rejected' | 'Approved' | 'Awaiting Ap' | 'Awaiting Approval' | 'In Progress' | 'Draft' | 'Updated' | 'With Vender' | 'With HR' | 'With User' | 'Closed'
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
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('queue-sidebar-root') : null
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [filterType, setFilterType] = useState('Open Tickets')
  const [showFilterMenu, setShowFilterMenu] = useState(false)
  const [showSearchBar, setShowSearchBar] = useState(false)
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
  const [newIncidentForm, setNewIncidentForm] = useState({
    ticketType: 'Fault',
    subject: '',
    category: '',
    priority: '' as const,
    description: ''
  })

  // Try to hydrate from backend tickets API if available
  React.useEffect(() => {
    import('../services/ticket.service').then(svc => {
      svc.listTickets().then((data: any) => {
        // API returns { items: [...], total: number, page: number, pageSize: number }
        const items = Array.isArray(data) ? data : (data?.items || [])
        if (items && items.length > 0) {
          const mapped = items.map((t: any) => ({
            id: t.ticketId || String(t.id),
            slaTimeLeft: '00:00',
            subject: t.subject || t.description || '',
            category: t.category || '',
            priority: t.priority || 'Low',
            status: t.status,
            type: t.type,
            endUser: t.requester?.name || t.requester?.email || '',
            dateReported: new Date(t.createdAt).toLocaleString(),
            lastAction: '',
            lastActionTime: '',
            assignedAgentId: t.assignedTo?.id || t.assignee?.id,
            assignedAgentName: t.assignedTo?.name || t.assignee?.name
          }))
          setIncidents(mapped)
        }
      }).catch((err) => {
        // backend unavailable -> keep demo state
        console.warn('Failed to fetch tickets:', err)
      })
    })
  }, [])

  React.useEffect(() => {
    if (showDetailView) {
      loadAssetsForTicket('')
    }
  }, [showDetailView])

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
    const handler = () => setShowNewIncidentModal(true)
    window.addEventListener('open-new-ticket', handler as EventListener)
    return () => window.removeEventListener('open-new-ticket', handler as EventListener)
  }, [])

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
  const [resizingNeighbor, setResizingNeighbor] = useState<string | null>(null)
  const [resizeStartX, setResizeStartX] = useState(0)

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
          requesterId: undefined,
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
      } catch (e) {
        alert('Failed to create ticket â€” offline demo fallback will be used')
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

  const getActionButtons = () => {
    if (!selectedTicket) return []
    if (!isIncidentOrFault(selectedTicket.type)) return []
    if (user?.role === 'USER') {
      return [{ label: 'Back', onClick: () => setShowDetailView(false) }]
    }

    const status = (selectedTicket.status || '').toLowerCase()
    const buttons: { label: string; onClick: () => void; className?: string }[] = []

    // Always include back
    buttons.push({ label: 'Back', onClick: () => setShowDetailView(false) })

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

    if (status === 'waiting for vendor') {
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
      buttons.push({ label: 'Log to Supplier', onClick: () => applyStatus('Waiting for Vendor', 'Logged to supplier') })
      buttons.push({ label: 'Recall to Approval', onClick: () => applyStatus('In Progress', 'Recall to approval') })
      buttons.push({ label: 'Re-assign', onClick: () => addTicketComment(selectedTicket.id, 'Re-assign') })
      buttons.push({ label: 'Resolve', onClick: () => applyStatus('Resolved', 'Resolved') })
      buttons.push({ label: 'Close', onClick: () => applyStatus('Closed', 'Closed') })
      return buttons
    }

    // In Progress / Re-Opened / other
    buttons.push({ label: 'Email User', onClick: handleEmailUser })
    buttons.push({ label: 'Internal note', onClick: handleAddNote })
    buttons.push({ label: 'Log to Supplier', onClick: () => applyStatus('Waiting for Vendor', 'Logged to supplier') })
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

  const getInitials = (name: string) => {
    const safe = String(name || '').trim()
    if (!safe) return 'NA'
    const parts = safe.split(' ').filter(Boolean)
    if (parts.length === 0) return 'NA'
    return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
  }

  const isOpenStatus = (status: string) => {
    const s = (status || '').toLowerCase()
    return s !== 'closed' && s !== 'resolved'
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
    } catch (e) {
      alert('Failed to send response (offline demo fallback)')
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
      setShowDetailView(false)
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

    return true
  })

  const handleGlobalSearch = () => {
    // Search is already being filtered in real-time via filteredIncidents
    // This function is called on Enter key or icon click
    console.log('Searching for:', globalSearch)
  }

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    // Column order used for resizing logic (status moved after checkbox)
    const order = ['checkbox','status','id','subject','category','priority','type','lastAction','date']
    const idx = order.indexOf(column)
    // Disable resizing of the checkbox column
    if (column === 'checkbox') return
    // We only want to resize the current column without affecting neighbors
    setResizingColumn(column)
    setResizingNeighbor(null)
    setResizeStartX(e.clientX)
  }

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingColumn) return

      const diff = e.clientX - resizeStartX
      setColumnWidths(prev => {
        const newWidths = { ...prev }
        const maxWidth = 2000

        // Only adjust the current column; do not modify neighbors
        const colKey = resizingColumn as keyof typeof prev
        const currentVal = prev[colKey] as number

        let newCurrent = currentVal + diff
        // apply per-column min width if available
        const minWidth = (columnMinWidths as any)[colKey] ?? 50
        // snap to defined step
        newCurrent = Math.round(newCurrent / widthSnap) * widthSnap
        newCurrent = Math.max(minWidth, Math.min(maxWidth, newCurrent))
        newWidths[colKey] = newCurrent as any

        // compute total needed width (sum of all column pixel widths + gaps + padding)
        const cols = Object.keys(newWidths).length
        const gapTotal = (cols - 1) * 12 // grid gap from CSS
        const paddingHorizontal = 32 // approx table header padding (16px left + 16px right)
        const sumCols = Object.values(newWidths).reduce((s, v) => s + (v as number), 0)
        const totalNeeded = sumCols + gapTotal + paddingHorizontal

        setTableWidth(prevTable => Math.max(prevTable, Math.ceil(totalNeeded)))

        return newWidths
      })
      setResizeStartX(e.clientX)
    }

    const handleMouseUp = () => {
      setResizingColumn(null)
      setResizingNeighbor(null)
    }

    if (resizingColumn) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [resizingColumn, resizeStartX])

  // Ticket counts responsive to current filters and category/search
  const filteredCount = filteredIncidents.length
  // make total count reflect current filter/category (responsive)
  const totalTickets = filteredCount
  const rangeStart = filteredCount > 0 ? 1 : 0
  const rangeEnd = filteredCount
  const openIncidents = incidents.filter((i) => isOpenStatus(i.status))
  const countUnassigned = openIncidents.filter((i) => !i.assignedAgentId && !i.assignedAgentName).length
  const countWithSupplier = openIncidents.filter((i) => {
    const s = (i.status || '').toLowerCase()
    return s.includes('supplier') || s.includes('vendor')
  }).length

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
      {!queueCollapsed && queueRoot && createPortal(
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
          <div className="queue-title">
            <span className="queue-title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8h12M6 12h12M6 16h12" />
              </svg>
            </span>
            <div>
              <div className="queue-title-text">Tickets Queue</div>
            </div>
          </div>
          {!queueCollapsed && (
            <button
              className="queue-collapse-btn"
              title="Hide Menu"
              onClick={() => setQueueCollapsed(true)}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </div>
        <div className="queue-list">
          <div className="queue-item">
            <div className="queue-avatar queue-avatar-dark">U</div>
            <div className="queue-name">Unassigned</div>
            <div className="queue-count">{countUnassigned}</div>
          </div>
          {agents.map((a) => (
            <div key={`agent-${a.id}`} className="queue-item">
              <div className="queue-avatar">{getInitials(a.name || a.email || 'U')}</div>
              <div className="queue-name">{a.name || a.email}</div>
              <div className="queue-count">
                {openIncidents.filter((i) => {
                  const byId = String(i.assignedAgentId || '') === String(a.id)
                  const byName = i.assignedAgentName && a.name && i.assignedAgentName === a.name
                  return byId || byName
                }).length}
              </div>
            </div>
          ))}
          <div className="queue-item">
            <div className="queue-avatar queue-avatar-accent">S</div>
            <div className="queue-name">With Supplier</div>
            <div className="queue-count">{countWithSupplier}</div>
          </div>
        </div>
      </aside>,
      queueRoot
      )}
      <div className="tickets-main">
        <div className="tickets-table-bar">
          <div className="tickets-table-left">
            <button
              className="table-icon-btn"
              title={queueCollapsed ? 'Show Menu' : 'Hide Menu'}
              onClick={() => setQueueCollapsed(!queueCollapsed)}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="5" cy="12" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
              </svg>
            </button>
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
            {queueCollapsed && (
              <div className="global-search">
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
            )}
          </div>
          <div className="tickets-table-right">
            <span className="pagination">{rangeStart}-{rangeEnd} of {totalTickets}</span>
            <button className="table-primary-btn" onClick={() => setShowNewIncidentModal(true)}>+ New</button>
            <button className="table-icon-btn" title="Filter">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className="tickets-content">
        <div className="incidents-table" style={{ width: tableWidth ? `${tableWidth}px` : undefined }}>
          <div className="table-header" style={{
            gridTemplateColumns: `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.lastAction}px ${columnWidths.date}px ${columnWidths.endUser}px`
          }}>
        <div className="col-header col-checkbox">
          <input type="checkbox" checked={selectAll} onChange={handleSelectAll} />
          <div className="col-resize-handle"></div>
        </div>
        <div className="col-header col-status">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'checkbox')}></div>
          Status
        </div>
        <div className="col-header col-id">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'status')}></div>
          ID
        </div>
        <div className="col-header col-subject">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'id')}></div>
          Subject
        </div>
        <div className="col-header col-category">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'subject')}></div>
          Category
        </div>
        <div className="col-header col-priority">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'category')}></div>
          Priority
        </div>
        <div className="col-header col-type">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'priority')}></div>
          Type
        </div>
        <div className="col-header col-lastAction">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'type')}></div>
          Last Action
        </div>
        <div className="col-header col-date">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'lastAction')}></div>
          Date Reported
        </div>
        <div className="col-header col-endUser">
          <div className="col-resize-handle" onMouseDown={(e) => handleMouseDown(e, 'date')}></div>
          End User
        </div>
      </div>
      {showSearchBar && (
        <div
          className="table-search-bar"
          style={{
            gridTemplateColumns: `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.lastAction}px ${columnWidths.date}px ${columnWidths.endUser}px`
          }}
        >
          <button
            className="search-close-btn"
            onClick={() => {
              clearColumnFilters()
              setShowSearchBar(false)
            }}
          >âœ•</button>
          <input
            type="text"
            placeholder=""
            className="col-status"
            value={searchValues.status}
            onChange={(e) => handleSearchChange('status', e.target.value)}
          />
          <input type="text" placeholder="" className="col-id" value={searchValues.id} onChange={(e) => handleSearchChange('id', e.target.value)} />
          <input type="text" placeholder="" className="col-subject" value={searchValues.subject} onChange={(e) => handleSearchChange('subject', e.target.value)} />
          <input type="text" placeholder="" className="col-category" value={searchValues.category} onChange={(e) => handleSearchChange('category', e.target.value)} />
          <input type="text" placeholder="" className="col-priority" value={searchValues.priority} onChange={(e) => handleSearchChange('priority', e.target.value)} />
          <input type="text" placeholder="" className="col-type" value={searchValues.type} onChange={(e) => handleSearchChange('type', e.target.value)} />
          <input type="text" placeholder="" className="col-lastAction" value={searchValues.lastAction} onChange={(e) => handleSearchChange('lastAction', e.target.value)} />
          <input type="text" placeholder="" className="col-date" value={searchValues.dateReported} onChange={(e) => handleSearchChange('dateReported', e.target.value)} />
          <input type="text" placeholder="" className="col-endUser" value={searchValues.endUser} onChange={(e) => handleSearchChange('endUser', e.target.value)} />
        </div>
      )}
      <div className="table-body">
        {filteredIncidents.map((incident) => (
          <div key={incident.id} className="table-row" style={{
            gridTemplateColumns: `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.lastAction}px ${columnWidths.date}px ${columnWidths.endUser}px`
          }} onClick={() => handleTicketClick(incident)}>
            <div className="col-checkbox" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedTickets.includes(incident.id)} onChange={() => handleSelectTicket(incident.id)} /></div>
            <div className="col-status">
              <span className={`status-badge ${statusClass(incident.status)}`}>{incident.status}</span>
            </div>
            <div className="col-id">{incident.id}</div>
            <div className="col-summary">
              <a href="#" onClick={(e) => e.preventDefault()}>{incident.subject}</a>
            </div>
            <div className="col-category">{incident.category}</div>
            <div className="col-priority">
              <span className={`priority-badge ${incident.priority.toLowerCase()}`}>{incident.priority}</span>
            </div>
            <div className="col-type">{incident.type}</div>
            <div className="col-lastAction">
              <span className="last-action-time">{incident.lastActionTime}</span>
            </div>
<div className="col-date">{incident.dateReported}</div>            <div className="col-endUser">{incident.endUser || 'â€”'}</div>
            
          </div>
        ))}
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="tickets-view">
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












