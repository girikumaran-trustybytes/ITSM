import React, { useState } from 'react'
import * as ticketService from '../services/ticket.service'
import * as ticketSvc from '../services/ticket.service'

export type Incident = {
  id: string
  slaTimeLeft: string
  subject: string
  category: string
  priority: 'Low' | 'Medium' | 'High'
  status: 'Re-Opened' | 'New' | 'Rejected' | 'Approved' | 'Awaiting Ap' | 'Awaiting Approval' | 'In Progress' | 'Draft' | 'Updated' | 'With Vender' | 'With HR' | 'With User' | 'Closed'
  type: string
  dateReported: string
  lastAction: string
  lastActionTime: string
}

export default function TicketsView() {
  const [incidents, setIncidents] = useState<Incident[]>([
    {
      id: '#002998',
      slaTimeLeft: '00:00',
      subject: 'Keyboard and mouse unresponsive',
      category: 'Hardware>Mouse/Keyboard',
      priority: 'Medium',
      status: 'In Progress',
      type: 'Incident',
      dateReported: '1/6/2026 4:16 AM',
      lastAction: 'Assigned',
      lastActionTime: '1/6/2026 4:20 AM'
    },
    {
      id: '#002997',
      slaTimeLeft: '00:00',
      subject: 'Blue screen error after login',
      category: 'Hardware>Monitor',
      priority: 'High',
      status: 'Awaiting Approval',
      type: 'Incident',
      dateReported: '1/6/2026 4:16 AM',
      lastAction: 'Escalated',
      lastActionTime: '1/6/2026 4:25 AM'
    },
    {
      id: '#002996',
      slaTimeLeft: '00:00',
      subject: 'Frequent Wi-Fi disconnections',
      category: 'Network>Connectivity',
      priority: 'Low',
      status: 'Closed',
      type: 'Incident',
      dateReported: '1/6/2026 4:16 AM',
      lastAction: 'Resolved',
      lastActionTime: '1/6/2026 4:30 AM'
    },
    {
      id: '#002995',
      slaTimeLeft: '00:00',
      subject: 'Email attachments not opening',
      category: 'Software>Email',
      priority: 'Medium',
      status: 'With Vender',
      type: 'Incident',
      dateReported: '1/6/2026 4:16 AM',
      lastAction: 'Pending Review',
      lastActionTime: '1/6/2026 4:22 AM'
    },
    {
      id: '#002994',
      slaTimeLeft: '00:00',
      subject: 'PC stuck on Windows loading screen',
      category: 'Hardware>Desktop',
      priority: 'High',
      status: 'New',
      type: 'Incident',
      dateReported: '1/6/2026 4:16 AM',
      lastAction: 'Created',
      lastActionTime: '1/6/2026 4:16 AM'
    },
    {
      id: '#002937',
      slaTimeLeft: '-176:00',
      subject: 'Printer Display Error',
      category: 'Hardware>Printer',
      priority: 'Low',
      status: 'Awaiting Approval',
      type: 'Incident',
      dateReported: '12/2/2025 3:55 AM',
      lastAction: 'Awaiting Approval',
      lastActionTime: '12/2/2025 4:00 AM'
    }
  ])
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
  const [newIncidentForm, setNewIncidentForm] = useState({
    ticketType: '',
    subject: '',
    category: '',
    priority: '' as const,
    description: ''
  })

  // Try to hydrate from backend tickets API if available
  React.useEffect(() => {
    import('../services/ticket.service').then(svc => {
      svc.listTickets().then((data: any) => {
        if (Array.isArray(data) && data.length > 0) {
          const mapped = data.map((t: any) => ({
            id: t.id,
            slaTimeLeft: '00:00',
            subject: t.subject,
            category: t.category || '',
            priority: t.priority || 'Low',
            status: t.status,
            type: t.type,
            dateReported: new Date(t.createdAt).toLocaleString(),
            lastAction: '',
            lastActionTime: ''
          }))
          setIncidents(mapped)
        }
      }).catch(() => {
        // backend unavailable -> keep demo state
      })
    })
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
    lastAction: 150,
    date: 140
  }
  const colsCount = Object.keys(baseColWidths).length
  const gapTotal = (colsCount - 1) * 12 // match CSS grid gap
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

    const newId = '#' + String(parseInt(incidents[0].id.slice(1)) + 1).padStart(6, '0')
    const newIncident: Incident = {
      id: newId,
      slaTimeLeft: '00:00',
      subject: newIncidentForm.subject,
      category: newIncidentForm.category,
      priority: (newIncidentForm.priority || 'Low') as Incident['priority'],
      status: 'New',
      type: newIncidentForm.ticketType,
      dateReported: new Date().toLocaleString('en-US', { 
        month: 'numeric', 
        day: 'numeric', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit',
        hour12: true 
      }),
      lastAction: 'Created',
      lastActionTime: new Date().toLocaleString()
    }

    setIncidents([newIncident, ...incidents])
    setShowNewIncidentModal(false)
    setNewIncidentForm({
      ticketType: '',
      subject: '',
      category: '',
      priority: '',
      description: ''
    })
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

  const addTicketComment = (ticketId: string, text: string) => {
    const now = new Date().toLocaleString()
    setTicketComments(prev => ({
      ...prev,
      [ticketId]: [ ...(prev[ticketId] || []), { author: 'Admin (You)', text, time: now } ]
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

  const handleEmailUser = () => {
    if (!selectedTicket) return
    const subject = encodeURIComponent(`[${selectedTicket.id}] ${selectedTicket.subject}`)
    window.open(`mailto:admin@example.com?subject=${subject}`)
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
    // try to persist to backend
    ticketSvc.createHistory(selectedTicket.id, { note }).catch(() => {
      // ignore errors — kept in UI as demo
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
        const res = await ticketService.transitionTicket(selectedTicket.id, 'Closed')
        const updated = incidents.map(i => i.id === selectedTicket.id ? { ...i, status: res.status } : i)
        setIncidents(updated)
        setSelectedTicket(prev => prev ? { ...prev, status: res.status } : prev)
        addTicketComment(selectedTicket.id, 'Ticket resolved/closed')
      } catch (err: any) {
        console.warn('Resolve transition failed', err)
        alert(err?.response?.data?.error || err?.message || 'Failed to resolve ticket')
      }
    })()
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

  const mainContent = showDetailView && selectedTicket ? (
    <div className="detail-view-container">
      <button className="detail-back-button" onClick={() => setShowDetailView(false)}>← Back</button>
      <div className="detail-action-bar">
        <div className="action-toolbar">
          <button className="pill-btn triage" onClick={handleTriage}>● Triage</button>
          <button className="pill-btn email" onClick={handleEmailUser}>✉ Email User</button>
          <button className="pill-btn add-note" onClick={handleAddNote}>📝 Add Note</button>
          <button className="pill-btn supplier" onClick={handleLogToSupplier}>📦 Log to Supplier</button>
          <button className="pill-btn" onClick={handleMarkResponded}>⮞ Mark Responded</button>
          <button className="pill-btn resolve" onClick={handleResolveTicket}>✔ Resolve Ticket</button>
        </div>
      </div>
      <div className="detail-main">
        <div className="ticket-header">
          <div className="ticket-icon">✓</div>
          <div className="ticket-title">
            <h2>[{selectedTicket.id}]</h2>
            <p>{selectedTicket.subject}</p>
          </div>
        </div>
        {showNoteEditor && (
          <div className="note-editor">
            <div className="note-toolbar">
              <button title="Bold">B</button>
              <button title="Italic">I</button>
              <button title="Bulleted">•</button>
              <button title="Numbered">1.</button>
              <button title="Quote">"</button>
              <button title="Link">🔗</button>
              <button title="Image">🖼</button>
            </div>
            <textarea
              className="note-textarea"
              placeholder="Enter your note here"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
            />
            <div className="note-meta">
              <div className="note-field">
                <label>Status</label>
                <select>
                  <option>Awaiting Approval</option>
                  <option>In Progress</option>
                  <option>Closed</option>
                </select>
              </div>
              <div className="note-field">
                <label>Time Taken</label>
                <div className="time-inputs">
                  <input type="number" min="0" max="99" defaultValue={0} />
                  <span>:</span>
                  <input type="number" min="0" max="59" defaultValue={0} />
                </div>
              </div>
            </div>
            <div className="note-actions">
              <button className="note-btn save" onClick={handleSaveNote}>Save</button>
              <button className="note-btn discard" onClick={handleDiscardNote}>Discard</button>
            </div>
          </div>
        )}
        <div className="detail-sidebar">
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
            <div className="sidebar-field assigned-field">
              <div className="assigned-label">Assigned Agent</div>
              <div className="assigned-agent">
                <div className="agent-avatar">JW</div>
                <div className="agent-info">
                  <span className="agent-name">Jennifer Williams</span>
                  <span className="agent-team">1st Line Support</span>
                </div>
              </div>
            </div>
            <div className="sidebar-field">
              <label>Additional Agents</label>
              <span>Not set</span>
            </div>
            <div className="sidebar-field">
              <label>Time Recorded</label>
              <span>00:00</span>
            </div>
            <div className="sidebar-field">
              <label>Source</label>
              <span>Manual</span>
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
              <label>Account Manager</label>
              <span>{endUser?.accountManager || 'Not set'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="message-button" onClick={handleOpenGChat}>Message Directly on GChat</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : (
    <div className="incidents-table" style={{ width: tableWidth ? `${tableWidth}px` : undefined }}>
      <div className="table-header" style={{
        gridTemplateColumns: `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.lastAction}px ${columnWidths.date}px`
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
      </div>
      {showSearchBar && (
        <div
          className="table-search-bar"
          style={{
            gridTemplateColumns: `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.lastAction}px ${columnWidths.date}px`
          }}
        >
          <button
            className="search-close-btn"
            onClick={() => {
              clearColumnFilters()
              setShowSearchBar(false)
            }}
          >✕</button>
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
        </div>
      )}
      <div className="table-body">
        {filteredIncidents.map((incident) => (
          <div key={incident.id} className="table-row" style={{
            gridTemplateColumns: `${columnWidths.checkbox}px ${columnWidths.status}px ${columnWidths.id}px ${columnWidths.summary}px ${columnWidths.category}px ${columnWidths.priority}px ${columnWidths.type}px ${columnWidths.lastAction}px ${columnWidths.date}px`
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
            <div className="col-date">{incident.dateReported}</div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="tickets-view">
      <div className="tickets-header">
        <div className="tickets-header-left">
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
          <div className="global-search">
            <input 
              type="text" 
              placeholder="Search..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGlobalSearch()}
            />
            <span className="search-icon" onClick={handleGlobalSearch}>🔍</span>
          </div>
        </div>
        <div className="tickets-actions">
          <span className="pagination">{rangeStart}-{rangeEnd} of {totalTickets}</span>
          <button className="filter-icon-button" onClick={() => setShowSearchBar(!showSearchBar)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </button>
          <button className="new-button" onClick={() => setShowNewIncidentModal(true)}>+ New</button>
        </div>
      </div>

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
