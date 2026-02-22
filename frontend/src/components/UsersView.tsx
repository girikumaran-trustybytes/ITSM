import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as userService from '../modules/users/services/user.service'
import { useColumnResize } from '../hooks/useColumnResize'
import { getRowsPerPage } from '../utils/pagination'
import { loadLeftPanelConfig, type QueueRule } from '../utils/leftPanelConfig'

type UserRow = {
  id: number
  name?: string | null
  email: string
  personalEmail?: string | null
  workEmail?: string | null
  phone?: string | null
  employeeId?: string | null
  designation?: string | null
  department?: string | null
  reportingManager?: string | null
  dateOfJoining?: string | null
  employmentType?: string | null
  workMode?: string | null
  role: 'ADMIN' | 'AGENT' | 'USER'
  status?: string | null
  createdAt?: string
}

const viewTabs = ['Table', 'Board'] as const

function getInitials(name: string) {
  const safe = String(name || '').trim()
  if (!safe) return 'NA'
  const parts = safe.split(' ').filter(Boolean)
  return parts.slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

function formatDate(value?: string) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleString()
}

type UsersPaginationMeta = {
  page: number
  totalPages: number
  totalRows: number
  rangeStart: number
  rangeEnd: number
}

type UsersViewProps = {
  toolbarSearch?: string
  controlledPage?: number
  onPageChange?: (nextPage: number) => void
  onPaginationMetaChange?: (meta: UsersPaginationMeta) => void
}

