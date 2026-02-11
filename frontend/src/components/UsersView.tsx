import React, { useEffect, useMemo, useRef, useState } from 'react'
import * as userService from '../services/user.service'

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

export default function UsersView() {
  const [activeView, setActiveView] = useState<typeof viewTabs[number]>('Table')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [page, setPage] = useState(1)
  const rowsPerPage = 50
  const [showExportMenu, setShowExportMenu] = useState(false)
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

  const loadUsers = async () => {
    setLoading(true)
    try {
      const data = await userService.listUsers({ q: search || undefined })
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch users', e)
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [search])

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
      await userService.updateUser(editingUser.id, {
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

  const filtered = useMemo(() => users, [users])
  const totalRows = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const safePage = Math.min(page, totalPages)
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
    if (page !== safePage) setPage(safePage)
  }, [safePage, page])

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

  return (
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
          <button className="users-primary-btn" onClick={() => { setEditingUser(null); setShowAddModal(true) }}>Add User</button>
        </div>
      </div>
      <div className="visuals-row users-visuals">
        <div className="visual-card">
          <div className="visual-title">Employment Type</div>
          <div className="mini-barlist">
            {userVisuals.employment.map(([k, v]) => {
              const w = Math.min(100, (v / Math.max(1, userVisuals.totalCount)) * 100)
              return (
                <div key={k} className="mini-bar-row">
                  <span>{k}</span>
                  <div className="mini-bar-track">
                    <div className="mini-bar-fill low" style={{ width: `${w}%` }} />
                  </div>
                  <strong>{v}</strong>
                </div>
              )
            })}
            {userVisuals.employment.length === 0 && <div className="users-empty">No data</div>}
          </div>
        </div>
        <div className="visual-card">
          <div className="visual-title">Work Mode</div>
          <div className="mini-barlist">
            {userVisuals.workMode.map(([k, v]) => {
              const w = Math.min(100, (v / Math.max(1, userVisuals.totalCount)) * 100)
              return (
                <div key={k} className="mini-bar-row">
                  <span>{k}</span>
                  <div className="mini-bar-track">
                    <div className="mini-bar-fill medium" style={{ width: `${w}%` }} />
                  </div>
                  <strong>{v}</strong>
                </div>
              )
            })}
            {userVisuals.workMode.length === 0 && <div className="users-empty">No data</div>}
          </div>
        </div>
      </div>

      {activeView === 'Table' && (
        <div className="users-table">
          <table className="users-grid">
            <thead>
              <tr>
                <th className="users-col check">
                  <input type="checkbox" aria-label="Select all" checked={allPageSelected} onChange={toggleSelectAll} />
                </th>
                <th className="users-col name">Full name</th>
                <th className="users-col personalEmail">Personal Email</th>
                <th className="users-col phone">Phone</th>
                <th className="users-col employeeId">Employee ID</th>
                <th className="users-col workEmail">Work Email</th>
                <th className="users-col designation">Designation</th>
                <th className="users-col department">Department/Project</th>
                <th className="users-col manager">Reporting Manager</th>
                <th className="users-col doj">Date of Joining</th>
                <th className="users-col employmentType">Employment Type</th>
                <th className="users-col workMode">Work Mode</th>
                <th className="users-col actions">Actions</th>
              </tr>
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
              </div>
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <div className="users-empty">No users found.</div>
          )}
        </div>
      )}

      <div className="users-footer">
        <div className="users-footer-left">
          <span>{`${totalRows === 0 ? 0 : pageStart + 1}-${Math.min(pageStart + rowsPerPage, totalRows)} of ${totalRows}`}</span>
        </div>
        <div className="users-footer-right">
          <button
            className="users-page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            aria-label="Previous page"
          >
            {'<'}
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              className={`users-page-btn${p === safePage ? ' active' : ''}`}
              onClick={() => setPage(p)}
            >
              {p}
            </button>
          ))}
          <button
            className="users-page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            aria-label="Next page"
          >
            {'>'}
          </button>
        </div>
      </div>

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
  )
}
