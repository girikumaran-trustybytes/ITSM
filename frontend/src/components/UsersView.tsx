import React, { useEffect, useMemo, useState } from 'react'
import * as userService from '../services/user.service'

type UserRow = {
  id: number
  name?: string | null
  email: string
  role: 'ADMIN' | 'AGENT' | 'USER'
  status?: string | null
  createdAt?: string
}

const viewTabs = ['Table', 'Board', 'List'] as const
const roleFilters = ['All roles', 'ADMIN', 'AGENT', 'USER'] as const
const twoFaFilters = ['All', 'Enabled', 'Disabled'] as const

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
  const [roleFilter, setRoleFilter] = useState<typeof roleFilters[number]>('All roles')
  const [twoFaFilter, setTwoFaFilter] = useState<typeof twoFaFilters[number]>('All')
  const [search, setSearch] = useState('')
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const role = roleFilter === 'All roles' ? undefined : roleFilter
      const data = await userService.listUsers({ q: search || undefined, role })
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
  }, [roleFilter, search])

  const filtered = useMemo(() => {
    if (twoFaFilter === 'All') return users
    return users.filter((u) => {
      const enabled = String(u.status || 'ACTIVE').toLowerCase() !== 'inactive'
      return twoFaFilter === 'Enabled' ? enabled : !enabled
    })
  }, [users, twoFaFilter])

  return (
    <div className="users-view">
      <div className="users-filters-bar">
        <div className="users-filters">
          <div className="users-filter">
            <span className="users-filter-label">Role</span>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)}>
              {roleFilters.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="users-filter">
            <span className="users-filter-label">2F Auth</span>
            <select value={twoFaFilter} onChange={(e) => setTwoFaFilter(e.target.value as any)}>
              {twoFaFilters.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <button className="users-add-filter">+ Add filter</button>
        </div>
        <div className="users-toolbar-right">
          <div className="users-tabs">
            {viewTabs.map((t) => (
              <button
                key={t}
                className={`users-tab ${activeView === t ? 'active' : ''}`}
                onClick={() => setActiveView(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <button className="users-ghost-btn">Export</button>
          <button className="users-primary-btn">Add User</button>
        </div>
      </div>

      <div className="users-table">
        <div className="users-row users-head">
          <div className="users-col check"><input type="checkbox" aria-label="Select all" /></div>
          <div className="users-col name">Full name</div>
          <div className="users-col email">Email</div>
          <div className="users-col role">Role</div>
          <div className="users-col status">Status</div>
          <div className="users-col date">Joined date</div>
          <div className="users-col twofa">2F Auth</div>
          <div className="users-col actions">Actions</div>
        </div>
        {loading && <div className="users-empty">Loading users...</div>}
        {!loading && filtered.map((u) => {
          const status = String(u.status || 'Active')
          const statusKey = status.toLowerCase()
          const twoFaEnabled = statusKey !== 'inactive'
          return (
            <div key={u.id} className="users-row">
              <div className="users-col check"><input type="checkbox" aria-label={`Select ${u.email}`} /></div>
              <div className="users-col name">
                <div className="users-user">
                  <div className="users-avatar">{getInitials(u.name || u.email || 'U')}</div>
                  <div className="users-user-name">{u.name || 'Unknown'}</div>
                </div>
              </div>
              <div className="users-col email">{u.email}</div>
              <div className="users-col role">{u.role}</div>
              <div className="users-col status">
                <span className={`users-status ${statusKey}`}>
                  <span className="users-status-dot" />
                  {statusKey === 'inactive' ? 'Inactive' : 'Active'}
                </span>
              </div>
              <div className="users-col date">{formatDate(u.createdAt)}</div>
              <div className="users-col twofa">
                <span className={`users-twofa ${twoFaEnabled ? 'enabled' : 'disabled'}`}>
                  {twoFaEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div className="users-col actions">
                <button className="users-action-btn">Edit</button>
                <button className="users-action-btn danger">Delete</button>
              </div>
            </div>
          )
        })}
        {!loading && filtered.length === 0 && (
          <div className="users-empty">No users found.</div>
        )}
      </div>

      <div className="users-footer">
        <div className="users-footer-left">
          <span>Rows per page</span>
          <select defaultValue="15">
            <option>10</option>
            <option>15</option>
            <option>25</option>
            <option>50</option>
          </select>
          <span>{filtered.length} rows</span>
        </div>
        <div className="users-footer-right">
          <button className="users-page-btn">{'<'}</button>
          <button className="users-page-btn active">1</button>
          <button className="users-page-btn">2</button>
          <button className="users-page-btn">3</button>
          <button className="users-page-btn">{'>'}</button>
        </div>
      </div>
    </div>
  )
}