export default function UsersView({
  toolbarSearch = '',
  controlledPage,
  onPageChange,
  onPaginationMetaChange,
}: UsersViewProps) {
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [activeView, setActiveView] = useState<typeof viewTabs[number]>('Table')
  const [search, setSearch] = useState(toolbarSearch)
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [internalPage, setInternalPage] = useState(1)
  const rowsPerPage = getRowsPerPage()
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [panelRules, setPanelRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().users)
  const [userQueueView, setUserQueueView] = useState<'allUsers' | 'byProject'>('allUsers')
  const [showUserViewSelector, setShowUserViewSelector] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)
  const [selectedProject, setSelectedProject] = useState('all')
  const [filters, setFilters] = useState({
    name: '',
    personalEmail: '',
    phone: '',
    employeeId: '',
    workEmail: '',
    designation: '',
    department: '',
    manager: '',
    dateOfJoining: '',
    employmentType: '',
    workMode: '',
  })
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const exportMenuRef = useRef<HTMLDivElement | null>(null)
  const [newUser, setNewUser] = useState({
    name: '',
    personalEmail: '',
    workEmail: '',
    phone: '',
    employeeId: '',
    department: '',
    manager: '',
    dateOfJoining: '',
    employmentType: 'Full-time',
    workMode: 'Onsite',
    designation: '',
  })
  const { widths: colWidths, startResize } = useColumnResize({
    initialWidths: [30, 180, 160, 120, 120, 180, 140, 160, 160, 140, 140, 120, 90],
    minWidth: 0,
  })

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await userService.listUsers({ q: search || undefined })
      const list = Array.isArray(data) ? data : []
      setUsers(list)
    } catch (e) {
      console.warn('Failed to fetch users', e)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [search, refreshTick])

  useEffect(() => {
    setSearch(toolbarSearch)
  }, [toolbarSearch])

  useEffect(() => {
    const expandedCls = 'users-queue-expanded'
    const collapsedCls = 'users-queue-collapsed'
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
    document.body.classList.add('users-view-active')
    return () => document.body.classList.remove('users-view-active')
  }, [])
  useEffect(() => {
    const handler = () => setPanelRules(loadLeftPanelConfig().users)
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'users') return
      if (detail.action === 'new') {
        setEditingUser(null)
        setShowAddModal(true)
      }
      if (detail.action === 'filter') {
        setShowFilters((v) => !v)
      }
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
      if (!detail || detail.target !== 'users') return
      if (detail.action === 'toggle-left-panel') {
        setLeftPanelCollapsed((v) => !v)
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])

  const handleCreateUser = async () => {
    if (!newUser.name.trim()) {
      alert('Full Name is required.')
      return
    }
    if (!newUser.workEmail.trim() && !newUser.personalEmail.trim()) {
      alert('Work Email or Personal Email is required.')
      return
    }
    setIsSaving(true)
    try {
      const workEmail = newUser.workEmail.trim()
      const personalEmail = newUser.personalEmail.trim()
      await userService.createUser({
        name: newUser.name.trim() || undefined,
        email: workEmail || personalEmail,
        personalEmail: personalEmail || undefined,
        workEmail: workEmail || undefined,
        phone: newUser.phone.trim() || undefined,
        employeeId: newUser.employeeId.trim() || undefined,
        department: newUser.department.trim() || undefined,
        reportingManager: newUser.manager.trim() || undefined,
        dateOfJoining: newUser.dateOfJoining || undefined,
        employmentType: newUser.employmentType,
        workMode: newUser.workMode,
        designation: newUser.designation.trim() || undefined,
        role: 'USER',
      })
      setShowAddModal(false)
      setNewUser({
        name: '',
        personalEmail: '',
        workEmail: '',
        phone: '',
        employeeId: '',
        department: '',
        manager: '',
        dateOfJoining: '',
        employmentType: 'Full-time',
        workMode: 'Onsite',
        designation: '',
      })
      await loadUsers()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to create user')
    } finally {
      setIsSaving(false)
    }
  }

  const openEdit = (u: UserRow) => {
    setEditingUser(u)
    setNewUser({
      name: u.name || '',
      personalEmail: u.personalEmail || '',
      workEmail: u.workEmail || u.email || '',
      phone: u.phone || '',
      employeeId: u.employeeId || '',
      department: u.department || '',
      manager: u.reportingManager || '',
      dateOfJoining: u.dateOfJoining ? String(u.dateOfJoining).slice(0, 10) : '',
      employmentType: u.employmentType || 'Full-time',
      workMode: u.workMode || 'Onsite',
      designation: u.designation || '',
    })
    setShowAddModal(true)
  }

  const handleUpdateUser = async () => {
    if (!editingUser) return
    if (!newUser.name.trim()) {
      alert('Full Name is required.')
      return
    }
    if (!newUser.workEmail.trim() && !newUser.personalEmail.trim()) {
      alert('Work Email or Personal Email is required.')
      return
    }
    setIsSaving(true)
    try {
      const workEmail = newUser.workEmail.trim()
      const personalEmail = newUser.personalEmail.trim()
      const updated = await userService.updateUser(editingUser.id, {
        name: newUser.name.trim() || undefined,
        email: workEmail || personalEmail,
        personalEmail: personalEmail || undefined,
        workEmail: workEmail || undefined,
        phone: newUser.phone.trim() || undefined,
        employeeId: newUser.employeeId.trim() || undefined,
        department: newUser.department.trim() || undefined,
        reportingManager: newUser.manager.trim() || undefined,
        dateOfJoining: newUser.dateOfJoining || undefined,
        employmentType: newUser.employmentType,
        workMode: newUser.workMode,
        designation: newUser.designation.trim() || undefined,
      })
      setUsers((prev) =>
        prev.map((u) => (u.id === editingUser.id ? { ...u, ...updated, email: updated?.email || workEmail || personalEmail } : u))
      )
      setShowAddModal(false)
      setEditingUser(null)
      setNewUser({
        name: '',
        personalEmail: '',
        workEmail: '',
        phone: '',
        employeeId: '',
        department: '',
        manager: '',
        dateOfJoining: '',
        employmentType: 'Full-time',
        workMode: 'Onsite',
        designation: '',
      })
      await loadUsers()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to update user')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteUser = async (u: UserRow) => {
    const label = u.name || u.email || 'this user'
    if (!window.confirm(`Delete ${label}?`)) return
    setIsSaving(true)
    try {
      await userService.deleteUser(u.id)
      setUsers((prev) => prev.filter((row) => row.id !== u.id))
      setSelectedIds((prev) => prev.filter((id) => id !== u.id))
      await loadUsers()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to delete user')
    } finally {
      setIsSaving(false)
    }
  }

  const filtered = useMemo(() => {
    const match = (value: string | undefined | null, q: string) =>
      String(value || '').toLowerCase().includes(q.toLowerCase())
    return users.filter((u) => {
      if (userQueueView === 'byProject' && selectedProject !== 'all') {
        if (String(u.department || '').toLowerCase() !== selectedProject.toLowerCase()) return false
      }
      if (filters.name && !match(u.name, filters.name) && !match(u.email, filters.name)) return false
      if (filters.personalEmail && !match(u.personalEmail, filters.personalEmail)) return false
      if (filters.phone && !match(u.phone, filters.phone)) return false
      if (filters.employeeId && !match(u.employeeId, filters.employeeId)) return false
      if (filters.workEmail && !match(u.workEmail || u.email, filters.workEmail)) return false
      if (filters.designation && !match(u.designation, filters.designation)) return false
      if (filters.department && !match(u.department, filters.department)) return false
      if (filters.manager && !match(u.reportingManager, filters.manager)) return false
      if (filters.dateOfJoining && !match(u.dateOfJoining ? formatDate(u.dateOfJoining) : '', filters.dateOfJoining)) return false
      if (filters.employmentType && !match(u.employmentType, filters.employmentType)) return false
      if (filters.workMode && !match(u.workMode, filters.workMode)) return false
      return true
    })
  }, [users, filters, userQueueView, selectedProject])
  const currentPage = controlledPage ?? internalPage
  const setPage = (next: number | ((prev: number) => number)) => {
    const resolved = typeof next === 'function' ? next(currentPage) : next
    if (typeof controlledPage === 'number') {
      onPageChange?.(resolved)
      return
    }
    setInternalPage(resolved)
  }
  const totalRows = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * rowsPerPage
  const pageItems = filtered.slice(pageStart, pageStart + rowsPerPage)
  const pageIds = pageItems.map((u) => u.id)
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id))
  const userVisuals = useMemo(() => {
    const totalCount = users.length
    const byEmployment = users.reduce<Record<string, number>>((acc, u) => {
      const key = u.employmentType || 'Unspecified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    const byWorkMode = users.reduce<Record<string, number>>((acc, u) => {
      const key = u.workMode || 'Unspecified'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    return {
      totalCount,
      employment: Object.entries(byEmployment),
      workMode: Object.entries(byWorkMode),
    }
  }, [users])

  useEffect(() => {
    if (currentPage !== safePage) setPage(safePage)
  }, [safePage, currentPage])

  useEffect(() => {
    onPaginationMetaChange?.({
      page: safePage,
      totalPages,
      totalRows,
      rangeStart: totalRows === 0 ? 0 : pageStart + 1,
      rangeEnd: Math.min(pageStart + rowsPerPage, totalRows),
    })
  }, [safePage, totalPages, totalRows, pageStart, onPaginationMetaChange])

  useEffect(() => {
    if (!showExportMenu) return
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setShowExportMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showExportMenu])

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])))
    }
  }

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const exportFields = [
    { key: 'name', label: 'Full Name' },
    { key: 'personalEmail', label: 'Personal Email' },
    { key: 'phone', label: 'Phone Number' },
    { key: 'employeeId', label: 'Employee ID' },
    { key: 'workEmail', label: 'Work Email' },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department/Project' },
    { key: 'reportingManager', label: 'Reporting Manager' },
    { key: 'dateOfJoining', label: 'Date of Joining' },
    { key: 'employmentType', label: 'Employment Type' },
    { key: 'workMode', label: 'Work mode' },
  ]

  const normalizeRow = (u: UserRow) => ({
    name: u.name || '',
    personalEmail: u.personalEmail || '',
    phone: u.phone || '',
    employeeId: u.employeeId || '',
    workEmail: u.workEmail || u.email || '',
    designation: u.designation || '',
    department: u.department || '',
    reportingManager: u.reportingManager || '',
    dateOfJoining: u.dateOfJoining ? formatDate(u.dateOfJoining) : '',
    employmentType: u.employmentType || '',
    workMode: u.workMode || '',
  })

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const escapeXml = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

  const buildCsv = (rows: any[]) => {
    const header = exportFields.map((f) => `"${f.label.replace(/"/g, '""')}"`).join(',')
    const lines = rows.map((row) =>
      exportFields.map((f) => `"${String((row as any)[f.key] ?? '').replace(/"/g, '""')}"`).join(',')
    )
    return [header, ...lines].join('\n')
  }

  const buildXml = (rows: any[]) => {
    const items = rows.map((row) => {
      const cols = exportFields
        .map((f) => `<${f.key}>${escapeXml(String((row as any)[f.key] ?? ''))}</${f.key}>`)
        .join('')
      return `<user>${cols}</user>`
    })
    return `<?xml version="1.0" encoding="UTF-8"?><users>${items.join('')}</users>`
  }

  const buildXls = (rows: any[]) => {
    const header = exportFields.map((f) => `<th>${f.label}</th>`).join('')
    const body = rows
      .map((row) => `<tr>${exportFields.map((f) => `<td>${String((row as any)[f.key] ?? '')}</td>`).join('')}</tr>`)
      .join('')
    return `<html><head><meta charset="UTF-8" /></head><body><table>${header ? `<tr>${header}</tr>` : ''}${body}</table></body></html>`
  }

  const buildPdf = (rows: any[]) => {
    const lines = rows.flatMap((row) =>
      exportFields.map((f) => `${f.label}: ${String((row as any)[f.key] ?? '')}`)
    )
    const text = lines.join('\\n')
    const stream = `BT /F1 10 Tf 50 760 Td (${text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')}) Tj ET`
    const objects = [
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
      `4 0 obj << /Length ${stream.length} >> stream\\n${stream}\\nendstream endobj`,
      '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
    ]
    let xref = 'xref\\n0 6\\n0000000000 65535 f \\n'
    let offset = 9
    const body = objects
      .map((obj) => {
        const line = obj + '\\n'
        xref += String(offset).padStart(10, '0') + ' 00000 n \\n'
        offset += line.length
        return line
      })
      .join('')
    const trailer = `trailer << /Size 6 /Root 1 0 R >>\\nstartxref\\n${offset}\\n%%EOF`
    return `%PDF-1.4\\n${body}${xref}${trailer}`
  }

  const handleExport = (format: 'csv' | 'json' | 'xml' | 'xls' | 'pdf', scope: 'all' | 'view') => {
    const source = scope === 'all' ? filtered : pageItems
    const rows = source.map(normalizeRow)
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
      downloadBlob(blob, scope === 'all' ? 'Users.json' : 'Users-view.json')
      setShowExportMenu(false)
      return
    }
    if (format === 'xml') {
      const blob = new Blob([buildXml(rows)], { type: 'application/xml' })
      downloadBlob(blob, scope === 'all' ? 'Users.xml' : 'Users-view.xml')
      setShowExportMenu(false)
      return
    }
    if (format === 'xls') {
      const blob = new Blob([buildXls(rows)], { type: 'application/vnd.ms-excel' })
      downloadBlob(blob, scope === 'all' ? 'Users.xls' : 'Users-view.xls')
      setShowExportMenu(false)
      return
    }
    if (format === 'pdf') {
      const blob = new Blob([buildPdf(rows)], { type: 'application/pdf' })
      downloadBlob(blob, scope === 'all' ? 'Users.pdf' : 'Users-view.pdf')
      setShowExportMenu(false)
      return
    }
    const csv = buildCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    downloadBlob(blob, scope === 'all' ? 'Users.csv' : 'Users-view.csv')
    setShowExportMenu(false)
  }

  const projectItems = useMemo(() => {
    const base = users.reduce<Record<string, { label: string; value: string; count: number }>>((acc, u) => {
      const raw = String(u.department || '').trim() || 'General'
      const key = raw.toLowerCase()
      if (!acc[key]) acc[key] = { label: raw, value: raw, count: 0 }
      acc[key].count += 1
      return acc
    }, {})
    const configured = panelRules.filter((r) => String(r.field || '').toLowerCase() === 'department')
    configured.forEach((r) => {
      const value = String(r.value || '').trim()
      if (!value) return
      const key = value.toLowerCase()
      const count = users.filter((u) => String(u.department || '').toLowerCase() === key).length
      if (base[key]) {
        base[key] = { ...base[key], label: r.label || base[key].label, value, count }
      } else {
        base[key] = { label: r.label || value, value, count }
      }
    })
    return Object.values(base).sort((a, b) => a.label.localeCompare(b.label))
  }, [users, panelRules])
  const renderQueueIcon = (kind: 'project' | 'all') => {
    if (kind === 'project') {
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
      </svg>
    )
  }
  const usersLeftPanel = (!leftPanelCollapsed && queueRoot) ? createPortal(
    <aside className="user-left-panel">
      <div className="queue-header">
        <div className="queue-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="3" />
            <path d="M5 19a7 7 0 0 1 14 0" />
          </svg>
        </div>
        <div className="queue-title">
          <div className="queue-title-top">
            <button className="queue-title-btn" onClick={() => setShowUserViewSelector(true)} title="Select user queue view">
              <div className="queue-title-text">{userQueueView === 'byProject' ? 'Users by Project' : 'All Users'}</div>
            </button>
            <button className="queue-edit-btn" onClick={() => setShowUserViewSelector(true)} title="Change user queue view">
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
        {showUserViewSelector ? (
          <>
            <div
              className={`queue-item${userQueueView === 'byProject' ? ' queue-item-active' : ''}`}
              onClick={() => {
                setUserQueueView('byProject')
                setSelectedProject('all')
                setShowUserViewSelector(false)
              }}
            >
              <div className="queue-avatar">{renderQueueIcon('project')}</div>
              <div className="queue-name">Users by Project</div>
              <div className="queue-count">{users.length}</div>
            </div>
            <div
              className={`queue-item${userQueueView === 'allUsers' ? ' queue-item-active' : ''}`}
              onClick={() => {
                setUserQueueView('allUsers')
                setSelectedProject('all')
                setShowUserViewSelector(false)
              }}
            >
              <div className="queue-avatar">{renderQueueIcon('all')}</div>
              <div className="queue-name">All Users</div>
              <div className="queue-count">{users.length}</div>
            </div>
          </>
        ) : userQueueView === 'byProject' ? (
          <>
            <div
              className={`queue-item${selectedProject === 'all' ? ' queue-item-active' : ''}`}
              onClick={() => setSelectedProject('all')}
            >
              <div className="queue-avatar">{renderQueueIcon('all')}</div>
              <div className="queue-name">All Projects</div>
              <div className="queue-count">{users.length}</div>
            </div>
            {projectItems.map((project) => (
              <div
                key={project.value}
                className={`queue-item${selectedProject === project.value ? ' queue-item-active' : ''}`}
                onClick={() => setSelectedProject(project.value)}
              >
                <div className="queue-avatar">{renderQueueIcon('project')}</div>
                <div className="queue-name">{project.label}</div>
                <div className="queue-count">{project.count}</div>
              </div>
            ))}
          </>
        ) : (
          <div className="queue-item queue-item-active">
            <div className="queue-avatar">{renderQueueIcon('all')}</div>
            <div className="queue-name">All Users</div>
            <div className="queue-count">{users.length}</div>
          </div>
        )}
      </div>
    </aside>,
    queueRoot
  ) : null

  return (
    <>
      {usersLeftPanel}
      <div className="users-view">
      <div className="users-filters-bar">
        <div className="users-filters" />
        <div className="users-toolbar-right">
          <div className="users-tabs">
            {viewTabs.map((t) => (
              <button
                key={t}
                className={`users-tab ${activeView === t ? 'active' : ''}`}
                onClick={() => setActiveView(t)}
                title={t}
                aria-label={t}
              >
                {t === 'Table' ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M3 9h18M3 14h18M8 4v16M14 4v16" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <rect x="3" y="4" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="13" y="4" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="3" y="13" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <rect x="13" y="13" width="8" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <div className="users-export" ref={exportMenuRef}>
            <button className="users-ghost-btn" onClick={() => setShowExportMenu((v) => !v)}>Export</button>
            {showExportMenu && (
              <div className="users-export-menu">
                <button onClick={() => handleExport('json', 'all')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  JSON
                </button>
                <button onClick={() => handleExport('xml', 'all')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  XML
                </button>
                <div className="users-export-divider" />
                <button onClick={() => handleExport('csv', 'all')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  CSV (all elements)
                </button>
                <button onClick={() => handleExport('csv', 'view')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  CSV (only view)
                </button>
                <div className="users-export-divider" />
                <button onClick={() => handleExport('xls', 'all')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  XLS (all elements)
                </button>
                <button onClick={() => handleExport('xls', 'view')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  XLS (only view)
                </button>
                <div className="users-export-divider" />
                <button onClick={() => handleExport('pdf', 'all')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  PDF (all elements)
                </button>
                <button onClick={() => handleExport('pdf', 'view')}>
                  <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                    <path d="M6 4h9l3 3v13H6z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M15 4v3h3" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  PDF (only view)
                </button>
              </div>
            )}
          </div>
          <button className="users-ghost-btn" title="Filter" onClick={() => setShowFilters((v) => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </button>
          <button className="users-primary-btn" onClick={() => { setEditingUser(null); setShowAddModal(true) }}>Add User</button>
        </div>
      </div>
      {activeView === 'Table' && (
        <div className="users-table">
          <table
            className="users-grid"
            style={{
              tableLayout: 'fixed',
              width: '100%',
              minWidth: `${colWidths.reduce((s, w) => s + w, 0)}px`,
            }}
          >
            <colgroup>
              {colWidths.map((w, idx) => (
                <col key={idx} style={{ width: `${w}px` }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th className="users-col check">
                  <input type="checkbox" aria-label="Select all" checked={allPageSelected} onChange={toggleSelectAll} />
                </th>
                <th className="users-col name"><span className="col-resize-handle" onMouseDown={(e) => startResize(1, e)} />Full name</th>
                <th className="users-col personalEmail"><span className="col-resize-handle" onMouseDown={(e) => startResize(2, e)} />Personal Email</th>
                <th className="users-col phone"><span className="col-resize-handle" onMouseDown={(e) => startResize(3, e)} />Phone</th>
                <th className="users-col employeeId"><span className="col-resize-handle" onMouseDown={(e) => startResize(4, e)} />Employee ID</th>
                <th className="users-col workEmail"><span className="col-resize-handle" onMouseDown={(e) => startResize(5, e)} />Work Email</th>
                <th className="users-col designation"><span className="col-resize-handle" onMouseDown={(e) => startResize(6, e)} />Designation</th>
                <th className="users-col department"><span className="col-resize-handle" onMouseDown={(e) => startResize(7, e)} />Department/Project</th>
                <th className="users-col manager"><span className="col-resize-handle" onMouseDown={(e) => startResize(8, e)} />Reporting Manager</th>
                <th className="users-col doj"><span className="col-resize-handle" onMouseDown={(e) => startResize(9, e)} />Date of Joining</th>
                <th className="users-col employmentType"><span className="col-resize-handle" onMouseDown={(e) => startResize(10, e)} />Employment Type</th>
                <th className="users-col workMode"><span className="col-resize-handle" onMouseDown={(e) => startResize(11, e)} />Work Mode</th>
                <th className="users-col actions"><span className="col-resize-handle" onMouseDown={(e) => startResize(12, e)} />Actions</th>
              </tr>
              {showFilters && (
                <tr className="users-filter-row">
                  <th className="users-col check">
                    <button
                      className="filter-clear-btn"
                      onClick={() => {
                        setFilters({
                          name: '',
                          personalEmail: '',
                          phone: '',
                          employeeId: '',
                          workEmail: '',
                          designation: '',
                          department: '',
                          manager: '',
                          dateOfJoining: '',
                          employmentType: '',
                          workMode: '',
                        })
                        setShowFilters(false)
                      }}
                      title="Clear filters"
                      aria-label="Clear filters"
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </th>
                  <th className="users-col name">
                    <input className="table-filter-input" value={filters.name} onChange={(e) => setFilters({ ...filters, name: e.target.value })} />
                  </th>
                  <th className="users-col personalEmail">
                    <input className="table-filter-input" value={filters.personalEmail} onChange={(e) => setFilters({ ...filters, personalEmail: e.target.value })} />
                  </th>
                  <th className="users-col phone">
                    <input className="table-filter-input" value={filters.phone} onChange={(e) => setFilters({ ...filters, phone: e.target.value })} />
                  </th>
                  <th className="users-col employeeId">
                    <input className="table-filter-input" value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })} />
                  </th>
                  <th className="users-col workEmail">
                    <input className="table-filter-input" value={filters.workEmail} onChange={(e) => setFilters({ ...filters, workEmail: e.target.value })} />
                  </th>
                  <th className="users-col designation">
                    <input className="table-filter-input" value={filters.designation} onChange={(e) => setFilters({ ...filters, designation: e.target.value })} />
                  </th>
                  <th className="users-col department">
                    <input className="table-filter-input" value={filters.department} onChange={(e) => setFilters({ ...filters, department: e.target.value })} />
                  </th>
                  <th className="users-col manager">
                    <input className="table-filter-input" value={filters.manager} onChange={(e) => setFilters({ ...filters, manager: e.target.value })} />
                  </th>
                  <th className="users-col doj">
                    <input className="table-filter-input" value={filters.dateOfJoining} onChange={(e) => setFilters({ ...filters, dateOfJoining: e.target.value })} />
                  </th>
                  <th className="users-col employmentType">
                    <input className="table-filter-input" value={filters.employmentType} onChange={(e) => setFilters({ ...filters, employmentType: e.target.value })} />
                  </th>
                  <th className="users-col workMode">
                    <input className="table-filter-input" value={filters.workMode} onChange={(e) => setFilters({ ...filters, workMode: e.target.value })} />
                  </th>
                  <th className="users-col actions" />
                </tr>
              )}
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="users-empty" colSpan={13}>Loading users...</td>
                </tr>
              )}
              {!loading && pageItems.map((u) => (
                <tr key={u.id}>
                  <td className="users-col check">
                    <input
                      type="checkbox"
                      aria-label={`Select ${u.email}`}
                      checked={selectedIds.includes(u.id)}
                      onChange={() => toggleSelectOne(u.id)}
                    />
                  </td>
                  <td className="users-col name">
                    <div className="users-user">
                      <div className="users-avatar">{getInitials(u.name || u.email || 'U')}</div>
                      <div className="users-user-name">{u.name || 'Unknown'}</div>
                    </div>
                  </td>
                  <td className="users-col personalEmail">{u.personalEmail || '-'}</td>
                  <td className="users-col phone">{u.phone || '-'}</td>
                  <td className="users-col employeeId">{u.employeeId || '-'}</td>
                  <td className="users-col workEmail">{u.workEmail || u.email || '-'}</td>
                  <td className="users-col designation">{u.designation || '-'}</td>
                  <td className="users-col department">{u.department || '-'}</td>
                  <td className="users-col manager">{u.reportingManager || '-'}</td>
                  <td className="users-col doj">{formatDate(u.dateOfJoining)}</td>
                  <td className="users-col employmentType">{u.employmentType || '-'}</td>
                  <td className="users-col workMode">{u.workMode || '-'}</td>
                  <td className="users-col actions">
                    <button className="users-action-btn" onClick={() => openEdit(u)}>Edit</button>
                    <button className="users-action-btn" onClick={() => handleDeleteUser(u)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td className="users-empty" colSpan={13}>No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {activeView === 'Board' && (
        <div className="users-cards">
          {loading && <div className="users-empty">Loading users...</div>}
          {!loading && pageItems.map((u) => (
            <div key={u.id} className="users-card">
              <div className="users-card-header">
                <div className="users-avatar">{getInitials(u.name || u.email || 'U')}</div>
                <div>
                  <div className="users-user-name">{u.name || 'Unknown'}</div>
                  <div className="users-card-sub">{u.workEmail || u.email || '-'}</div>
                </div>
              </div>
              <div className="users-card-body">
                <div><strong>Personal Email:</strong> {u.personalEmail || '-'}</div>
                <div><strong>Phone:</strong> {u.phone || '-'}</div>
                <div><strong>Employee ID:</strong> {u.employeeId || '-'}</div>
                <div><strong>Designation:</strong> {u.designation || '-'}</div>
                <div><strong>Department/Project:</strong> {u.department || '-'}</div>
                <div><strong>Reporting Manager:</strong> {u.reportingManager || '-'}</div>
                <div><strong>Date of Joining:</strong> {formatDate(u.dateOfJoining)}</div>
                <div><strong>Employment Type:</strong> {u.employmentType || '-'}</div>
                <div><strong>Work Mode:</strong> {u.workMode || '-'}</div>
              </div>
              <div className="users-card-actions">
                <button className="users-action-btn" onClick={() => openEdit(u)}>Edit</button>
                <button className="users-action-btn" onClick={() => handleDeleteUser(u)}>Delete</button>
              </div>
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="users-empty">No users found.</div>
          )}
        </div>
      )}

        {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingUser ? 'Edit User' : 'New User'}</h2>
              <button className="modal-close" onClick={() => { setShowAddModal(false); setEditingUser(null) }}>x</button>
            </div>
            <div className="modal-body">
              <div className="user-form-grid">
                <div className="form-section">
                  <label className="form-label">Full Name</label>
                  <input
                    className="form-input"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="Full name"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Personal Email ID</label>
                  <input
                    className="form-input"
                    value={newUser.personalEmail}
                    onChange={(e) => setNewUser({ ...newUser, personalEmail: e.target.value })}
                    placeholder="name@example.com"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Phone Number</label>
                  <input
                    className="form-input"
                    value={newUser.phone}
                    onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                    placeholder="+1 555 000 0000"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Employee ID</label>
                  <input
                    className="form-input"
                    value={newUser.employeeId}
                    onChange={(e) => setNewUser({ ...newUser, employeeId: e.target.value })}
                    placeholder="EMP-001"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Work Email ID</label>
                  <input
                    className="form-input"
                    value={newUser.workEmail}
                    onChange={(e) => setNewUser({ ...newUser, workEmail: e.target.value })}
                    placeholder="name@company.com"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Designation</label>
                  <input
                    className="form-input"
                    value={newUser.designation}
                    onChange={(e) => setNewUser({ ...newUser, designation: e.target.value })}
                    placeholder="Designation"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Department/Project</label>
                  <input
                    className="form-input"
                    value={newUser.department}
                    onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                    placeholder="Department or project"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Reporting Manager</label>
                  <input
                    className="form-input"
                    value={newUser.manager}
                    onChange={(e) => setNewUser({ ...newUser, manager: e.target.value })}
                    placeholder="Manager name"
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Date of Joining</label>
                  <input
                    className="form-input"
                    type="date"
                    value={newUser.dateOfJoining}
                    onChange={(e) => setNewUser({ ...newUser, dateOfJoining: e.target.value })}
                  />
                </div>
                <div className="form-section">
                  <label className="form-label">Employment Type</label>
                  <select
                    className="form-select"
                    value={newUser.employmentType}
                    onChange={(e) => setNewUser({ ...newUser, employmentType: e.target.value })}
                  >
                    <option value="Full-time">Full-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Intern">Intern</option>
                  </select>
                </div>
                <div className="form-section">
                  <label className="form-label">Work mode</label>
                  <select
                    className="form-select"
                    value={newUser.workMode}
                    onChange={(e) => setNewUser({ ...newUser, workMode: e.target.value })}
                  >
                    <option value="Onsite">Onsite</option>
                    <option value="Remote">Remote</option>
                    <option value="Hybrid">Hybrid</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => { setShowAddModal(false); setEditingUser(null) }}>Cancel</button>
              <button
                className="btn-submit"
                disabled={isSaving}
                onClick={editingUser ? handleUpdateUser : handleCreateUser}
              >
                {isSaving ? 'Saving...' : editingUser ? 'Save Changes' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
        )}
      </div>
    </>
  )
}


