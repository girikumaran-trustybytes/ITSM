import React, { useEffect, useMemo, useState } from 'react'
import {
  createRbacUser,
  getUserPermissions,
  listRbacUsers,
  markInvitePending,
  reinviteServiceAccount,
  saveUserPermissions,
  sendServiceAccountInvite,
  sendUserInvite,
  type RbacUserRow,
} from '../services/rbac.service'
import { updateUser } from '../services/user.service'
import { primarySidebarModules } from './PrimarySidebar'
import { loadLeftPanelConfig } from '../utils/leftPanelConfig'

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

type ServiceAccountView = 'none' | 'picker' | 'existing-user' | 'new-user'

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

const fallbackActionLabelsByModuleId: Record<string, string[]> = {
  dashboard: ['View Dashboard', 'Analytics', 'KPI View'],
  tickets: ['View Ticket', 'Create Ticket', 'Assign Ticket', 'Respond to Ticket'],
  assets: ['View Asset', 'Create Asset', 'Edit Asset', 'Delete Asset'],
  users: ['View User', 'Create User', 'Edit User', 'Delete User'],
  suppliers: ['View Supplier', 'Create Supplier', 'Edit Supplier', 'Delete Supplier'],
  accounts: ['View Account', 'Create Account', 'Edit Account', 'Delete Account'],
  reports: ['View Report', 'Export Report'],
  admin: ['View Admin', 'Create Admin', 'Edit Admin', 'Delete Admin'],
}

const fallbackCards = primarySidebarModules.map((module) => ({
  id: module.id,
  title: module.label,
  items: fallbackActionLabelsByModuleId[module.id] || [
    `Read ${module.label}`,
    `Create ${module.label}`,
    `Edit ${module.label}`,
    `Delete ${module.label}`,
    `Export ${module.label}`,
  ],
}))

const hiddenPermissionLabels = new Set(['hi'])
const UI_PERMISSION_STORAGE_KEY = 'itsm_ui_permissions_v1'
const permissionMatrixColumns = [
  { key: 'all', label: 'all' },
  { key: 'read', label: 'read' },
  { key: 'create', label: 'create' },
  { key: 'edit', label: 'edit' },
  { key: 'delete', label: 'delete' },
  { key: 'export', label: 'export' },
] as const
const forcedMatrixColumnsByModule: Record<string, Array<'edit' | 'export'>> = {
  tickets: ['edit', 'export'],
  assets: ['export'],
  users: ['export'],
  suppliers: ['export'],
  reports: ['edit'],
}

type PermissionMatrixColumnKey = (typeof permissionMatrixColumns)[number]['key']

function loadUiPermissionRows(): Record<string, Record<string, boolean>> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(UI_PERMISSION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, Record<string, boolean>>
  } catch {
    return {}
  }
}

function saveUiPermissionRows(next: Record<string, Record<string, boolean>>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(UI_PERMISSION_STORAGE_KEY, JSON.stringify(next))
}

