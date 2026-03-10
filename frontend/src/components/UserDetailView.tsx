import React from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getUser } from '../modules/users/services/user.service'
import {
  getUserPermissions,
  listRbacUsers,
  reinviteServiceAccount,
  saveUserPermissions,
  sendServiceAccountInvite,
  updateUserMfaSettings,
} from '../services/rbac.service'
import { deleteUser, updateUser } from '../modules/users/services/user.service'

type PermissionEntry = {
  permissionKey: string
  module: string
  queue: string | null
  action: string
  label: string
  allowed: boolean
}

type PermissionSnapshot = {
  user: { id: number; role: string; inviteStatus?: string; status?: string }
  permissions: PermissionEntry[]
  selectedTemplateKey?: string
}

type PermissionColumn = 'view' | 'create' | 'access' | 'edit' | 'export'

const profileTabs = [
  { key: 'profile', label: 'Profile' },
  { key: 'permissions', label: 'Permissions' },
  { key: 'documents', label: 'Documents' },
  { key: 'tickets', label: 'Tickets' },
] as const

function titleCase(value: string) {
  if (!value) return ''
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function normalizeActionToColumn(input: string): PermissionColumn {
  const text = String(input || '').toLowerCase()
  if (text.includes('create') || text.includes('add')) return 'create'
  if (text.includes('access')) return 'access'
  if (text.includes('edit') || text.includes('update')) return 'edit'
  if (text.includes('export')) return 'export'
  return 'view'
}

type UserDetailViewProps = {
  mode?: 'users' | 'agents'
  userIdOverride?: number
  embedded?: boolean
  seedUser?: any
  onClose?: () => void
  onUserUpdated?: (user: any) => void
  onUserDeleted?: (userId: number) => void
}

export default function UserDetailView({
  mode = 'users',
  userIdOverride,
  embedded = false,
  seedUser,
  onClose,
  onUserUpdated,
  onUserDeleted,
}: UserDetailViewProps) {
  const isAgentsMode = mode === 'agents'
  const { userId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const numericId = Number(userIdOverride ?? userId)

  const seededUser = seedUser || (location.state as any)?.user || null
  const [user, setUser] = React.useState<any | null>(seededUser)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [activeTab, setActiveTab] = React.useState<(typeof profileTabs)[number]['key']>('profile')
  const [permissionSnapshot, setPermissionSnapshot] = React.useState<PermissionSnapshot | null>(null)
  const [permissionDraft, setPermissionDraft] = React.useState<Record<string, boolean>>({})
  const [permissionEditing, setPermissionEditing] = React.useState(false)
  const [permissionSaving, setPermissionSaving] = React.useState(false)
  const [editMode, setEditMode] = React.useState(false)
  const [profileDraft, setProfileDraft] = React.useState({
    email: '',
    mobilePhone: '',
    designation: '',
    location: '',
    company: '',
    signature: '',
  })
  const [leftPanelCollapsed, setLeftPanelCollapsed] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth <= 1100
  })
  const [actionToast, setActionToast] = React.useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [actionBusy, setActionBusy] = React.useState(false)

  const notifyAction = (type: 'ok' | 'error', text: string) => {
    setActionToast({ type, text })
    window.setTimeout(() => setActionToast(null), 2000)
  }

  React.useEffect(() => {
    if (isAgentsMode) return
    document.body.classList.add('users-view-active')
    return () => document.body.classList.remove('users-view-active')
  }, [isAgentsMode])

  React.useEffect(() => {
    if (isAgentsMode) return
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
  }, [leftPanelCollapsed, isAgentsMode])

  React.useEffect(() => {
    if (isAgentsMode) return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'users') return
      if (detail.action === 'toggle-left-panel') setLeftPanelCollapsed((v) => !v)
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [isAgentsMode])

  React.useEffect(() => {
    if (!Number.isFinite(numericId) || numericId <= 0) {
      setError('Invalid user id')
      return
    }
    let cancelled = false
    const load = async () => {
      try {
        if (!seededUser) setLoading(true)
        setError('')
        const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
          new Promise<T>((resolve, reject) => {
            const id = window.setTimeout(() => reject(new Error('timeout')), ms)
            promise.then(
              (value) => {
                window.clearTimeout(id)
                resolve(value)
              },
              (err) => {
                window.clearTimeout(id)
                reject(err)
              }
            )
          })

        let data: any = null
        try {
          data = await withTimeout(getUser(numericId), 7000)
        } catch {
          data = null
        }
        const normalizedUser = data?.data || data?.user || data || null
        if (!normalizedUser) {
          try {
            const list = await withTimeout(listRbacUsers({ q: String(numericId), limit: 500 }), 7000)
            const items = Array.isArray(list) ? list : Array.isArray((list as any)?.items) ? (list as any).items : []
            const match = items.find((item: any) => Number(item?.id) === numericId)
            if (match) data = match
          } catch {
            // ignore fallback errors
          }
        }
        if (cancelled) return
        const resolvedUser = (normalizedUser || data) ?? null
        if (!resolvedUser) {
          if (!seededUser) {
            setUser(null)
            setError('User not found')
          }
          return
        }
        setUser(resolvedUser)

      } catch (err: any) {
        if (cancelled) return
        setError(err?.response?.data?.error || err?.message || 'Failed to load user')
      } finally {
        if (!cancelled && !seededUser) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [numericId])

  React.useEffect(() => {
    if (!seededUser) return
    setUser(seededUser)
  }, [seededUser?.id])

  React.useEffect(() => {
    if (!user) return
    setProfileDraft({
      email: String(user?.email || user?.workEmail || ''),
      mobilePhone: String(user?.mobilePhone || ''),
      designation: String(user?.designation || ''),
      location: String(user?.location || user?.site || ''),
      company: String(user?.company || user?.client || ''),
      signature: String(user?.signature || ''),
    })
  }, [user?.id])

  React.useEffect(() => {
    if (activeTab !== 'permissions') return
    if (!Number.isFinite(numericId) || numericId <= 0) return
    if (permissionSnapshot) return
    let cancelled = false
    const loadPermissions = async () => {
      try {
        const withTimeout = <T,>(promise: Promise<T>, ms: number) =>
          new Promise<T>((resolve, reject) => {
            const id = window.setTimeout(() => reject(new Error('timeout')), ms)
            promise.then(
              (value) => {
                window.clearTimeout(id)
                resolve(value)
              },
              (err) => {
                window.clearTimeout(id)
                reject(err)
              }
            )
          })
        const snapshot = (await withTimeout(getUserPermissions(numericId), 7000)) as PermissionSnapshot
        if (cancelled) return
        setPermissionSnapshot(snapshot)
        const rawPermissions = (snapshot as any)?.permissions
          || (snapshot as any)?.permissionRows
          || (snapshot as any)?.data?.permissions
          || []
        const map = (rawPermissions || []).reduce<Record<string, boolean>>((acc, p: PermissionEntry) => {
          acc[p.permissionKey] = Boolean(p.allowed)
          return acc
        }, {})
        setPermissionDraft(map)
      } catch {
        if (!cancelled) {
          setPermissionSnapshot(null)
          setPermissionDraft({})
        }
      }
    }
    loadPermissions()
    return () => {
      cancelled = true
    }
  }, [activeTab, numericId, permissionSnapshot])

  const formatText = (value?: string | number | null) => {
    if (value === null || value === undefined) return '-'
    const text = String(value).trim()
    return text || '-'
  }

  const formatInviteStatus = (value?: string | null) => {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return '-'
    if (raw === 'accepted') return 'Accepted'
    if (raw.includes('invited')) return 'Invited'
    if (raw.includes('pending')) return 'Pending'
    if (raw.includes('revoked')) return 'Revoked'
    return titleCase(raw.replace(/_/g, ' '))
  }

  const formatAccountStatus = (value?: string | null) => {
    const raw = String(value || '').trim().toLowerCase()
    if (!raw) return '-'
    if (raw.includes('active') || raw === 'accepted') return 'Active'
    if (raw.includes('disable') || raw === 'inactive') return 'Disabled'
    if (raw.includes('invite') || raw.includes('pending')) return 'Invited'
    return titleCase(raw.replace(/_/g, ' '))
  }

  const getInviteActionMode = (inviteStatus: string, accountStatus: string): 'invite' | 'reinvite' => {
    const rawInvite = String(inviteStatus || '').trim().toLowerCase()
    const rawAccount = String(accountStatus || '').trim().toLowerCase()
    const alreadyInvited = ['invited', 'invited_not_accepted', 'accepted'].includes(rawInvite)
    const isActive = rawAccount === 'active'
    return alreadyInvited || isActive ? 'reinvite' : 'invite'
  }

  const canDeactivateToEndUser = (current: any) => {
    const role = String(current?.role || '').trim().toUpperCase()
    if (current?.isServiceAccount) return true
    return role !== 'USER'
  }

  const isDeactivatedAccount = (current: any) => {
    const role = String(current?.role || '').trim().toUpperCase()
    const status = String(current?.status || '').trim().toUpperCase()
    if (role === 'USER' && !current?.isServiceAccount) return true
    return ['DEACTIVATED', 'DISABLED', 'INACTIVE'].includes(status)
  }

  const permissionCards = React.useMemo(() => {
    const entries = (
      (permissionSnapshot as any)?.permissions
      || (permissionSnapshot as any)?.permissionRows
      || (permissionSnapshot as any)?.data?.permissions
      || []
    ) as PermissionEntry[]
    const moduleMap = new Map<string, Map<string, Record<PermissionColumn, string[]>>>()
    entries.forEach((entry) => {
      const moduleKey = String(entry.module || 'module').trim().toLowerCase() || 'module'
      const queueKey = String(entry.queue || 'Default').trim() || 'Default'
      const action = normalizeActionToColumn(`${entry.action || ''} ${entry.label || ''}`)
      if (!moduleMap.has(moduleKey)) moduleMap.set(moduleKey, new Map())
      const rowMap = moduleMap.get(moduleKey)!
      if (!rowMap.has(queueKey)) {
        rowMap.set(queueKey, { view: [], create: [], access: [], edit: [], export: [] })
      }
      rowMap.get(queueKey)![action].push(entry.permissionKey)
    })

    return Array.from(moduleMap.entries()).map(([moduleKey, rows]) => ({
      moduleKey,
      moduleLabel: titleCase(moduleKey.replace(/_/g, ' ')),
      rows: Array.from(rows.entries()).map(([team, cells]) => ({
        team,
        cells,
      })),
    }))
  }, [permissionSnapshot])

  const usersLeftPanel = (!embedded && !isAgentsMode && !leftPanelCollapsed && queueRoot)
    ? createPortal(
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
                <button className="queue-title-btn" onClick={() => navigate('/users')} title="Go to users list">
                  <div className="queue-title-text">Users</div>
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
            <div className="queue-item queue-item-active" onClick={() => navigate('/users')}>
              <div className="queue-avatar">UL</div>
              <div className="queue-name">User List</div>
            </div>
          </div>
        </aside>,
        queueRoot
      )
    : null

  const userName = formatText(user?.name)
  const userEmail = formatText(user?.workEmail || user?.email)
  const avatarInitial = String(userName || 'U').charAt(0).toUpperCase()
  const roleValue = formatText(user?.role)
  const inviteValue = formatInviteStatus(permissionSnapshot?.user?.inviteStatus)
  const statusValue = formatAccountStatus(user?.status || permissionSnapshot?.user?.status)
  const languageValue = formatText(user?.language || 'English')
  const workPhoneValue = formatText(user?.workPhone || user?.phone)
  const inviteRaw = String(permissionSnapshot?.user?.inviteStatus || user?.inviteStatus || '')
  const statusRaw = String(user?.status || permissionSnapshot?.user?.status || '')
  const inviteActionMode = getInviteActionMode(inviteRaw, statusRaw)
  const inviteActionLabel = inviteActionMode === 'reinvite' ? 'Reactivate' : 'Invite'
  const activeStatusLabel = isDeactivatedAccount(user) ? 'Inactive' : 'Active'
  const canDelete = isDeactivatedAccount(user)
  const canDeactivate = canDeactivateToEndUser(user) && !isDeactivatedAccount(user)

  const togglePermissionCell = (keys: string[]) => {
    if (!permissionEditing || keys.length === 0) return
    const allChecked = keys.every((k) => Boolean(permissionDraft[k]))
    const next = { ...permissionDraft }
    keys.forEach((k) => { next[k] = !allChecked })
    setPermissionDraft(next)
  }

  const savePermissions = async () => {
    if (!permissionSnapshot || !Number.isFinite(numericId) || numericId <= 0) return
    try {
      setPermissionSaving(true)
      const next = await saveUserPermissions(numericId, {
        role: String(permissionSnapshot.user?.role || user?.role || 'USER'),
        templateKey: permissionSnapshot.selectedTemplateKey || 'custom',
        permissions: permissionDraft,
        autoSwitchCustom: true,
      })
      const snapshot = next as PermissionSnapshot
      setPermissionSnapshot(snapshot)
      const rawPermissions = (snapshot as any)?.permissions
        || (snapshot as any)?.permissionRows
        || (snapshot as any)?.data?.permissions
        || []
      const map = (rawPermissions || []).reduce<Record<string, boolean>>((acc: Record<string, boolean>, p: PermissionEntry) => {
        acc[p.permissionKey] = Boolean(p.allowed)
        return acc
      }, {})
      setPermissionDraft(map)
      setPermissionEditing(false)
    } finally {
      setPermissionSaving(false)
    }
  }

  const handleSaveProfile = async () => {
    if (!user?.id) return
    const payload = {
      email: profileDraft.email.trim() || undefined,
      workEmail: profileDraft.email.trim() || undefined,
      mobilePhone: profileDraft.mobilePhone.trim() || undefined,
      designation: profileDraft.designation.trim() || undefined,
      location: profileDraft.location.trim() || undefined,
      company: profileDraft.company.trim() || undefined,
      signature: profileDraft.signature.trim() || undefined,
    }
    await updateUser(Number(user.id), payload)
    const next = { ...user, ...payload }
    setUser(next)
    onUserUpdated?.(next)
  }

  const handleSaveAll = async () => {
    if (actionBusy) return
    try {
      setActionBusy(true)
      await handleSaveProfile()
      if (permissionEditing) {
        await savePermissions()
      }
      setEditMode(false)
      setPermissionEditing(false)
    } catch (err: any) {
      notifyAction('error', err?.response?.data?.error || 'Failed to save updates')
    } finally {
      setActionBusy(false)
    }
  }

  const handleCancelEdit = () => {
    if (!user) return
    setProfileDraft({
      email: String(user?.email || user?.workEmail || ''),
      mobilePhone: String(user?.mobilePhone || ''),
      designation: String(user?.designation || ''),
      location: String(user?.location || user?.site || ''),
      company: String(user?.company || user?.client || ''),
      signature: String(user?.signature || ''),
    })
    const rawPermissions = (permissionSnapshot as any)?.permissions
      || (permissionSnapshot as any)?.permissionRows
      || (permissionSnapshot as any)?.data?.permissions
      || []
    const reset = (rawPermissions || []).reduce<Record<string, boolean>>((acc: Record<string, boolean>, p: PermissionEntry) => {
      acc[p.permissionKey] = Boolean(p.allowed)
      return acc
    }, {})
    setPermissionDraft(reset)
    setPermissionEditing(false)
    setEditMode(false)
  }

  return (
    <>
      {usersLeftPanel}
      <div className={`agent-detail-shell${embedded ? ' embedded' : ''}`}>
        {loading && !user ? <div className="asset-detail-feedback">Loading user details...</div> : null}
        {error ? <div className="asset-detail-feedback error">{error}</div> : null}
        {actionToast ? <div className={`rbac-toast ${actionToast.type}`}>{actionToast.text}</div> : null}

        {!loading && user ? (
          <section className="agent-detail-surface">
            <div className="agent-detail-head">
              <h2>Agent details</h2>
              <div className="agent-detail-actions">
                {embedded && (
                  <button type="button" className="admin-settings-ghost" onClick={onClose}>
                    Back to list
                  </button>
                )}
                {!editMode ? (
                  <button
                    type="button"
                    className="admin-settings-ghost"
                    onClick={() => {
                      setEditMode(true)
                      setPermissionEditing(true)
                    }}
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button type="button" className="admin-settings-ghost" onClick={handleCancelEdit} disabled={actionBusy}>
                      Cancel
                    </button>
                    <button type="button" className="admin-settings-primary" onClick={handleSaveAll} disabled={actionBusy}>
                      {actionBusy ? 'Saving...' : 'Save'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="admin-settings-ghost"
                  onClick={async () => {
                    if (!user?.id || actionBusy) return
                    const email = String(user?.email || user?.workEmail || '').trim()
                    if (!email) {
                      notifyAction('error', 'Selected user mail ID is missing')
                      return
                    }
                    try {
                      setActionBusy(true)
                      if (inviteActionMode === 'invite') {
                        await sendServiceAccountInvite(Number(user.id), email)
                        notifyAction('ok', `Service account invite sent to ${email}`)
                      } else {
                        await reinviteServiceAccount(Number(user.id), email)
                        notifyAction('ok', `Reactivation email sent to ${email}`)
                      }
                    } catch (err: any) {
                      notifyAction('error', err?.response?.data?.error || 'Failed to process invite')
                    } finally {
                      setActionBusy(false)
                    }
                  }}
                  disabled={actionBusy || !String(user?.email || user?.workEmail || '').trim()}
                >
                  {inviteActionLabel}
                </button>
                <button
                  type="button"
                  className="admin-settings-danger"
                  onClick={async () => {
                    if (!user?.id || actionBusy) return
                    if (!canDeactivateToEndUser(user)) {
                      notifyAction('ok', 'User is already a normal end user')
                      return
                    }
                    try {
                      setActionBusy(true)
                      await updateUser(Number(user.id), { role: 'USER', isServiceAccount: false, status: 'DEACTIVATED' })
                      notifyAction('ok', 'User converted to End User')
                      setUser((prev: any) => {
                        const next = { ...prev, role: 'USER', isServiceAccount: false, status: 'DEACTIVATED' }
                        onUserUpdated?.(next)
                        return next
                      })
                    } catch (err: any) {
                      notifyAction('error', err?.response?.data?.error || 'Failed to convert user')
                    } finally {
                      setActionBusy(false)
                    }
                  }}
                  disabled={actionBusy || !canDeactivate}
                >
                  Deactivate
                </button>
                <button
                  type="button"
                  className={user?.mfaEnabled ? 'admin-settings-ghost' : 'admin-settings-primary'}
                  onClick={async () => {
                    if (!user?.id || actionBusy) return
                    try {
                      setActionBusy(true)
                      await updateUserMfaSettings(Number(user.id), !user?.mfaEnabled)
                      setUser((prev: any) => {
                        const next = { ...prev, mfaEnabled: !prev?.mfaEnabled }
                        onUserUpdated?.(next)
                        return next
                      })
                      notifyAction('ok', user?.mfaEnabled ? '2FA disabled' : '2FA enabled')
                    } catch (err: any) {
                      notifyAction('error', err?.response?.data?.error || 'Failed to update 2FA')
                    } finally {
                      setActionBusy(false)
                    }
                  }}
                  disabled={actionBusy}
                >
                  {user?.mfaEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                </button>
                <button
                  type="button"
                  className="admin-settings-danger"
                  onClick={async () => {
                    if (!user?.id || actionBusy) return
                    if (!isDeactivatedAccount(user)) {
                      notifyAction('error', 'Only deactivated accounts can be deleted')
                      return
                    }
                    if (!window.confirm(`Delete ${user?.name || user?.email || `User #${user?.id}`}? This action cannot be undone.`)) return
                    try {
                      setActionBusy(true)
                      await deleteUser(Number(user.id))
                      notifyAction('ok', 'User deleted successfully')
                      onUserDeleted?.(Number(user.id))
                      if (!embedded) navigate('/admin')
                    } catch (err: any) {
                      notifyAction('error', err?.response?.data?.error || 'Failed to delete user')
                    } finally {
                      setActionBusy(false)
                    }
                  }}
                  disabled={actionBusy || !canDelete}
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="agent-status-strip-wrap">
              <div className="agent-status-strip">
                <div className="agent-status-item">
                  <span>Agent Name</span>
                  <strong>{userName}</strong>
                </div>
                <div className="agent-status-item">
                  <span>Role</span>
                  <strong>{roleValue}</strong>
                </div>
                <div className="agent-status-item">
                  <span>Invite Status</span>
                  <strong>{inviteValue}</strong>
                </div>
                <div className="agent-status-item">
                  <span>Status</span>
                  <strong>{statusValue}</strong>
                </div>
                <div className="agent-status-item">
                  <span>2FA</span>
                  <strong>{user?.mfaEnabled ? 'Enabled' : 'Disabled'}</strong>
                </div>
              <div className="agent-status-item">
                <span>Active Status</span>
                <strong>{activeStatusLabel}</strong>
              </div>
            </div>
            </div>

            <nav className="agent-tab-row" aria-label="Agent detail tabs">
              {profileTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={activeTab === tab.key ? 'active' : ''}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </nav>

            <div className="agent-tab-panel">
              {activeTab === 'profile' && (
                <section className="agent-card">
                  <div className="agent-kv-grid">
                    <div>
                      <span>Email</span>
                      {editMode ? (
                        <input
                          className="agent-edit-input"
                          value={profileDraft.email}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, email: e.target.value }))}
                        />
                      ) : (
                        <strong>{userEmail}</strong>
                      )}
                    </div>
                    <div>
                      <span>Mobile Phone</span>
                      {editMode ? (
                        <input
                          className="agent-edit-input"
                          value={profileDraft.mobilePhone}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, mobilePhone: e.target.value }))}
                        />
                      ) : (
                        <strong>{formatText(user?.mobilePhone)}</strong>
                      )}
                    </div>
                    <div>
                      <span>Title</span>
                      {editMode ? (
                        <input
                          className="agent-edit-input"
                          value={profileDraft.designation}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, designation: e.target.value }))}
                        />
                      ) : (
                        <strong>{formatText(user?.designation)}</strong>
                      )}
                    </div>
                    <div><span>Location</span><strong>{formatText(user?.location || user?.site)}</strong></div>
                    <div>
                      <span>Company</span>
                      {editMode ? (
                        <input
                          className="agent-edit-input"
                          value={profileDraft.company}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, company: e.target.value }))}
                        />
                      ) : (
                        <strong>{formatText(user?.company || user?.client)}</strong>
                      )}
                    </div>
                    <div className="full">
                      <span>Signature</span>
                      {editMode ? (
                        <textarea
                          className="agent-edit-textarea"
                          rows={3}
                          value={profileDraft.signature}
                          onChange={(e) => setProfileDraft((prev) => ({ ...prev, signature: e.target.value }))}
                        />
                      ) : (
                        <strong>{formatText(user?.signature)}</strong>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {activeTab === 'permissions' && (
                <section className="agent-card">
                  <div className="agent-card-head">
                    <h4>Permissions</h4>
                    <div className="agent-card-head-actions">
                      {!permissionEditing ? (
                        <button type="button" className="admin-settings-ghost" onClick={() => setPermissionEditing(true)}>Edit</button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="admin-settings-ghost"
                            onClick={() => {
                              const rawPermissions = (permissionSnapshot as any)?.permissions
                                || (permissionSnapshot as any)?.permissionRows
                                || (permissionSnapshot as any)?.data?.permissions
                                || []
                              const reset = (rawPermissions || []).reduce<Record<string, boolean>>((acc: Record<string, boolean>, p: PermissionEntry) => {
                                acc[p.permissionKey] = Boolean(p.allowed)
                                return acc
                              }, {})
                              setPermissionDraft(reset)
                              setPermissionEditing(false)
                            }}
                          >
                            Cancel
                          </button>
                          <button type="button" className="admin-settings-primary" onClick={savePermissions} disabled={permissionSaving}>
                            {permissionSaving ? 'Saving...' : 'Save'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {permissionCards.length === 0 ? (
                    <div className="agent-empty">No permissions found.</div>
                  ) : (
                    <div className="agent-permission-cards">
                      {permissionCards.map((card) => (
                        <article key={card.moduleKey} className="agent-permission-card">
                          <div className="agent-perm-title">{card.moduleLabel}</div>
                          <table className="agent-perm-matrix">
                            <thead>
                              <tr>
                                <th>Team</th>
                                <th>view</th>
                                <th>create</th>
                                <th>access</th>
                                <th>edit</th>
                                <th>export</th>
                              </tr>
                            </thead>
                            <tbody>
                              {card.rows.map((row) => (
                                <tr key={`${card.moduleKey}-${row.team}`}>
                                  <td>{row.team}</td>
                                  {(['view', 'create', 'access', 'edit', 'export'] as PermissionColumn[]).map((col) => {
                                    const keys = row.cells[col]
                                    const checkedCount = keys.filter((k) => Boolean(permissionDraft[k])).length
                                    const checked = keys.length > 0 && checkedCount === keys.length
                                    const indeterminate = checkedCount > 0 && checkedCount < keys.length
                                    return (
                                      <td key={`${row.team}-${col}`}>
                                        {keys.length === 0 ? (
                                          <span className="agent-perm-na">-</span>
                                        ) : (
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            ref={(el) => { if (el) el.indeterminate = indeterminate }}
                                            onChange={() => togglePermissionCell(keys)}
                                            disabled={!permissionEditing}
                                          />
                                        )}
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'documents' && <div className="agent-empty">No documents to show.</div>}
              {activeTab === 'tickets' && <div className="agent-empty">No open and pending tickets for this agent</div>}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}
