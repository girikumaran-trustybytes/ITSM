import React, { useEffect, useMemo, useState } from 'react'
import * as userService from '../services/user.service'
import * as supplierService from '../services/supplier.service'
import * as slaService from '../services/sla.service'

type User = {
  id: number
  name?: string | null
  email: string
  role: 'ADMIN' | 'AGENT' | 'USER'
  status?: string | null
  createdAt?: string
  phone?: string | null
  client?: string | null
  site?: string | null
  accountManager?: string | null
}

type Supplier = {
  id: number
  companyName: string
  contactName?: string | null
  contactEmail?: string | null
  slaTerms?: string | null
}

type SlaConfig = {
  id: number
  name: string
  priority: string
  responseTimeMin: number
  resolutionTimeMin: number
  businessHours: boolean
  active: boolean
}

const tabs = [
  { id: 'agents', label: 'Agents' },
  { id: 'appUsers', label: 'Application Users' },
  { id: 'externalUsers', label: 'External Users' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'sla', label: 'SLA Config' },
]

export default function AdminView({ initialTab }: { initialTab?: string }) {
  const [active, setActive] = useState(initialTab || 'agents')
  const [users, setUsers] = useState<User[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [slaConfigs, setSlaConfigs] = useState<SlaConfig[]>([])
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState<any>({})

  useEffect(() => {
    if (initialTab) setActive(initialTab)
  }, [initialTab])

  const roleFilter = useMemo(() => {
    if (active === 'agents') return 'AGENT'
    if (active === 'appUsers') return 'ADMIN'
    if (active === 'externalUsers') return 'USER'
    return undefined
  }, [active])

  const loadUsers = async () => {
    if (!roleFilter) return
    try {
      const data = await userService.listUsers({ q: search, role: roleFilter })
      setUsers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch users', e)
      setUsers([])
    }
  }

  const loadSuppliers = async () => {
    try {
      const data = await supplierService.listSuppliers({ q: search })
      setSuppliers(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch suppliers', e)
    }
  }

  const loadSla = async () => {
    try {
      const data = await slaService.listSlaConfigs({ q: search })
      setSlaConfigs(Array.isArray(data) ? data : [])
    } catch (e) {
      console.warn('Failed to fetch SLA configs', e)
    }
  }

  useEffect(() => {
    if (roleFilter) {
      loadUsers()
    }
  }, [roleFilter, search])

  useEffect(() => {
    if (active === 'suppliers') loadSuppliers()
    if (active === 'sla') loadSla()
  }, [active, search])

  const openCreate = () => {
    setEditing(null)
    if (active === 'suppliers') {
      setForm({ companyName: '', contactName: '', contactEmail: '', slaTerms: '' })
    } else if (active === 'sla') {
      setForm({ name: '', priority: 'Medium', responseTimeMin: 60, resolutionTimeMin: 240, businessHours: false, active: true })
    } else {
      setForm({ name: '', email: '', password: '', role: roleFilter, phone: '', client: '', site: '', accountManager: '' })
    }
    setShowModal(true)
  }

  const openEdit = (item: any) => {
    setEditing(item)
    if (active === 'suppliers') {
      setForm({ companyName: item.companyName || '', contactName: item.contactName || '', contactEmail: item.contactEmail || '', slaTerms: item.slaTerms || '' })
    } else if (active === 'sla') {
      setForm({
        name: item.name,
        priority: item.priority,
        responseTimeMin: item.responseTimeMin,
        resolutionTimeMin: item.resolutionTimeMin,
        businessHours: Boolean(item.businessHours),
        active: Boolean(item.active),
      })
    } else {
      userService.getUser(item.id).then((full) => {
        setForm({
          name: full?.name || '',
          email: full?.email || '',
          password: '',
          role: full?.role || item.role,
          phone: full?.phone || '',
          client: full?.client || '',
          site: full?.site || '',
          accountManager: full?.accountManager || '',
        })
      }).catch(() => {
        setForm({
          name: item.name || '',
          email: item.email || '',
          password: '',
          role: item.role,
          phone: '',
          client: '',
          site: '',
          accountManager: '',
        })
      })
    }
    setShowModal(true)
  }



  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (active === 'suppliers') {
        const payload = { ...form }
        if (editing) {
          await supplierService.updateSupplier(editing.id, payload)
        } else {
          await supplierService.createSupplier(payload)
        }
        await loadSuppliers()
      } else if (active === 'sla') {
        const payload = {
          ...form,
          responseTimeMin: Number(form.responseTimeMin),
          resolutionTimeMin: Number(form.resolutionTimeMin),
        }
        if (editing) {
          await slaService.updateSlaConfig(editing.id, payload)
        } else {
          await slaService.createSlaConfig(payload)
        }
        await loadSla()
      } else {
        const payload = { ...form }
        if (editing) {
          await userService.updateUser(editing.id, payload)
        } else {
          await userService.createUser(payload)
        }
        await loadUsers()
      }
      setShowModal(false)
      setEditing(null)
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (item: any) => {
    if (!confirm('Delete this item? This cannot be undone.')) return
    try {
      if (active === 'suppliers') {
        await supplierService.deleteSupplier(item.id)
        setSuppliers(prev => prev.filter(s => s.id !== item.id))
      } else if (active === 'sla') {
        await slaService.deleteSlaConfig(item.id)
        setSlaConfigs(prev => prev.filter(s => s.id !== item.id))
      } else {
        await userService.deleteUser(item.id)
        setUsers(prev => prev.filter(u => u.id !== item.id))
      }
    } catch (e: any) {
      alert(e?.response?.data?.error || e?.message || 'Failed to delete')
    }
  }



  return (
    <div className="admin-view">
      <div className="admin-header">
        <div>
          <h2>Admin</h2>
          <p>Manage agents, users, suppliers, and SLA configuration</p>
        </div>
        <div className="admin-actions">
          <input
            className="admin-search"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="admin-primary-btn" onClick={openCreate}>+ New</button>
        </div>
      </div>

      <div className="admin-tabs">
        {tabs.map(t => (
          <button key={t.id} className={`admin-tab ${active === t.id ? 'active' : ''}`} onClick={() => setActive(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {roleFilter && (
        <div className="admin-table admin-users-table">
          <div className="admin-row admin-head">
            <div className="admin-col check"><input type="checkbox" /></div>
            <div className="admin-col name">Full name</div>
            <div className="admin-col email">Email</div>
            <div className="admin-col role">Role</div>
            <div className="admin-col status">Status</div>
            <div className="admin-col date">Joined date</div>
            <div className="admin-col twofa">2F Auth</div>
            <div className="admin-col actions">Actions</div>
          </div>
          {users.map((u) => (
            <div key={u.id} className="admin-row">
              <div className="admin-col check"><input type="checkbox" /></div>
              <div className="admin-col name">
                <div className="user-cell">
                  <div className="user-avatar">{(u.name || u.email || 'U').split(' ').map(n => n[0]).slice(0,2).join('').toUpperCase()}</div>
                  <div className="user-name">{u.name || 'Unknown'}</div>
                </div>
              </div>
              <div className="admin-col email">{u.email}</div>
              <div className="admin-col role">{u.role}</div>
              <div className="admin-col status">
                <span className={`user-status ${String(u.status || 'ACTIVE').toLowerCase()}`}>
                  <span className="status-dot"></span>
                  {u.status || 'Active'}
                </span>
              </div>
              <div className="admin-col date">{u.createdAt ? new Date(u.createdAt).toLocaleString() : '-'}</div>
              <div className="admin-col twofa"><span className="twofa-pill">Enabled</span></div>
              <div className="admin-col actions">
                <button className="admin-link-btn" onClick={() => openEdit(u)}>Edit</button>
                <button className="admin-link-btn danger" onClick={() => handleDelete(u)}>Delete</button>
              </div>
            </div>
          ))}
          {users.length === 0 && <div className="admin-empty">No users found.</div>}
        </div>
      )}

      {active === 'suppliers' && (
        <div className="admin-table">
          <div className="admin-row admin-head">
            <div className="admin-col name">Company</div>
            <div className="admin-col email">Contact</div>
            <div className="admin-col role">Email</div>
            <div className="admin-col actions">Actions</div>
          </div>
          {suppliers.map((s) => (
            <div key={s.id} className="admin-row">
              <div className="admin-col name">{s.companyName}</div>
              <div className="admin-col email">{s.contactName || '-'}</div>
              <div className="admin-col role">{s.contactEmail || '-'}</div>
              <div className="admin-col actions">
                <button className="admin-link-btn" onClick={() => openEdit(s)}>Edit</button>
                <button className="admin-link-btn danger" onClick={() => handleDelete(s)}>Delete</button>
              </div>
            </div>
          ))}
          {suppliers.length === 0 && <div className="admin-empty">No suppliers found.</div>}
        </div>
      )}

      {active === 'sla' && (
        <div className="admin-table">
          <div className="admin-row admin-head">
            <div className="admin-col name">Name</div>
            <div className="admin-col email">Priority</div>
            <div className="admin-col role">Response/Resolution</div>
            <div className="admin-col actions">Actions</div>
          </div>
          {slaConfigs.map((s) => (
            <div key={s.id} className="admin-row">
              <div className="admin-col name">{s.name}</div>
              <div className="admin-col email">{s.priority}</div>
              <div className="admin-col role">{s.responseTimeMin}m / {s.resolutionTimeMin}m</div>
              <div className="admin-col actions">
                <button className="admin-link-btn" onClick={() => openEdit(s)}>Edit</button>
                <button className="admin-link-btn danger" onClick={() => handleDelete(s)}>Delete</button>
              </div>
            </div>
          ))}
          {slaConfigs.length === 0 && <div className="admin-empty">No SLA configs found.</div>}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit' : 'New'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {active === 'suppliers' && (
                <>
                  <div className="form-section">
                    <label className="form-label">Company Name *</label>
                    <input className="form-input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
                  </div>
                  <div className="form-section">
                    <label className="form-label">Contact Name</label>
                    <input className="form-input" value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
                  </div>
                  <div className="form-section">
                    <label className="form-label">Contact Email</label>
                    <input className="form-input" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} />
                  </div>
                  <div className="form-section">
                    <label className="form-label">SLA Terms</label>
                    <input className="form-input" value={form.slaTerms} onChange={(e) => setForm({ ...form, slaTerms: e.target.value })} />
                  </div>
                </>
              )}

              {active === 'sla' && (
                <>
                  <div className="form-section">
                    <label className="form-label">Name *</label>
                    <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Priority *</label>
                      <select className="form-select" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                      </select>
                    </div>
                    <div className="form-section">
                      <label className="form-label">Business Hours</label>
                      <select className="form-select" value={form.businessHours ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, businessHours: e.target.value === 'yes' })}>
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Response Time (min)</label>
                      <input className="form-input" type="number" value={form.responseTimeMin} onChange={(e) => setForm({ ...form, responseTimeMin: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Resolution Time (min)</label>
                      <input className="form-input" type="number" value={form.resolutionTimeMin} onChange={(e) => setForm({ ...form, resolutionTimeMin: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-section">
                    <label className="form-label">Active</label>
                    <select className="form-select" value={form.active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, active: e.target.value === 'yes' })}>
                      <option value="yes">Yes</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                </>
              )}

              {roleFilter && (
                <>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Name</label>
                      <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Email *</label>
                      <input className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Password {editing ? '(leave blank to keep)' : '*'}</label>
                      <input className="form-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Role</label>
                      <select className="form-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                        <option value="ADMIN">ADMIN</option>
                        <option value="AGENT">AGENT</option>
                        <option value="USER">USER</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Phone</label>
                      <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Client</label>
                      <input className="form-input" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-section">
                      <label className="form-label">Site</label>
                      <input className="form-input" value={form.site} onChange={(e) => setForm({ ...form, site: e.target.value })} />
                    </div>
                    <div className="form-section">
                      <label className="form-label">Reporting Manager</label>
                      <input className="form-input" value={form.accountManager} onChange={(e) => setForm({ ...form, accountManager: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-submit" disabled={isSaving} onClick={handleSave}>
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