function slugifyQueueId(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function loadAdminQueueOptions() {
  const cfg = loadLeftPanelConfig()
  const rules = Array.isArray(cfg?.ticketsMyLists) ? cfg.ticketsMyLists : []
  const seen = new Set<string>()
  return rules
    .map((rule) => {
      const rawId = String(rule?.id || '')
      const rawLabel = String(rule?.label || '').trim()
      if (!rawLabel) return null
      const normalizedId = rawId || `queue-${slugifyQueueId(rawLabel)}`
      const id = `team-${slugifyQueueId(normalizedId || rawLabel)}`
      if (seen.has(id)) return null
      seen.add(id)
      return { id, label: rawLabel }
    })
    .filter((row): row is { id: string; label: string } => Boolean(row))
}

function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
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
    mailId: '',
    phone: '',
    employeeId: '',
    designation: '',
    department: '',
    manager: '',
    dateOfJoining: '',
    employmentType: 'Full-time',
    workMode: 'Onsite',
    defaultPermissionTemplate: '',
  })
  const [serviceAccountView, setServiceAccountView] = useState<ServiceAccountView>('none')
  const [serviceExistingUserId, setServiceExistingUserId] = useState<number | null>(null)
  const [newServiceUserId, setNewServiceUserId] = useState<number | null>(null)
  const [convertToServiceAccount, setConvertToServiceAccount] = useState(false)
  const [autoUpgradeQueues, setAutoUpgradeQueues] = useState(true)
  const [selectedServiceQueueIds, setSelectedServiceQueueIds] = useState<string[]>([])
  const [serviceInviteBusy, setServiceInviteBusy] = useState(false)

  const notify = (type: 'ok' | 'error', text: string) => {
    setToast({ type, text })
    window.setTimeout(() => setToast(null), 2200)
  }

  const isPermissionChecked = (key: string) => {
    if (!selectedUserId) return false
    if (Object.prototype.hasOwnProperty.call(permissions, key)) return Boolean(permissions[key])
    return false
  }

  const getUserOptionLabel = (u: RbacUserRow) => {
    return `${u.email} | ${u.name || 'No name'} | ${titleCase(u.role)} | ${titleCase(u.inviteStatus || u.status || 'none')}`
  }

  const loadUsers = async () => {
    try {
      const data = await listRbacUsers({ q: userSearch, limit: 500 })
      const list = Array.isArray(data) ? data : []
      setUsers(list)
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to load users')
    }
  }

  const loadPermissions = async (userId: number) => {
    setLoading(true)
    try {
      const data: Snapshot = await getUserPermissions(userId)
      const nextPermissionsFromApi = data.permissions.reduce<Record<string, boolean>>((acc, item) => {
        acc[item.permissionKey] = Boolean(item.allowed)
        return acc
      }, {})
      const uiRows = loadUiPermissionRows()
      const uiPermissions = uiRows[String(userId)] || {}
      const nextPermissions = { ...nextPermissionsFromApi, ...uiPermissions }
      const nextTemplateKey = String(data.selectedTemplateKey || 'custom')
      setSnapshot(data)
      setSelectedRole(data.user.role || 'USER')
      setSelectedTemplateKey(nextTemplateKey)
      setPermissions(nextPermissions)
      setInitialState({ role: data.user.role || 'USER', templateKey: nextTemplateKey, permissions: nextPermissions })
      const moduleExpansion = (data.modules || []).reduce<Record<string, boolean>>((acc, moduleRow) => {
        const moduleItems = data.permissions.filter((p) => p.module === moduleRow.key && !p.queue)
        acc[moduleRow.key] = moduleItems.some((p) => Boolean(nextPermissionsFromApi[p.permissionKey]))
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
  useEffect(() => {
    if (selectedUserId) {
      loadPermissions(selectedUserId)
      return
    }
    setSnapshot(null)
    setPermissions({})
    setInitialState(null)
  }, [selectedUserId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    const getColumnForEntry = (item: PermissionEntry): Exclude<PermissionMatrixColumnKey, 'all'> => {
      const text = `${item.action || ''} ${item.label || ''}`.toLowerCase()
      if (text.includes('create') || text.includes('add')) return 'create'
      if (text.includes('edit') || text.includes('update')) return 'edit'
      if (text.includes('delete') || text.includes('remove')) return 'delete'
      if (text.includes('export')) return 'export'
      return 'read'
    }

    const withForcedMatrixItems = (moduleId: string, items: PermissionEntry[]) => {
      const required = forcedMatrixColumnsByModule[moduleId] || []
      if (required.length === 0) return items
      const next = [...items]
      required.forEach((column) => {
        if (next.some((item) => getColumnForEntry(item) === column)) return
        const moduleLabel = titleCase(moduleId.replace(/_/g, ' '))
        next.push({
          permissionKey: `ui_matrix_${moduleId}_${column}`,
          module: moduleId,
          queue: null,
          action: column,
          label: `${titleCase(column)} ${moduleLabel}`,
          allowed: false,
        })
      })
      return next
    }

    const modulesFromApi = (snapshot?.modules || []).slice().sort((a, b) => a.sortOrder - b.sortOrder)
    const itemsFromApi = (snapshot?.permissions || []).filter((item) => {
      if (item.queue) return false
      return !hiddenPermissionLabels.has(item.label.trim().toLowerCase())
    })
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
      primarySidebarModules.forEach((m, index) => {
        if (!mergedModules.some((x) => x.key === m.id)) {
          mergedModules.push({ key: m.id, label: m.label, sortOrder: 1000 + index })
        }
      })

      return mergedModules.map((moduleRow) => ({
        id: moduleRow.key,
        title: moduleRow.label,
        subtitle: 'Permission',
        items: withForcedMatrixItems(moduleRow.key, [
          ...itemsFromApi
          .filter((item) => item.module === moduleRow.key)
          .sort((a, b) => a.label.localeCompare(b.label)),
        ]),
      }))
    }

    return fallbackCards.map((card) => ({
      id: card.id,
      title: card.title,
      subtitle: 'Permission',
        items: withForcedMatrixItems(card.id, [
          ...card.items.map((label, index) => ({
            permissionKey: `ui_fallback_${card.id}_${index}`,
          module: card.id,
          queue: null,
          action: label.toLowerCase().replace(/\s+/g, '_'),
            label,
            allowed: true,
          })),
        ]),
      }))
  }, [snapshot])

  const isDirty = useMemo(() => {
    if (!initialState) return false
    return JSON.stringify({
      role: selectedRole,
      templateKey: selectedTemplateKey,
      permissions,
    }) !== JSON.stringify(initialState)
  }, [initialState, permissions, selectedRole, selectedTemplateKey])

  const [ticketQueueOptions, setTicketQueueOptions] = useState<{ id: string; label: string }[]>(() => loadAdminQueueOptions())

  const activeServiceUserId = serviceAccountView === 'existing-user' ? serviceExistingUserId : newServiceUserId
  const activeServiceUser = useMemo(() => {
    const targetUserId = Number(activeServiceUserId || 0)
    if (!targetUserId) return null
    return users.find((u) => Number(u.id) === targetUserId) || null
  }, [activeServiceUserId, users])

  const activeServiceInviteStatus = String(activeServiceUser?.inviteStatus || 'none').toLowerCase()
  const canInviteServiceAccount = ['none', 'invite_pending'].includes(activeServiceInviteStatus)
  const canReinviteServiceAccount = ['invite_pending', 'invited_not_accepted'].includes(activeServiceInviteStatus)
  const isActiveServiceAccountRole = String(activeServiceUser?.role || '').toUpperCase() === 'AGENT'

  const activeServiceAccountExists = Boolean(activeServiceUser?.isServiceAccount)

  const resetServiceAccountFlow = () => {
    setServiceAccountView('none')
    setServiceExistingUserId(null)
    setNewServiceUserId(null)
    setConvertToServiceAccount(false)
    setAutoUpgradeQueues(true)
    setSelectedServiceQueueIds([])
  }

  const toggleServiceQueue = (queueId: string, checked: boolean) => {
    setSelectedServiceQueueIds((prev) => {
      if (checked) return prev.includes(queueId) ? prev : [...prev, queueId]
      return prev.filter((id) => id !== queueId)
    })
  }

  useEffect(() => {
    const reloadQueueOptions = () => {
      const next = loadAdminQueueOptions()
      setTicketQueueOptions(next)
    }
    reloadQueueOptions()
    window.addEventListener('left-panel-config-updated', reloadQueueOptions)
    return () => window.removeEventListener('left-panel-config-updated', reloadQueueOptions)
  }, [])

  useEffect(() => {
    if (serviceAccountView !== 'existing-user') return
    if (!serviceExistingUserId) {
      setConvertToServiceAccount(false)
      setAutoUpgradeQueues(true)
      setSelectedServiceQueueIds([])
      return
    }
    const existing = users.find((row) => Number(row.id) === Number(serviceExistingUserId))
    if (!existing || !existing.isServiceAccount) {
      setConvertToServiceAccount(false)
      setAutoUpgradeQueues(true)
      setSelectedServiceQueueIds([])
      return
    }
    setConvertToServiceAccount(true)
    setAutoUpgradeQueues(existing.autoUpgradeQueues !== false)
    setSelectedServiceQueueIds(Array.isArray(existing.queueIds) ? existing.queueIds : [])
  }, [serviceAccountView, serviceExistingUserId, users])

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

  const getPermissionMatrixColumn = (item: PermissionEntry): Exclude<PermissionMatrixColumnKey, 'all'> => {
    const text = `${item.action || ''} ${item.label || ''}`.toLowerCase()
    if (text.includes('create') || text.includes('add')) return 'create'
    if (text.includes('edit') || text.includes('update')) return 'edit'
    if (text.includes('delete') || text.includes('remove')) return 'delete'
    if (text.includes('export')) return 'export'
    return 'read'
  }

  const getCardItemsByColumn = (cardItems: PermissionEntry[], column: PermissionMatrixColumnKey) => {
    if (column === 'all') return cardItems
    return cardItems.filter((item) => getPermissionMatrixColumn(item) === column)
  }

  const toggleCardColumn = (cardId: string, column: PermissionMatrixColumnKey, allowed: boolean) => {
    if (column === 'all') {
      toggleCardAll(cardId, allowed)
      return
    }
    const card = permissionCards.find((c) => c.id === cardId)
    if (!card) return
    const targetItems = getCardItemsByColumn(card.items, column)
    if (targetItems.length === 0) return
    const next = { ...permissions }
    targetItems.forEach((item) => {
      next[item.permissionKey] = allowed
    })
    setPermissions(next)
    const hasAnySelected = card.items.some((item) => Boolean(next[item.permissionKey]))
    setExpandedModules((prev) => ({ ...prev, [cardId]: hasAnySelected || Boolean(prev[cardId]) }))
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
      const uiKeys = Object.keys(permissions).filter((key) => key.startsWith('ui_'))
      const nextUiForUser = uiKeys.reduce<Record<string, boolean>>((acc, key) => {
        acc[key] = Boolean(permissions[key])
        return acc
      }, {})
      const uiRows = loadUiPermissionRows()
      const nextUiRows = { ...uiRows, [String(selectedUserId)]: nextUiForUser }
      saveUiPermissionRows(nextUiRows)
      const mergedNextPermissions = { ...nextPermissions, ...nextUiForUser }
      const nextTemplateKey = String(data.selectedTemplateKey || 'custom')
      setSnapshot(data)
      setSelectedRole(data.user.role)
      setSelectedTemplateKey(nextTemplateKey)
      setPermissions(mergedNextPermissions)
      setInitialState({ role: data.user.role, templateKey: nextTemplateKey, permissions: mergedNextPermissions })
      notify('ok', 'Permissions updated successfully')
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to update permissions')
    } finally {
      setSaving(false)
    }
  }

  const handleAddUser = async () => {
    setModalError('')
    const mailId = newUser.mailId.trim()
    if (!newUser.fullName.trim() || !mailId) {
      const msg = 'Full Name and Mail ID is required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    try {
      const created = await createRbacUser({
        fullName: newUser.fullName.trim(),
        email: mailId,
        mailId,
        phone: newUser.phone.trim(),
        employeeId: newUser.employeeId.trim() || undefined,
        department: newUser.department.trim() || undefined,
        reportingManager: newUser.manager.trim() || undefined,
        dateOfJoining: newUser.dateOfJoining || undefined,
        employmentType: newUser.employmentType,
        workMode: newUser.workMode,
        designation: newUser.designation.trim() || undefined,
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
    setNewUser({
      fullName: '',
      mailId: '',
      phone: '',
      employeeId: '',
      designation: '',
      department: '',
      manager: '',
      dateOfJoining: '',
      employmentType: 'Full-time',
      workMode: 'Onsite',
      defaultPermissionTemplate: '',
    })
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

  const handleCreateUserAndContinueServiceAccount = async () => {
    setModalError('')
    const mailId = newUser.mailId.trim()
    if (!newUser.fullName.trim() || !mailId) {
      const msg = 'Full Name and Mail ID is required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    try {
      const created = await createRbacUser({
        fullName: newUser.fullName.trim(),
        email: mailId,
        mailId,
        phone: newUser.phone.trim(),
        employeeId: newUser.employeeId.trim() || undefined,
        department: newUser.department.trim() || undefined,
        reportingManager: newUser.manager.trim() || undefined,
        dateOfJoining: newUser.dateOfJoining || undefined,
        employmentType: newUser.employmentType,
        workMode: newUser.workMode,
        designation: newUser.designation.trim() || undefined,
        role: 'USER',
        defaultPermissionTemplate: newUser.defaultPermissionTemplate || undefined,
      })
      const nextUserId = Number(created.id)
      setNewServiceUserId(nextUserId)
      setConvertToServiceAccount(true)
      notify('ok', 'User created. Continue with service account setup.')
      await loadUsers()
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Failed to create user'
      setModalError(msg)
      notify('error', msg)
    }
  }

  const handleSaveServiceAccount = async () => {
    const targetUserId = Number(activeServiceUserId || 0)
    if (!targetUserId) {
      notify('error', 'Select a user first')
      return
    }
    try {
      if (!convertToServiceAccount) {
        await updateUser(targetUserId, { role: 'USER', isServiceAccount: false })
        setSelectedUserId(targetUserId)
        await loadUsers()
        notify('ok', 'Service account disabled')
        resetServiceAccountFlow()
        return
      }
      const queueIds = autoUpgradeQueues ? ticketQueueOptions.map((q) => q.id) : selectedServiceQueueIds
      if (queueIds.length === 0) {
        notify('error', 'Select at least one team queue')
        return
      }
      await updateUser(targetUserId, {
        role: 'AGENT',
        isServiceAccount: true,
        autoUpgradeQueues,
        queueIds,
      })
      await loadUsers()
      setSelectedUserId(targetUserId)
      notify('ok', activeServiceAccountExists ? 'Service account updated successfully' : 'Service account configured successfully')
      resetServiceAccountFlow()
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to configure service account')
    }
  }

  const handleServiceAccountInviteAction = async (mode: 'invite' | 'reinvite') => {
    const targetUserId = Number(activeServiceUserId || 0)
    const targetEmail = String(activeServiceUser?.email || '').trim()
    if (!targetUserId) {
      notify('error', 'Select a user first')
      return
    }
    if (!targetEmail) {
      notify('error', 'Selected user mail ID is missing')
      return
    }
    try {
      setServiceInviteBusy(true)
      if (mode === 'invite') {
        const result = await sendServiceAccountInvite(targetUserId, targetEmail)
        notify('ok', `Service account invite sent to ${result?.sentTo || targetEmail}`)
      } else {
        const result = await reinviteServiceAccount(targetUserId, targetEmail)
        notify('ok', `Service account re-invite sent to ${result?.sentTo || targetEmail}`)
      }
      await loadUsers()
      if (selectedUserId === targetUserId) {
        await loadPermissions(targetUserId)
      }
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to process service account invite')
    } finally {
      setServiceInviteBusy(false)
    }
  }

  return (
    <>
      <div className="admin-user-permission-tool-bar">
        <div className="tool-bar-left">
          <button
            className="table-icon-btn toolbar-left-panel-toggle"
            title="Toggle Left Panel"
            aria-label="Toggle Left Panel"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('shared-toolbar-action', { detail: { action: 'toggle-left-panel', target: 'admin' } }))
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" y1="7" x2="20" y2="7" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="17" x2="20" y2="17" />
            </svg>
          </button>
          <div className="rbac-select-field">
            <select
              value={selectedUserId ?? ''}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
              disabled={loading}
            >
              <option value="">Select User</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {getUserOptionLabel(u)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="tool-bar-right rbac-header-actions">
          <button
            className="rbac-add-btn"
            onClick={() => {
              resetServiceAccountFlow()
              setShowAddModal(true)
            }}
            disabled={!isAdmin}
          >
            + Add User
          </button>
          <button
            className="rbac-reinvite-btn"
            onClick={() => {
              setShowAddModal(false)
              setModalError('')
              setServiceAccountView('picker')
              setConvertToServiceAccount(false)
              setAutoUpgradeQueues(true)
              setSelectedServiceQueueIds([])
              setNewServiceUserId(null)
            }}
            disabled={!isAdmin}
          >
            Service Account
          </button>
          <button className="rbac-update-btn" onClick={handleSave} disabled={!isDirty || saving || !selectedUserId}>
            {saving ? 'Updating...' : 'Update'}
          </button>
        </div>
      </div>

      {serviceAccountView !== 'none' ? (
        <section className="rbac-module-card">
          <div className="rbac-service-account-shell">
            {serviceAccountView === 'picker' && (
              <>
                <div className="rbac-service-account-head">
                  <h3>Service Account Setup</h3>
                  <button className="admin-settings-ghost" onClick={resetServiceAccountFlow}>Back to Permissions</button>
                </div>
                <div className="rbac-service-account-picker-grid">
                  <button className="rbac-service-account-picker-card" onClick={() => setServiceAccountView('existing-user')}>
                    <h4>Add/Edit service account from existing user</h4>
                    <p>Select a current user to add or edit queue-scoped service account settings.</p>
                  </button>
                  <button className="rbac-service-account-picker-card" onClick={() => setServiceAccountView('new-user')}>
                    <h4>Add user and service account</h4>
                    <p>Create a new user first, then continue with service account conversion and queue scope.</p>
                  </button>
                </div>
              </>
            )}

            {serviceAccountView === 'existing-user' && (
              <div className="rbac-service-account-form">
                <div className="rbac-service-account-head">
                  <h3>Add/Edit service account from existing user</h3>
                  <button className="admin-settings-ghost" onClick={() => setServiceAccountView('picker')}>Back</button>
                </div>
                {modalError && <div className="rbac-modal-error">{modalError}</div>}
                <label className="rbac-service-account-label">
                  Select User
                  <select value={serviceExistingUserId ?? ''} onChange={(e) => setServiceExistingUserId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Select User</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{getUserOptionLabel(u)}</option>
                    ))}
                  </select>
                </label>
                {serviceExistingUserId && (
                  <p className="rbac-service-account-note">
                    {activeServiceAccountExists
                      ? 'Existing service account config loaded. Update and save changes.'
                      : 'No existing service account config. Configure and save to create one.'}
                  </p>
                )}
                <label className="rbac-service-account-toggle">
                  <span>Make as Service Account</span>
                  <span className="rbac-toggle-switch">
                    <input type="checkbox" checked={convertToServiceAccount} onChange={(e) => setConvertToServiceAccount(e.target.checked)} />
                    <span className="rbac-toggle-slider" />
                  </span>
                </label>
                {convertToServiceAccount && (
                  <div className="rbac-service-account-queues">
                    <label className="rbac-service-account-check">
                      <input type="checkbox" checked={autoUpgradeQueues} onChange={(e) => setAutoUpgradeQueues(e.target.checked)} />
                      <span>Auto-upgrade to include future team queues</span>
                    </label>
                    <div className="rbac-service-account-queue-grid">
                      {ticketQueueOptions.map((q) => {
                        const checked = autoUpgradeQueues ? true : selectedServiceQueueIds.includes(q.id)
                        return (
                          <label key={q.id} className="rbac-service-account-check">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={autoUpgradeQueues}
                              onChange={(e) => toggleServiceQueue(q.id, e.target.checked)}
                            />
                            <span>{q.label}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="rbac-service-account-actions">
                  <button className="admin-settings-primary" onClick={handleSaveServiceAccount}>
                    {!convertToServiceAccount
                      ? 'Disable Service Account'
                      : activeServiceAccountExists
                        ? 'Update Service Account'
                        : 'Save Service Account'}
                  </button>
                  {isActiveServiceAccountRole && (
                    <>
                      <button
                        className="admin-settings-ghost"
                        onClick={() => handleServiceAccountInviteAction('invite')}
                        disabled={serviceInviteBusy || !canInviteServiceAccount}
                        title={canInviteServiceAccount ? 'Send invite' : 'Invite already sent; use re-invite'}
                      >
                        {serviceInviteBusy ? 'Processing...' : 'Invite'}
                      </button>
                      <button
                        className="admin-settings-ghost"
                        onClick={() => handleServiceAccountInviteAction('reinvite')}
                        disabled={serviceInviteBusy || !canReinviteServiceAccount}
                        title={canReinviteServiceAccount ? 'Send re-invite' : 'Re-invite available only after pending/sent invite'}
                      >
                        {serviceInviteBusy ? 'Processing...' : 'Re-Invite'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {serviceAccountView === 'new-user' && (
              <div className="rbac-service-account-form">
                <div className="rbac-service-account-head">
                  <h3>Add user and service account</h3>
                  <button className="admin-settings-ghost" onClick={() => setServiceAccountView('picker')}>Back</button>
                </div>
                {modalError && <div className="rbac-modal-error">{modalError}</div>}
                {!newServiceUserId ? (
                  <>
                    <div className="rbac-user-template-grid">
                      <label>Full Name<input placeholder="Full name" value={newUser.fullName} onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))} /></label>
                      <label>Mail ID<input placeholder="name@company.com" value={newUser.mailId} onChange={(e) => setNewUser((p) => ({ ...p, mailId: e.target.value }))} /></label>
                      <label>Phone Number<input placeholder="+1 555 000 0000" value={newUser.phone} onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))} /></label>
                      <label>Employee ID<input placeholder="EMP-001" value={newUser.employeeId} onChange={(e) => setNewUser((p) => ({ ...p, employeeId: e.target.value }))} /></label>
                      <label>Designation<input placeholder="Designation" value={newUser.designation} onChange={(e) => setNewUser((p) => ({ ...p, designation: e.target.value }))} /></label>
                      <label>Department/Project<input placeholder="Department or project" value={newUser.department} onChange={(e) => setNewUser((p) => ({ ...p, department: e.target.value }))} /></label>
                      <label>Reporting Manager<input placeholder="Manager name" value={newUser.manager} onChange={(e) => setNewUser((p) => ({ ...p, manager: e.target.value }))} /></label>
                      <label>Date of Joining<input type="date" value={newUser.dateOfJoining} onChange={(e) => setNewUser((p) => ({ ...p, dateOfJoining: e.target.value }))} /></label>
                      <label>Employment Type
                        <select value={newUser.employmentType} onChange={(e) => setNewUser((p) => ({ ...p, employmentType: e.target.value }))}>
                          <option>Full-time</option>
                          <option>Part-time</option>
                          <option>Contract</option>
                        </select>
                      </label>
                      <label className="rbac-user-template-span-1">Work mode
                        <select value={newUser.workMode} onChange={(e) => setNewUser((p) => ({ ...p, workMode: e.target.value }))}>
                          <option>Onsite</option>
                          <option>Hybrid</option>
                          <option>Remote</option>
                        </select>
                      </label>
                    </div>
                    <label className="rbac-service-account-toggle">
                      <span>Make as Service Account</span>
                      <span className="rbac-toggle-switch">
                        <input type="checkbox" checked={convertToServiceAccount} onChange={(e) => setConvertToServiceAccount(e.target.checked)} />
                        <span className="rbac-toggle-slider" />
                      </span>
                    </label>
                    {convertToServiceAccount && (
                      <div className="rbac-service-account-queues">
                        <label className="rbac-service-account-check">
                          <input type="checkbox" checked={autoUpgradeQueues} onChange={(e) => setAutoUpgradeQueues(e.target.checked)} />
                          <span>Auto-upgrade to include future team queues</span>
                        </label>
                        <div className="rbac-service-account-queue-grid">
                          {ticketQueueOptions.map((q) => {
                            const checked = autoUpgradeQueues ? true : selectedServiceQueueIds.includes(q.id)
                            return (
                              <label key={q.id} className="rbac-service-account-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={autoUpgradeQueues}
                                  onChange={(e) => toggleServiceQueue(q.id, e.target.checked)}
                                />
                                <span>{q.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {!convertToServiceAccount && (
                      <p className="rbac-service-account-note">Enable "Make as Service Account" to continue.</p>
                    )}
                    <div className="rbac-service-account-actions">
                      <button className="admin-settings-primary" onClick={handleCreateUserAndContinueServiceAccount} disabled={!convertToServiceAccount}>Add User</button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="rbac-service-account-note">User created. Continue with service account conversion and queue scopes.</p>
                    <label className="rbac-service-account-toggle">
                      <span>Make as Service Account</span>
                      <span className="rbac-toggle-switch">
                        <input type="checkbox" checked={convertToServiceAccount} onChange={(e) => setConvertToServiceAccount(e.target.checked)} />
                        <span className="rbac-toggle-slider" />
                      </span>
                    </label>
                    {convertToServiceAccount && (
                      <div className="rbac-service-account-queues">
                        <label className="rbac-service-account-check">
                          <input type="checkbox" checked={autoUpgradeQueues} onChange={(e) => setAutoUpgradeQueues(e.target.checked)} />
                      <span>Auto-upgrade to include future team queues</span>
                        </label>
                        <div className="rbac-service-account-queue-grid">
                          {ticketQueueOptions.map((q) => {
                            const checked = autoUpgradeQueues ? true : selectedServiceQueueIds.includes(q.id)
                            return (
                              <label key={q.id} className="rbac-service-account-check">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={autoUpgradeQueues}
                                  onChange={(e) => toggleServiceQueue(q.id, e.target.checked)}
                                />
                                <span>{q.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    <div className="rbac-service-account-actions">
                      <button className="admin-settings-primary" onClick={handleSaveServiceAccount}>Save Service Account</button>
                      {isActiveServiceAccountRole && (
                        <>
                          <button
                            className="admin-settings-ghost"
                            onClick={() => handleServiceAccountInviteAction('invite')}
                            disabled={serviceInviteBusy || !canInviteServiceAccount}
                            title={canInviteServiceAccount ? 'Send invite' : 'Invite already sent; use re-invite'}
                          >
                            {serviceInviteBusy ? 'Processing...' : 'Invite'}
                          </button>
                          <button
                            className="admin-settings-ghost"
                            onClick={() => handleServiceAccountInviteAction('reinvite')}
                            disabled={serviceInviteBusy || !canReinviteServiceAccount}
                            title={canReinviteServiceAccount ? 'Send re-invite' : 'Re-invite available only after pending/sent invite'}
                          >
                            {serviceInviteBusy ? 'Processing...' : 'Re-Invite'}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </section>
      ) : showAddModal ? (
        <section className="rbac-module-card">
          <div className="modal-content rbac-modal rbac-inline-add-user">
            <div className="modal-header">
              <h3>Add / Invite New User</h3>
              <button className="modal-close" onClick={resetAddModal}>x</button>
            </div>
            <div className="modal-body">
              {modalError && <div className="rbac-modal-error">{modalError}</div>}
              {addStep === 1 && (
                <div className="rbac-user-template-grid">
                  <label>Full Name<input placeholder="Full name" value={newUser.fullName} onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))} /></label>
                  <label>Mail ID<input placeholder="name@company.com" value={newUser.mailId} onChange={(e) => setNewUser((p) => ({ ...p, mailId: e.target.value }))} /></label>
                  <label>Phone Number<input placeholder="+1 555 000 0000" value={newUser.phone} onChange={(e) => setNewUser((p) => ({ ...p, phone: e.target.value }))} /></label>
                  <label>Employee ID<input placeholder="EMP-001" value={newUser.employeeId} onChange={(e) => setNewUser((p) => ({ ...p, employeeId: e.target.value }))} /></label>
                  <label>Designation<input placeholder="Designation" value={newUser.designation} onChange={(e) => setNewUser((p) => ({ ...p, designation: e.target.value }))} /></label>
                  <label>Department/Project<input placeholder="Department or project" value={newUser.department} onChange={(e) => setNewUser((p) => ({ ...p, department: e.target.value }))} /></label>
                  <label>Reporting Manager<input placeholder="Manager name" value={newUser.manager} onChange={(e) => setNewUser((p) => ({ ...p, manager: e.target.value }))} /></label>
                  <label>Date of Joining<input type="date" value={newUser.dateOfJoining} onChange={(e) => setNewUser((p) => ({ ...p, dateOfJoining: e.target.value }))} /></label>
                  <label>Employment Type
                    <select value={newUser.employmentType} onChange={(e) => setNewUser((p) => ({ ...p, employmentType: e.target.value }))}>
                      <option>Full-time</option>
                      <option>Part-time</option>
                      <option>Contract</option>
                    </select>
                  </label>
                  <label className="rbac-user-template-span-1">Work mode
                    <select value={newUser.workMode} onChange={(e) => setNewUser((p) => ({ ...p, workMode: e.target.value }))}>
                      <option>Onsite</option>
                      <option>Hybrid</option>
                      <option>Remote</option>
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
        </section>
      ) : (
        <section className="rbac-module-card">
          {selectedUserId ? (
            <div className="rbac-permission-matrix-wrap">
              <table className="rbac-permission-matrix">
                <thead>
                  <tr>
                    <th scope="col">Permission</th>
                    {permissionMatrixColumns.map((column) => (
                      <th key={column.key} scope="col">{column.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {permissionCards.map((card) => (
                    <tr key={card.id}>
                      <td className="rbac-permission-module-cell">
                        <span className="rbac-permission-module-name">{card.title}</span>
                      </td>
                      {permissionMatrixColumns.map((column) => {
                        const columnItems = getCardItemsByColumn(card.items, column.key)
                        const checked = columnItems.length > 0 && columnItems.every((item) => isPermissionChecked(item.permissionKey))
                        return (
                          <td key={`${card.id}-${column.key}`} className="rbac-permission-matrix-cell">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleCardColumn(card.id, column.key, e.target.checked)}
                              disabled={!isAdmin || columnItems.length === 0}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rbac-empty-state">Select a user to view permissions.</div>
          )}
        </section>
      )}
      {toast && <div className={`rbac-toast ${toast.type}`}>{toast.text}</div>}
    </>
  )
}
