import React, { useEffect, useMemo, useState } from 'react'
import {
  createRbacUser,
  getUserPermissions,
  listRbacUsers,
  markInvitePending,
  saveUserPermissions,
  sendUserInvite,
  type RbacUserRow,
} from '../services/rbac.service'

type Props = {
  isAdmin: boolean
}

type PermissionEntry = {
  permissionKey: string
  module: string
  queue: string | null
  action: string
  label: string
  allowed: boolean
}

type PermissionTemplate = {
  key: string
  label: string
  baseRole: string
  permissions: Record<string, boolean>
}

type Snapshot = {
  user: { id: number; name: string | null; email: string; role: string; status: string; inviteStatus: string }
  permissions: PermissionEntry[]
  modules?: { key: string; label: string; sortOrder: number }[]
  permissionTemplates: PermissionTemplate[]
  selectedTemplateKey?: string
}

const customTemplate: PermissionTemplate = {
  key: 'custom',
  label: 'Custom',
  baseRole: 'CUSTOM',
  permissions: {},
}

const fallbackTemplates: PermissionTemplate[] = [
  { key: 'support_desk', label: 'Support Desk', baseRole: 'USER', permissions: {} },
  { key: 'hr_queue', label: 'HR Queue', baseRole: 'USER', permissions: {} },
  { key: 'management', label: 'Management', baseRole: 'ADMIN', permissions: {} },
  { key: 'account', label: 'Account', baseRole: 'USER', permissions: {} },
  { key: 'supplier_queue', label: 'Supplier Queue', baseRole: 'SUPPLIER', permissions: {} },
]

const fallbackCards = [
  { id: 'dashboard', title: 'Dashboard', items: ['View Dashboard', 'Analytics', 'KPI View'] },
  { id: 'tickets', title: 'Tickets', items: ['View Ticket', 'Create Ticket', 'Assign Ticket', 'Respond to Ticket'] },
  { id: 'assets', title: 'Assets', items: ['View Asset', 'Create Asset', 'Edit Asset', 'Delete Asset'] },
  { id: 'users', title: 'Users', items: ['View User', 'Create User', 'Edit User', 'Delete User'] },
  { id: 'suppliers', title: 'Suppliers', items: ['View Supplier', 'Create Supplier', 'Edit Supplier', 'Delete Supplier'] },
  { id: 'accounts', title: 'Accounts', items: ['View Account', 'Create Account', 'Edit Account', 'Delete Account'] },
  { id: 'reports', title: 'Reports', items: ['View Report', 'Export Report'] },
  { id: 'admin', title: 'Admin', items: ['View Admin', 'Create Admin', 'Edit Admin', 'Delete Admin'] },
]

function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

function displayPermissionLabel(label: string) {
  return label.startsWith('View ') ? label.replace(/^View\s+/, 'Read ') : label
}

