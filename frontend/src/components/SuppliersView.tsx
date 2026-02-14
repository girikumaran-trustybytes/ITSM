import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import * as supplierService from '../services/supplier.service'
import { useColumnResize } from '../hooks/useColumnResize'
import { getRowsPerPage } from '../utils/pagination'
import { loadLeftPanelConfig, type QueueRule } from '../utils/leftPanelConfig'

type Supplier = {
  id: number
  companyName: string
  contactName?: string | null
  contactEmail?: string | null
  slaTerms?: string | null
}

type PaginationMeta = {
  page: number
  totalPages: number
  totalRows: number
  rangeStart: number
  rangeEnd: number
}

type SuppliersViewProps = {
  toolbarSearch?: string
  controlledPage?: number
  onPageChange?: (nextPage: number) => void
  onPaginationMetaChange?: (meta: PaginationMeta) => void
}

export default function SuppliersView({
  toolbarSearch = '',
  controlledPage,
  onPageChange,
  onPaginationMetaChange,
}: SuppliersViewProps) {
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState(toolbarSearch)
  const [internalPage, setInternalPage] = useState(1)
  const rowsPerPage = getRowsPerPage()
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newSupplier, setNewSupplier] = useState({
    companyName: '',
    contactName: '',
    contactEmail: '',
    slaTerms: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [leftPanelFilter, setLeftPanelFilter] = useState<string>('all')
  const [panelRules, setPanelRules] = useState<QueueRule[]>(() => loadLeftPanelConfig().suppliers)
  const [filters, setFilters] = useState({
    company: '',
    contact: '',
    email: '',
    sla: '',
  })
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const { widths: columnWidths, startResize } = useColumnResize({
    initialWidths: [30, 320, 240, 280, 200],
    minWidth: 0,
  })
  const columnTemplate = columnWidths.map((w) => `${w}px`).join(' ')
  const currentPage = controlledPage ?? internalPage
  const setPage = (next: number | ((prev: number) => number)) => {
    const resolved = typeof next === 'function' ? next(currentPage) : next
    if (typeof controlledPage === 'number') {
      onPageChange?.(resolved)
      return
    }
    setInternalPage(resolved)
  }

  const loadSuppliers = async () => {
    try {
      const data = await supplierService.listSuppliers({ q: search })
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch suppliers', e)
    }
  }

  useEffect(() => {
    loadSuppliers()
  }, [search])

  useEffect(() => {
    setSearch(toolbarSearch)
  }, [toolbarSearch])

  useEffect(() => {
    const expandedCls = 'suppliers-queue-expanded'
    const collapsedCls = 'suppliers-queue-collapsed'
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
    document.body.classList.add('suppliers-view-active')
    return () => document.body.classList.remove('suppliers-view-active')
  }, [])
  useEffect(() => {
    const handler = () => setPanelRules(loadLeftPanelConfig().suppliers)
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'suppliers') return
      if (detail.action === 'new') {
        setNewSupplier({ companyName: '', contactName: '', contactEmail: '', slaTerms: '' })
        setShowModal(true)
      }
      if (detail.action === 'filter') {
        setShowFilters((v) => !v)
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'suppliers') return
      if (detail.action === 'toggle-left-panel') {
        setLeftPanelCollapsed((v) => !v)
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [])

  const handleCreateSupplier = async () => {
    if (!newSupplier.companyName.trim()) {
      alert('Company name is required')
      return
    }
    setIsSaving(true)
    try {
      await supplierService.createSupplier({
        companyName: newSupplier.companyName.trim(),
        contactName: newSupplier.contactName.trim() || undefined,
        contactEmail: newSupplier.contactEmail.trim() || undefined,
        slaTerms: newSupplier.slaTerms.trim() || undefined,
      })
      setShowModal(false)
      await loadSuppliers()
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to create supplier')
    } finally {
      setIsSaving(false)
    }
  }

  const filtered = suppliers.filter((s) => {
    const match = (value: string | undefined | null, q: string) =>
      String(value || '').toLowerCase().includes(q.toLowerCase())
    if (leftPanelFilter !== 'all') {
      const rule = panelRules.find((r) => r.id === leftPanelFilter)
      if (rule) {
        if (rule.field === 'sla' && String(s.slaTerms || '').toLowerCase() !== String(rule.value || '').toLowerCase()) return false
        if (rule.field === 'contact' && String(s.contactEmail || s.contactName || '').toLowerCase() !== String(rule.value || '').toLowerCase()) return false
        if (rule.field === 'company' && String(s.companyName || '').toLowerCase() !== String(rule.value || '').toLowerCase()) return false
      }
    }
    if (filters.company && !match(s.companyName, filters.company)) return false
    if (filters.contact && !match(s.contactName, filters.contact)) return false
    if (filters.email && !match(s.contactEmail, filters.email)) return false
    if (filters.sla && !match(s.slaTerms, filters.sla)) return false
    return true
  })
  const totalRows = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * rowsPerPage
  const pageItems = filtered.slice(pageStart, pageStart + rowsPerPage)

  useEffect(() => {
    if (currentPage !== safePage) setPage(safePage)
  }, [currentPage, safePage])

  useEffect(() => {
    onPaginationMetaChange?.({
      page: safePage,
      totalPages,
      totalRows,
      rangeStart: totalRows === 0 ? 0 : pageStart + 1,
      rangeEnd: Math.min(pageStart + rowsPerPage, totalRows),
    })
  }, [safePage, totalPages, totalRows, pageStart, onPaginationMetaChange])
  const allSelected = filtered.length > 0 && filtered.every((s) => selectedIds.includes(s.id))
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filtered.some((s) => s.id === id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...filtered.map((s) => s.id)])))
    }
  }
  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }
  const countForRule = (rule: QueueRule) => {
    if (rule.field === 'sla') return suppliers.filter((s) => String(s.slaTerms || '').toLowerCase() === String(rule.value || '').toLowerCase()).length
    if (rule.field === 'contact') return suppliers.filter((s) => String(s.contactEmail || s.contactName || '').toLowerCase() === String(rule.value || '').toLowerCase()).length
    if (rule.field === 'company') return suppliers.filter((s) => String(s.companyName || '').toLowerCase() === String(rule.value || '').toLowerCase()).length
    return 0
  }

  const suppliersLeftPanel = (!leftPanelCollapsed && queueRoot) ? createPortal(
    <aside className="supplier-left-panel">
      <div className="queue-search">
        <input placeholder="Search Suppliers..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="queue-header">
        <button className="queue-collapse-btn" title="Hide Menu" onClick={() => setLeftPanelCollapsed(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="queue-title">
          <button className="queue-title-btn" title="Supplier panel">
            <div className="queue-title-text">Suppliers Queue</div>
          </button>
        </div>
        <div className="queue-total" title="Total suppliers">{suppliers.length}</div>
      </div>
      {panelRules.length > 0 && (
        <div className="queue-list">
          {panelRules.map((rule) => (
            <div key={rule.id} className={`queue-item${leftPanelFilter === rule.id ? ' queue-item-active' : ''}`} onClick={() => setLeftPanelFilter((v) => v === rule.id ? 'all' : rule.id)}>
              <div className="queue-avatar">{rule.label.trim()[0]?.toUpperCase() || 'S'}</div>
              <div className="queue-name">{rule.label}</div>
              <div className="queue-count">{countForRule(rule)}</div>
            </div>
          ))}
        </div>
      )}
    </aside>,
    queueRoot
  ) : null

  return (
    <>
      {suppliersLeftPanel}
      <div className="admin-view">
      <div className="admin-header">
        <div>
          <h2>Suppliers</h2>
          <p>Supplier directory</p>
        </div>
        <div className="admin-actions">
          <input
            className="admin-search"
            placeholder="Search suppliers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="admin-icon-btn" title="Filter" onClick={() => setShowFilters((v) => !v)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
            </svg>
          </button>
        </div>
      </div>

      <div className="admin-table">
        <div className="admin-row admin-head" style={{ gridTemplateColumns: columnTemplate }}>
          <div className="admin-col check">
            <input type="checkbox" aria-label="Select all suppliers" checked={allSelected} onChange={toggleSelectAll} />
          </div>
          <div className="admin-col name">
            <span className="col-resize-handle" onMouseDown={(e) => startResize(1, e)} />
            Company
          </div>
          <div className="admin-col email">
            <span className="col-resize-handle" onMouseDown={(e) => startResize(2, e)} />
            Contact
          </div>
          <div className="admin-col role">
            <span className="col-resize-handle" onMouseDown={(e) => startResize(3, e)} />
            Email
          </div>
          <div className="admin-col sla">
            <span className="col-resize-handle" onMouseDown={(e) => startResize(4, e)} />
            SLA
          </div>
        </div>
        {showFilters && (
          <div
            className="admin-row admin-filters"
            style={{ gridTemplateColumns: columnTemplate }}
          >
            <div className="admin-col check">
              <button
                className="filter-clear-btn"
                onClick={() => {
                  setFilters({ company: '', contact: '', email: '', sla: '' })
                  setShowFilters(false)
                }}
                title="Clear filters"
                aria-label="Clear filters"
              >
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="admin-col name">
              <input className="table-filter-input" value={filters.company} onChange={(e) => setFilters({ ...filters, company: e.target.value })} />
            </div>
            <div className="admin-col email">
              <input className="table-filter-input" value={filters.contact} onChange={(e) => setFilters({ ...filters, contact: e.target.value })} />
            </div>
            <div className="admin-col role">
              <input className="table-filter-input" value={filters.email} onChange={(e) => setFilters({ ...filters, email: e.target.value })} />
            </div>
            <div className="admin-col sla">
              <input className="table-filter-input" value={filters.sla} onChange={(e) => setFilters({ ...filters, sla: e.target.value })} />
            </div>
          </div>
        )}
        {pageItems.map((s) => (
          <div
            key={s.id}
            className="admin-row"
            style={{ gridTemplateColumns: columnTemplate }}
          >
            <div className="admin-col check">
              <input
                type="checkbox"
                aria-label={`Select ${s.companyName}`}
                checked={selectedIds.includes(s.id)}
                onChange={() => toggleSelectOne(s.id)}
              />
            </div>
            <div className="admin-col name">{s.companyName}</div>
            <div className="admin-col email">{s.contactName || '-'}</div>
            <div className="admin-col role">{s.contactEmail || '-'}</div>
            <div className="admin-col sla">{s.slaTerms || '-'}</div>
          </div>
        ))}
        {totalRows === 0 && <div className="admin-empty">No suppliers found.</div>}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Supplier</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-section">
                <label className="form-label">Company Name *</label>
                <input className="form-input" value={newSupplier.companyName} onChange={(e) => setNewSupplier({ ...newSupplier, companyName: e.target.value })} />
              </div>
              <div className="form-section">
                <label className="form-label">Contact Name</label>
                <input className="form-input" value={newSupplier.contactName} onChange={(e) => setNewSupplier({ ...newSupplier, contactName: e.target.value })} />
              </div>
              <div className="form-section">
                <label className="form-label">Contact Email</label>
                <input className="form-input" value={newSupplier.contactEmail} onChange={(e) => setNewSupplier({ ...newSupplier, contactEmail: e.target.value })} />
              </div>
              <div className="form-section">
                <label className="form-label">SLA Terms</label>
                <input className="form-input" value={newSupplier.slaTerms} onChange={(e) => setNewSupplier({ ...newSupplier, slaTerms: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-submit" onClick={handleCreateSupplier} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  )
}