export default function RbacModule({ isAdmin }: Props) {
  const [users, setUsers] = useState<RbacUserRow[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [selectedRole, setSelectedRole] = useState('USER')
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('support_desk')
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({})
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [customActionsByModule, setCustomActionsByModule] = useState<Record<string, PermissionEntry[]>>({})
  const [initialState, setInitialState] = useState<{ role: string; templateKey: string; permissions: Record<string, boolean> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addStep, setAddStep] = useState<1 | 2>(1)
  const [createdUserId, setCreatedUserId] = useState<number | null>(null)
  const [modalError, setModalError] = useState('')
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    phone: '',
    defaultPermissionTemplate: '',
  })

  const notify = (type: 'ok' | 'error', text: string) => {
    setToast({ type, text })
    window.setTimeout(() => setToast(null), 2200)
  }

  const isFallbackPermissionKey = (key: string) => key.startsWith('ui_fallback_')
  const isPermissionChecked = (key: string) => {
    if (Object.prototype.hasOwnProperty.call(permissions, key)) return Boolean(permissions[key])
    return isFallbackPermissionKey(key)
  }

  const getUserOptionLabel = (u: RbacUserRow) => {
    return `${u.email} | ${u.name || 'No name'} | ${titleCase(u.role)} | ${titleCase(u.inviteStatus || u.status || 'none')}`
  }

  const loadUsers = async () => {
    try {
      const data = await listRbacUsers({ q: userSearch, limit: 500 })
      const list = Array.isArray(data) ? data : []
      setUsers(list)
      if (!selectedUserId && list.length > 0) {
        setSelectedUserId(Number(list[0].id))
      }
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to load users')
    }
  }

  const loadPermissions = async (userId: number) => {
    setLoading(true)
    try {
      const data: Snapshot = await getUserPermissions(userId)
      const nextPermissions = data.permissions.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.permissionKey] = Boolean(item.allowed)
        return acc
      }, {})
      const nextTemplateKey = String(data.selectedTemplateKey || 'custom')
      setSnapshot(data)
      setSelectedRole(data.user.role || 'USER')
      setSelectedTemplateKey(nextTemplateKey)
      setPermissions(nextPermissions)
      setCustomActionsByModule({})
      setInitialState({ role: data.user.role || 'USER', templateKey: nextTemplateKey, permissions: nextPermissions })
      const moduleExpansion = (data.modules || []).reduce<Record<string, boolean>>((acc, moduleRow) => {
        const moduleItems = data.permissions.filter((p) => p.module === moduleRow.key && !p.queue)
        acc[moduleRow.key] = moduleItems.some((p) => Boolean(nextPermissions[p.permissionKey]))
        return acc
      }, {})
      setExpandedModules(moduleExpansion)
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to load user permissions')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadUsers() }, [userSearch]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedUserId) loadPermissions(selectedUserId) }, [selectedUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  const permissionTemplates = useMemo(() => {
    const templates = (snapshot?.permissionTemplates || []).length > 0 ? (snapshot?.permissionTemplates || []) : fallbackTemplates
    return [...templates, customTemplate]
  }, [snapshot])

  const templateByKey = useMemo(() => {
    return permissionTemplates.reduce<Record<string, PermissionTemplate>>((acc, template) => {
      acc[template.key] = template
      return acc
    }, {})
  }, [permissionTemplates])

  const permissionKeys = useMemo(() => (snapshot?.permissions || []).map((p) => p.permissionKey), [snapshot])

  const permissionCards = useMemo(() => {
    const modulesFromApi = (snapshot?.modules || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    const itemsFromApi = (snapshot?.permissions || []).filter((item) => !item.queue)
    const hasApiShape = modulesFromApi.length > 0 || itemsFromApi.length > 0

    if (hasApiShape) {
      const inferred = itemsFromApi
        .map((item) => item.module)
        .filter(Boolean)
        .filter((key, idx, arr) => arr.indexOf(key) === idx)
        .map((key) => ({ key, label: titleCase(key.replace(/_/g, ' ')), sortOrder: 999 }))

      const mergedModules = [...modulesFromApi]
      inferred.forEach((m) => {
        if (!mergedModules.some((x) => x.key === m.key)) mergedModules.push(m)
      })

      return mergedModules.map((moduleRow) => ({
        id: moduleRow.key,
        title: moduleRow.label,
        subtitle: 'Permission',
        items: [
          ...itemsFromApi
          .filter((item) => item.module === moduleRow.key)
          .sort((a, b) => a.label.localeCompare(b.label)),
          ...(customActionsByModule[moduleRow.key] || []),
        ],
      }))
    }

    return fallbackCards.map((card) => ({
      id: card.id,
      title: card.title,
      subtitle: 'Permission',
      items: [
        ...card.items.map((label, index) => ({
          permissionKey: `ui_fallback_${card.id}_${index}`,
          module: card.id,
          queue: null,
          action: label.toLowerCase().replace(/\s+/g, '_'),
          label,
          allowed: true,
        })),
        ...(customActionsByModule[card.id] || []),
      ],
    }))
  }, [snapshot, customActionsByModule])

  const isDirty = useMemo(() => {
    if (!initialState) return false
    return JSON.stringify({
      role: selectedRole,
      templateKey: selectedTemplateKey,
      permissions,
    }) !== JSON.stringify(initialState)
  }, [initialState, permissions, selectedRole, selectedTemplateKey])

  const resolveTemplateForPermissions = (nextPermissions: Record<string, boolean>) => {
    const templates = snapshot?.permissionTemplates || []
    const found = templates.find((template) =>
      permissionKeys.every((key) => Boolean(nextPermissions[key]) === Boolean(template.permissions[key]))
    )
    return found || customTemplate
  }

  const syncTemplateState = (nextPermissions: Record<string, boolean>) => {
    const matched = resolveTemplateForPermissions(nextPermissions)
    setSelectedTemplateKey(matched.key)
    setSelectedRole(matched.baseRole || 'CUSTOM')
  }

  const applyTemplate = (templateKey: string) => {
    if (!snapshot) return
    if (templateKey === 'custom') {
      setSelectedTemplateKey('custom')
      setSelectedRole('CUSTOM')
      return
    }
    const template = templateByKey[templateKey]
    if (!template) return
    const nextPermissions = { ...permissions }
    permissionKeys.forEach((key) => {
      nextPermissions[key] = Boolean(template.permissions[key])
    })
    setPermissions(nextPermissions)
    setSelectedTemplateKey(template.key)
    setSelectedRole(template.baseRole || 'USER')
    setExpandedModules((prev) => {
      const next = { ...prev }
      permissionCards.forEach((card) => {
        next[card.id] = card.items.some((item) => Boolean(nextPermissions[item.permissionKey]))
      })
      return next
    })
  }

  const setPermission = (permissionKey: string, allowed: boolean) => {
    const next = { ...permissions, [permissionKey]: allowed }
    setPermissions(next)
    const card = permissionCards.find((c) => c.items.some((item) => item.permissionKey === permissionKey))
    if (card) {
      const hasAnySelected = card.items.some((item) => Boolean(next[item.permissionKey]))
      setExpandedModules((prev) => ({ ...prev, [card.id]: hasAnySelected || Boolean(prev[card.id]) }))
    }
    syncTemplateState(next)
  }

  const toggleCardAll = (cardId: string, allowed: boolean) => {
    const card = permissionCards.find((c) => c.id === cardId)
    if (!card) return
    const next = { ...permissions }
    card.items.forEach((item) => { next[item.permissionKey] = allowed })
    setPermissions(next)
    setExpandedModules((prev) => ({ ...prev, [cardId]: allowed || Boolean(prev[cardId]) }))
    syncTemplateState(next)
  }

  const handleSave = async () => {
    if (!selectedUserId) return
    setSaving(true)
    try {
      const allowedKeySet = new Set(permissionKeys)
      const permissionsForSave = Object.entries(permissions).reduce<Record<string, boolean>>((acc, [key, value]) => {
        if (allowedKeySet.has(key)) acc[key] = value
        return acc
      }, {})

      const data: Snapshot = await saveUserPermissions(selectedUserId, {
        role: selectedRole,
        templateKey: selectedTemplateKey,
        permissions: permissionsForSave,
        autoSwitchCustom: true,
      })
      const nextPermissions = data.permissions.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.permissionKey] = Boolean(item.allowed)
        return acc
      }, {})
      const nextTemplateKey = String(data.selectedTemplateKey || 'custom')
      setSnapshot(data)
      setSelectedRole(data.user.role)
      setSelectedTemplateKey(nextTemplateKey)
      setPermissions(nextPermissions)
      setInitialState({ role: data.user.role, templateKey: nextTemplateKey, permissions: nextPermissions })
      notify('ok', 'Permissions updated successfully')
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to update permissions')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (!initialState) return
    setSelectedRole(initialState.role)
    setSelectedTemplateKey(initialState.templateKey)
    setPermissions({ ...initialState.permissions })
    setExpandedModules((prev) => {
      const next = { ...prev }
      permissionCards.forEach((card) => {
        next[card.id] = card.items.some((item) => Boolean(initialState.permissions[item.permissionKey]))
      })
      return next
    })
  }

  const toActionKey = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s_-]/g, '')
      .replace(/\s+/g, '_')

  const handleAddAction = (moduleId: string) => {
    const actionLabel = window.prompt('Enter action name')
    if (!actionLabel) return
    const trimmed = actionLabel.trim()
    if (!trimmed) return

    const actionKey = toActionKey(trimmed)
    if (!actionKey) {
      notify('error', 'Enter a valid action name')
      return
    }
    const permissionKey = `ui_custom_${moduleId}_${actionKey}`
    const moduleCard = permissionCards.find((card) => card.id === moduleId)
    if (!moduleCard) return

    if (moduleCard.items.some((item) => item.permissionKey === permissionKey || item.label.toLowerCase() === trimmed.toLowerCase())) {
      notify('error', 'Action already exists in this module')
      return
    }

    const item: PermissionEntry = {
      permissionKey,
      module: moduleId,
      queue: null,
      action: toActionKey(trimmed),
      label: trimmed,
      allowed: false,
    }

    setCustomActionsByModule((prev) => ({
      ...prev,
      [moduleId]: [...(prev[moduleId] || []), item],
    }))
    setPermissions((prev) => ({ ...prev, [permissionKey]: true }))
    notify('ok', `${trimmed} action added`)
  }

  const handleAddUser = async () => {
    setModalError('')
    if (!newUser.fullName.trim() || !newUser.email.trim()) {
      const msg = 'Full Name and Email are required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    try {
      const created = await createRbacUser({
        fullName: newUser.fullName.trim(),
        email: newUser.email.trim(),
        phone: newUser.phone.trim(),
        role: 'USER',
        defaultPermissionTemplate: newUser.defaultPermissionTemplate || undefined,
      })
      setCreatedUserId(Number(created.id))
      setAddStep(2)
      notify('ok', 'User created')
      await loadUsers()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Failed to create user'
      setModalError(msg)
      notify('error', msg)
    }
  }

  const resetAddModal = () => {
    setShowAddModal(false)
    setAddStep(1)
    setCreatedUserId(null)
    setModalError('')
    setNewUser({ fullName: '', email: '', phone: '', defaultPermissionTemplate: '' })
  }

  const handleInviteNow = async () => {
    if (!createdUserId) return
    try {
      await sendUserInvite(createdUserId)
      notify('ok', 'Invite sent successfully')
      resetAddModal()
      await loadUsers()
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to send invite')
    }
  }

  const handleInviteLater = async () => {
    if (!createdUserId) return
    try {
      await markInvitePending(createdUserId)
      notify('ok', 'Invite marked as pending')
      resetAddModal()
      await loadUsers()
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to mark invite pending')
    }
  }

  const handleReInvite = async () => {
    if (!selectedUserId || !snapshot) return
    if (!['invite_pending', 'invited_not_accepted'].includes(snapshot.user.inviteStatus)) return
    try {
      await sendUserInvite(selectedUserId)
      notify('ok', 'Invite sent successfully')
      await loadPermissions(selectedUserId)
      await loadUsers()
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to re-invite user')
    }
  }

  return (
    <section className="admin-settings-card rbac-module-card">
      <div className="rbac-shell-head">
        <h3>Permission Management</h3>
      </div>

      <div className="rbac-top-controls">
        <div className="rbac-select-field">
          <select
            value={selectedUserId ?? ''}
            onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
            disabled={loading || users.length === 0}
          >
            <option value="">Select User</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {getUserOptionLabel(u)}
              </option>
            ))}
          </select>
        </div>

        <div className="rbac-header-actions">
          <button className="rbac-add-btn" onClick={() => setShowAddModal(true)} disabled={!isAdmin}>
            + Add User
          </button>
          <button
            className="rbac-reinvite-btn"
            onClick={handleReInvite}
            disabled={!isAdmin || !snapshot || !['invite_pending', 'invited_not_accepted'].includes(snapshot.user.inviteStatus)}
          >
            Re-Invite
          </button>
        </div>
      </div>

      <div className="rbac-module-strip">
        {permissionCards.map((card) => {
          const anyChecked = card.items.some((item) => isPermissionChecked(item.permissionKey))
          return (
            <label key={`strip-${card.id}`} className="rbac-strip-item">
              <input
                type="checkbox"
                checked={anyChecked}
                onChange={(e) => toggleCardAll(card.id, e.target.checked)}
                disabled={!isAdmin || card.items.length === 0}
              />
              <span>{card.title}</span>
            </label>
          )
        })}
      </div>

      <div className="rbac-modules-grid">
        {permissionCards.map((card) => {
          const allChecked = card.items.length > 0 && card.items.every((item) => isPermissionChecked(item.permissionKey))
          return (
            <section key={card.id} className="rbac-module-block">
              <header className="rbac-module-head">
                <div className="rbac-module-toggle" role="presentation">
                  <span className="rbac-module-title">{card.title}</span>
                  <span className="rbac-module-subtitle">{card.subtitle}</span>
                </div>
                <label className="rbac-select-all">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={(e) => toggleCardAll(card.id, e.target.checked)}
                    disabled={!isAdmin || card.items.length === 0}
                  />
                  <span>Select All</span>
                </label>
              </header>
              <div className="rbac-permission-grid">
                {card.items.map((item) => (
                  <label key={item.permissionKey} className="rbac-permission-item">
                    <input
                      type="checkbox"
                      checked={isPermissionChecked(item.permissionKey)}
                      onChange={(e) => setPermission(item.permissionKey, e.target.checked)}
                      disabled={!isAdmin}
                    />
                    <span>{displayPermissionLabel(item.label)}</span>
                  </label>
                ))}
              </div>
              <div className="rbac-module-footer">
                <button type="button" className="rbac-add-action-btn" disabled={!isAdmin} onClick={() => handleAddAction(card.id)}>
                  + Add Action
                </button>
              </div>
            </section>
          )
        })}
      </div>

      <div className="rbac-sticky-actions">
        <button className="rbac-close-btn" onClick={handleClose}>Close</button>
        <button className="rbac-update-btn" onClick={handleSave} disabled={!isDirty || saving || !selectedUserId}>
          {saving ? 'Updating...' : 'Update'}
        </button>
      </div>

      {toast && <div className={`rbac-toast ${toast.type}`}>{toast.text}</div>}

      {showAddModal && (
        <div className="modal-overlay" onClick={resetAddModal}>
          <div className="modal-content rbac-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Add / Invite New User</h3>
              <button className="modal-close" onClick={resetAddModal}>x</button>
            </div>
            <div className="modal-body">
              {modalError && <div className="rbac-modal-error">{modalError}</div>}
              {addStep === 1 && (
                <div className="rbac-modal-grid">
                  <label>Full Name<input value={newUser.fullName} onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))} /></label>
                  <label>Email<input value={newUser.email} onChange={(e) => setNewUser((p) => ({ ...p, email: e.target.value }))} /></label>
                  <label>Phone<input value={newUser.phone} onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))} /></label>
                  <label>Default Permission
                    <select value={newUser.defaultPermissionTemplate} onChange={(e) => setNewUser((p) => ({ ...p, defaultPermissionTemplate: e.target.value }))}>
                      <option value="">Select template</option>
                      {(snapshot?.permissionTemplates || []).map((opt) => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {addStep === 2 && (
                <div className="rbac-invite-step">
                  <p>User saved. Choose invite action:</p>
                  <div className="rbac-invite-buttons">
                    <button className="admin-settings-primary" onClick={handleInviteNow}>Invite Now</button>
                    <button className="admin-settings-ghost" onClick={handleInviteLater}>Invite Later</button>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              {addStep === 1 && <button className="admin-settings-primary" onClick={handleAddUser}>Save</button>}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
