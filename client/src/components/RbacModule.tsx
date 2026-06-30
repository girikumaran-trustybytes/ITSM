import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UserDetailView from './UserDetailView'
import {
  createRbacUser,
  getUserPermissions,
  listRbacUsers,
  markInvitePending,
  reinviteServiceAccount,
  saveUserPermissions,
  sendServiceAccountInvite,
  updateUserMfaSettings,
  type RbacUserRow,
} from '../services/rbac.service'
import { deleteUser, updateUser } from '../modules/users/services/user.service'
import { primarySidebarModules } from './PrimarySidebar'
import { loadLeftPanelConfig, type QueueRule } from '../utils/leftPanelConfig'

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

const initialNewUserState = {
  firstName: '',
  lastName: '',
  fullName: '',
  mailId: '',
  role: 'AGENT',
  phone: '',
  workPhone: '',
  mobilePhone: '',
  title: '',
  employeeId: '',
  designation: '',
  department: '',
  manager: '',
  dateOfJoining: '',
  employmentType: 'Full-time',
  workMode: 'Onsite',
  timeZone: '(GMT-05:00) Eastern Time (US & Canada)',
  workSchedule: 'Default',
  loadForAssignment: '5',
  language: 'English',
  licenseType: 'Full-time',
  dayPassesAvailable: 3,
  timeFormat: '12-hour',
  markVip: false,
  location: '',
  company: '',
  canSeeAssociatedCompanies: false,
  address: '',
  signature: '',
  backgroundInfo: '',
  profilePictureName: '',
  profilePictureDataUrl: '',
  defaultPermissionTemplate: '',
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
type PermissionModuleKey = 'ticket' | 'asset' | 'user' | 'supplier'
type PermissionActionKey = 'view' | 'create' | 'access' | 'edit' | 'export'

type ModuleActionState = {
  keys: string[]
  checked: boolean
  indeterminate: boolean
}

type TicketTeamState = {
  id: string
  label: string
  actionKeys: Record<PermissionActionKey, string[]>
}

type ModulePermissionState = {
  key: PermissionModuleKey
  label: string
  actions: Record<PermissionActionKey, ModuleActionState>
  enabledActions: PermissionActionKey[]
  checked: boolean
  indeterminate: boolean
  showTeams: boolean
  teams: TicketTeamState[]
}

type TicketTeamRow = {
  key: string
  label: string
  actions: Record<PermissionActionKey, ModuleActionState>
}

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

function isTeamQueueRule(rule: QueueRule) {
  const label = String(rule?.label || '').trim().toLowerCase()
  const field = String(rule?.field || '').trim().toLowerCase()
  const blockedLabels = new Set([
    'all tickets',
    'open tickets',
    'closed tickets',
    'sla hold',
    'overdue',
    'pending',
  ])
  const blockedFields = new Set(['status', 'sla', 'priority', 'type', 'tickettype'])
  if (!label) return false
  if (blockedLabels.has(label)) return false
  if (blockedFields.has(field)) return false
  return true
}

function loadAdminQueueOptions() {
  const cfg = loadLeftPanelConfig()
  const queueConfigs = Array.isArray(cfg?.ticketQueues) ? cfg.ticketQueues : []
  const rules = Array.isArray(cfg?.ticketsMyLists) ? cfg.ticketsMyLists : []
  const seen = new Set<string>()
  const fromTicketQueues = queueConfigs
    .map((queue) => {
      const rawId = String(queue?.id || '')
      const rawLabel = String(queue?.label || '').trim()
      if (!rawLabel) return null
      const id = String(rawId || slugifyQueueId(rawLabel)).trim().toLowerCase()
      if (seen.has(id)) return null
      seen.add(id)
      return { id, label: rawLabel }
    })
    .filter((row): row is { id: string; label: string } => Boolean(row))

  const fromRules = rules
    .filter((rule) => isTeamQueueRule(rule))
    .map((rule) => {
      const rawId = String(rule?.id || '')
      const rawLabel = String(rule?.label || '').trim()
      if (!rawLabel) return null
      const id = String(rawId || slugifyQueueId(rawLabel)).trim().toLowerCase()
      if (seen.has(id)) return null
      seen.add(id)
      return { id, label: rawLabel }
    })
    .filter((row): row is { id: string; label: string } => Boolean(row))

  return [...fromTicketQueues, ...fromRules]
}

function titleCase(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase()
}

export default function RbacModule({ isAdmin }: Props) {
  void isAdmin
  const canManageUsers = true
  const navigate = useNavigate()

  const [users, setUsers] = useState<RbacUserRow[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [selectedAgentRow, setSelectedAgentRow] = useState<RbacUserRow | null>(null)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [selectedRole, setSelectedRole] = useState('USER')
  const [selectedTemplateKey, setSelectedTemplateKey] = useState('support_desk')
  const [expandedModules, setExpandedModules] = useState<Record<string, boolean>>({})
  const [permissions, setPermissions] = useState<Record<string, boolean>>({})
  const [initialState, setInitialState] = useState<{ role: string; templateKey: string; permissions: Record<string, boolean> } | null>(null)
  const [loading, setLoading] = useState(false)
  const [usersLoading, setUsersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addStep, setAddStep] = useState<1 | 2>(1)
  const [addUserBusy, setAddUserBusy] = useState(false)
  const [createdUserId, setCreatedUserId] = useState<number | null>(null)
  const [modalError, setModalError] = useState('')
  const [newUser, setNewUser] = useState(initialNewUserState)

  const composeNewUserFullName = () => {
    const explicit = String(newUser.fullName || '').trim()
    return explicit
  }

  const buildAgentPayload = () => {
    const fullName = composeNewUserFullName()
    const mailId = String(newUser.mailId || '').trim().toLowerCase()
    const role = String(newUser.role || 'AGENT').trim().toUpperCase()
    return {
      fullName,
      email: mailId,
      mailId,
      role,
      defaultPermissionTemplate: newUser.defaultPermissionTemplate || undefined,
    }
  }
  const [serviceAccountView, setServiceAccountView] = useState<ServiceAccountView>('none')
  const [serviceExistingUserId, setServiceExistingUserId] = useState<number | null>(null)
  const [newServiceUserId, setNewServiceUserId] = useState<number | null>(null)
  const [convertToServiceAccount, setConvertToServiceAccount] = useState(false)
  const [autoUpgradeQueues, setAutoUpgradeQueues] = useState(true)
  const [selectedServiceQueueIds, setSelectedServiceQueueIds] = useState<string[]>([])
  const [serviceInviteBusyUserId, setServiceInviteBusyUserId] = useState<number | null>(null)
  const [serviceDeleteBusyUserId, setServiceDeleteBusyUserId] = useState<number | null>(null)
  const [mfaBusyUserId, setMfaBusyUserId] = useState<number | null>(null)
  const [serviceDeactivateBusy, setServiceDeactivateBusy] = useState(false)
  const [deactivateConfirmUser, setDeactivateConfirmUser] = useState<RbacUserRow | null>(null)

  const notify = (type: 'ok' | 'error', text: string) => {
    setToast({ type, text })
    window.setTimeout(() => setToast(null), 5000)
  }

  const extractErrorText = (error: any, fallback: string) => {
    const raw = String(error?.response?.data?.error || error?.message || fallback || '').trim()
    const lower = raw.toLowerCase()
    if (lower.includes('invalid or expired token') || lower.includes('invalid refresh token')) {
      return 'Session expired. Please log in again and retry.'
    }
    if (
      lower.includes('smtp user is required') ||
      lower.includes('smtp host is required') ||
      lower.includes('smtp pass/app-password is required') ||
      lower.includes('smtp port is required')
    ) {
      return 'Email service is not configured. Please configure SMTP in Admin Mail settings, then try Invite again.'
    }
    if (
      lower.includes('connection timeout') ||
      lower.includes('greeting never received') ||
      lower.includes('socket hang up')
    ) {
      return 'Email server is unreachable right now. Please retry Invite in a moment.'
    }
    return raw || fallback
  }

  const isInviteDeliveryPending = (result: any) => {
    const inviteStatus = String(result?.inviteStatus || '').trim().toLowerCase()
    const delivery = String(result?.delivery || '').trim().toLowerCase()
    return inviteStatus === 'invite_pending' || delivery === 'pending'
  }

  const notifyInviteDelivery = async (result: any, sentMessage: string, pendingMessage: string) => {
    if (!isInviteDeliveryPending(result)) {
      notify('ok', sentMessage)
      return
    }
    const activationLink = String(result?.activationLink || '').trim()
    let copied = false
    if (activationLink && typeof window !== 'undefined' && navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(activationLink)
        copied = true
      } catch {
        copied = false
      }
    }
    notify('error', copied ? `${pendingMessage} Activation link copied.` : pendingMessage)
  }

  const isAlreadyInvitedError = (error: any) =>
    extractErrorText(error, '').toLowerCase().includes('already invited')

  const isTransientTimeoutError = (error: any) => {
    const text = extractErrorText(error, '').toLowerCase()
    return (
      text.includes('query read timeout') ||
      text.includes('timeout') ||
      text.includes('temporarily unavailable') ||
      text.includes('service unavailable')
    )
  }

  const isPermissionChecked = (key: string) => {
    if (!selectedUserId) return false
    if (Object.prototype.hasOwnProperty.call(permissions, key)) return Boolean(permissions[key])
    return false
  }

  const getUserOptionLabel = (u: RbacUserRow) => {
    const roleRaw = String(u.role || '').trim().toUpperCase()
    const roleLabel = roleRaw === 'ADMIN' ? 'Admin' : roleRaw === 'AGENT' ? 'Agent' : 'User'
    return `${u.email} | ${u.name || 'No name'} | ${roleLabel} | ${titleCase(u.inviteStatus || u.status || 'none')}`
  }

  const getRoleLabel = (u: RbacUserRow) => {
    const roleRaw = String(u.role || '').trim().toUpperCase()
    if (roleRaw === 'ADMIN') return 'Admin'
    if (roleRaw === 'AGENT') return 'Agent'
    return 'User'
  }

  const getServiceInviteStatus = (u: RbacUserRow) => {
    const raw = String(u.inviteStatus || u.status || 'none').trim().toLowerCase()
    return raw || 'none'
  }

  const getDisplayStatus = (u: RbacUserRow) => {
    const apiStatus = String(u.status || '').trim()
    if (!apiStatus) return 'Invited'
    return titleCase(apiStatus)
  }

  const handleToggleUserMfa = async (user: RbacUserRow, enabled: boolean) => {
    const userId = Number(user.id || 0)
    if (!userId) return
    setMfaBusyUserId(userId)
    try {
      await updateUserMfaSettings(userId, enabled)
      notify('ok', enabled ? '2FA enabled' : '2FA disabled')
      await loadUsers()
      if (selectedUserId && selectedUserId === userId) {
        await loadPermissions(userId)
      }
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to update 2FA')
    } finally {
      setMfaBusyUserId(null)
    }
  }

  const isAlreadyInvitedStatus = (status: string) => ['invited', 'invited_not_accepted', 'accepted'].includes(status)

  const isAlreadyInvitedOrActiveUser = (u: RbacUserRow) => {
    const inviteStatus = getServiceInviteStatus(u)
    const accountStatus = String(u.status || '').trim().toLowerCase()
    return isAlreadyInvitedStatus(inviteStatus) || accountStatus === 'active'
  }

  const getInviteActionModeForUser = (u: RbacUserRow): 'invite' | 'reinvite' => {
    return isAlreadyInvitedOrActiveUser(u) ? 'reinvite' : 'invite'
  }

  const canDeactivateToEndUser = (u: RbacUserRow) => {
    const role = String(u.role || '').trim().toUpperCase()
    if (u.isServiceAccount) return true
    return role !== 'USER'
  }

  const isDeactivatedAccount = (u: RbacUserRow) => {
    const role = String(u.role || '').trim().toUpperCase()
    const status = String(u.status || '').trim().toUpperCase()
    if (role === 'USER' && !u.isServiceAccount) return true
    return ['DEACTIVATED', 'DISABLED', 'INACTIVE'].includes(status)
  }

  const usersForSelection = useMemo(() => {
    return users
      .slice()
      .sort((a, b) => {
        const aSvc = a.isServiceAccount ? 1 : 0
        const bSvc = b.isServiceAccount ? 1 : 0
        if (aSvc !== bSvc) return bSvc - aSvc
        return String(a.name || a.email || '').localeCompare(String(b.name || b.email || ''))
      })
  }, [users])
  const serviceAccountsForSelection = useMemo(() => usersForSelection.filter((u) => u.isServiceAccount), [usersForSelection])
  const usersForServiceTable = useMemo(() => usersForSelection, [usersForSelection])
  const nonServiceAccountsForSelection = useMemo(() => usersForSelection.filter((u) => !u.isServiceAccount), [usersForSelection])

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const agentRows = await listRbacUsers({ q: userSearch || undefined, limit: 250, principalType: 'agent' })
      setUsers(Array.isArray(agentRows) ? agentRows : [])
    } catch (error: any) {
      if (isTransientTimeoutError(error)) return
      notify('error', extractErrorText(error, 'Failed to load users'))
    } finally {
      setUsersLoading(false)
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
      if (isTransientTimeoutError(error)) return
      notify('error', extractErrorText(error, 'Failed to load user permissions'))
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

  const permissionModules = useMemo<ModulePermissionState[]>(() => {
    const entries = snapshot?.permissions || []
    const queueLabelById = ticketQueueOptions.reduce<Record<string, string>>((acc, row) => {
      acc[String(row.id || '').toLowerCase()] = row.label
      return acc
    }, {})

    const queuePermissionRows = entries.filter((entry) => String(entry.module || '').toLowerCase() === 'ticket' && entry.queue)
    const queueIds = Array.from(new Set(queuePermissionRows.map((entry) => String(entry.queue || '').toLowerCase()).filter(Boolean)))
    const normalizedQueueOptions = queueIds.map((queueId) => ({
      id: queueId,
      label: queueLabelById[queueId] || titleCase(queueId.replace(/[-_]+/g, ' ')),
    }))

    const findKeys = (moduleAliases: string[], actionAliases: string[], queueFilter: 'none' | 'queue' | 'any') => {
      return entries
        .filter((entry) => {
          const module = String(entry.module || '').toLowerCase()
          const action = String(entry.action || '').toLowerCase()
          const queue = String(entry.queue || '').trim()
          if (!moduleAliases.includes(module)) return false
          if (!actionAliases.includes(action)) return false
          if (queueFilter === 'none') return !queue
          if (queueFilter === 'queue') return Boolean(queue)
          return true
        })
        .map((entry) => entry.permissionKey)
    }

    const buildActionState = (keys: string[]): ModuleActionState => {
      const uniqueKeys = Array.from(new Set(keys))
      if (uniqueKeys.length === 0) return { keys: [], checked: false, indeterminate: false }
      const selectedCount = uniqueKeys.filter((key) => Boolean(permissions[key])).length
      return {
        keys: uniqueKeys,
        checked: selectedCount === uniqueKeys.length,
        indeterminate: selectedCount > 0 && selectedCount < uniqueKeys.length,
      }
    }

    const ticketAccessGlobalKeys = findKeys(['tickets', 'ticket'], ['access'], 'none')
    const ticketExportGlobalKeys = findKeys(['tickets', 'ticket'], ['export'], 'none')

    const findTeamActionKeys = (queueId: string, actionAliases: string[]) =>
      entries
        .filter((entry) =>
          String(entry.module || '').toLowerCase() === 'ticket'
          && String(entry.queue || '').toLowerCase() === queueId
          && actionAliases.includes(String(entry.action || '').toLowerCase())
        )
        .map((entry) => entry.permissionKey)

    const ticketTeams: TicketTeamState[] = normalizedQueueOptions.map((team) => ({
      id: team.id,
      label: team.label,
      actionKeys: {
        view: findTeamActionKeys(team.id, ['view', 'read']),
        create: findTeamActionKeys(team.id, ['create', 'add']),
        access: findTeamActionKeys(team.id, ['access']),
        edit: findTeamActionKeys(team.id, ['edit', 'update']),
        export: findTeamActionKeys(team.id, ['export']),
      },
    }))

    const teamActionKeys = (action: PermissionActionKey) => ticketTeams.flatMap((team) => team.actionKeys[action])
    const ticketViewKeys = [...findKeys(['tickets', 'ticket'], ['view', 'read'], 'none'), ...teamActionKeys('view')]
    const ticketCreateKeys = [...findKeys(['tickets', 'ticket'], ['create', 'add'], 'none'), ...teamActionKeys('create')]
    const ticketAccessKeys = [...ticketAccessGlobalKeys, ...teamActionKeys('access')]
    const ticketEditKeys = [...findKeys(['tickets', 'ticket'], ['edit', 'update'], 'none'), ...teamActionKeys('edit')]
    const ticketExportKeys = [...ticketExportGlobalKeys, ...teamActionKeys('export')]

    const buildModule = (
      key: PermissionModuleKey,
      label: string,
      actionKeys: Record<PermissionActionKey, string[]>
    ): ModulePermissionState => {
      const actions: Record<PermissionActionKey, ModuleActionState> = {
        view: buildActionState(actionKeys.view),
        create: buildActionState(actionKeys.create),
        access: buildActionState(actionKeys.access),
        edit: buildActionState(actionKeys.edit),
        export: buildActionState(actionKeys.export),
      }
      const enabledActions = (Object.keys(actions) as PermissionActionKey[]).filter((action) => actions[action].keys.length > 0)
      const selectedActions = enabledActions.filter((action) => actions[action].checked).length
      return {
        key,
        label,
        actions,
        enabledActions,
        checked: enabledActions.length > 0 && selectedActions === enabledActions.length,
        indeterminate: selectedActions > 0 && selectedActions < enabledActions.length,
        showTeams: key === 'ticket' && ticketTeams.length > 0,
        teams: key === 'ticket' ? ticketTeams : [],
      }
    }

    return [
      buildModule('ticket', 'Ticket', {
        view: ticketViewKeys,
        create: ticketCreateKeys,
        access: ticketAccessKeys,
        edit: ticketEditKeys,
        export: ticketExportKeys,
      }),
      buildModule('asset', 'Asset', {
        view: findKeys(['assets', 'asset'], ['view', 'read'], 'none'),
        create: findKeys(['assets', 'asset'], ['create', 'add'], 'none'),
        access: [],
        edit: findKeys(['assets', 'asset'], ['edit', 'update'], 'none'),
        export: findKeys(['assets', 'asset'], ['export'], 'none'),
      }),
      buildModule('user', 'User', {
        view: findKeys(['users', 'user'], ['view', 'read', 'view_user'], 'none'),
        create: findKeys(['users', 'user'], ['create', 'add', 'create_user'], 'none'),
        access: [],
        edit: findKeys(['users', 'user'], ['edit', 'update', 'edit_user'], 'none'),
        export: findKeys(['users', 'user'], ['export'], 'none'),
      }),
      buildModule('supplier', 'Supplier', {
        view: findKeys(['suppliers', 'supplier'], ['view', 'read', 'view_supplier'], 'none'),
        create: findKeys(['suppliers', 'supplier'], ['create', 'add', 'create_supplier'], 'none'),
        access: [],
        edit: findKeys(['suppliers', 'supplier'], ['edit', 'update', 'edit_supplier'], 'none'),
        export: findKeys(['suppliers', 'supplier'], ['export'], 'none'),
      }),
    ]
  }, [permissions, snapshot?.permissions, ticketQueueOptions])

  const setPermissionKeys = (keys: string[], checked: boolean) => {
    if (keys.length === 0) return
    const next = { ...permissions }
    keys.forEach((key) => {
      next[key] = checked
    })
    setPermissions(next)
    syncTemplateState(next)
  }

  const setModuleChecked = (moduleKey: PermissionModuleKey, checked: boolean) => {
    const module = permissionModules.find((row) => row.key === moduleKey)
    if (!module) return
    const keys = module.enabledActions.flatMap((action) => module.actions[action].keys)
    setPermissionKeys(keys, checked)
  }

  const setModuleActionChecked = (moduleKey: PermissionModuleKey, actionKey: PermissionActionKey, checked: boolean) => {
    const module = permissionModules.find((row) => row.key === moduleKey)
    if (!module) return
    const action = module.actions[actionKey]
    if (!action || action.keys.length === 0) return
    const next = { ...permissions }
    action.keys.forEach((key) => {
      next[key] = checked
    })

    setPermissions(next)
    syncTemplateState(next)
  }

  const ticketTeamRows = useMemo<TicketTeamRow[]>(() => {
    const ticket = permissionModules.find((row) => row.key === 'ticket')
    if (!ticket) return [] as TicketTeamRow[]
    const byAction = (keys: string[]): ModuleActionState => {
      const uniqueKeys = Array.from(new Set(keys))
      if (uniqueKeys.length === 0) return { keys: [], checked: false, indeterminate: false }
      const selectedCount = uniqueKeys.filter((k) => Boolean(permissions[k])).length
      return {
        keys: uniqueKeys,
        checked: selectedCount === uniqueKeys.length,
        indeterminate: selectedCount > 0 && selectedCount < uniqueKeys.length,
      }
    }

    return ticket.teams
      .slice()
      .sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')))
      .map((team) => ({
      key: team.id,
      label: team.label,
      actions: {
        view: byAction(team.actionKeys.view),
        create: byAction(team.actionKeys.create),
        access: byAction(team.actionKeys.access),
        edit: byAction(team.actionKeys.edit),
        export: byAction(team.actionKeys.export),
      },
    }))
  }, [permissionModules, permissions])

  const setTicketTeamRowActionChecked = (teamRowKey: string, action: PermissionActionKey, checked: boolean) => {
    const row = ticketTeamRows.find((item) => item.key === teamRowKey)
    if (!row) return
    const next = { ...permissions }
    const actionKeys = row.actions[action].keys
    actionKeys.forEach((k) => {
      next[k] = checked
    })

    setPermissions(next)
    syncTemplateState(next)
  }

  const activeServiceUserId = serviceAccountView === 'existing-user' ? serviceExistingUserId : newServiceUserId
  const activeServiceUser = useMemo(() => {
    const targetUserId = Number(activeServiceUserId || 0)
    if (!targetUserId) return null
    return users.find((u) => Number(u.id) === targetUserId) || null
  }, [activeServiceUserId, users])

  const activeServiceInviteStatus = String(activeServiceUser?.inviteStatus || 'none').toLowerCase()
  const activeServiceInviteMode: 'invite' | 'reinvite' = activeServiceUser && isAlreadyInvitedOrActiveUser(activeServiceUser) ? 'reinvite' : 'invite'
  const canInviteServiceAccount = Boolean(activeServiceUser) && activeServiceInviteMode === 'invite'
  const canReinviteServiceAccount = Boolean(activeServiceUser) && activeServiceInviteMode === 'reinvite'
  const canTriggerActiveServiceInvite = activeServiceInviteMode === 'invite' ? canInviteServiceAccount : canReinviteServiceAccount
  const isActiveServiceAccountRole = String(activeServiceUser?.role || '').toUpperCase() === 'AGENT'

  const activeServiceAccountExists = Boolean(activeServiceUser?.isServiceAccount)

  const resetServiceAccountFlow = () => {
    setServiceAccountView('none')
    setServiceExistingUserId(null)
    setNewServiceUserId(null)
    setConvertToServiceAccount(false)
    setAutoUpgradeQueues(true)
    setSelectedServiceQueueIds([])
    setNewUser(initialNewUserState)
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('rbac-permissions-updated'))
      }
      notify('ok', 'Permissions updated successfully')
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to update permissions')
    } finally {
      setSaving(false)
    }
  }

  const handleAddUser = async () => {
    if (addUserBusy) return
    if (!canManageUsers) {
      const msg = 'Forbidden: missing permission system.configure'
      setModalError(msg)
      notify('error', msg)
      return
    }
    setModalError('')
    const fullName = String(newUser.fullName || '').trim()
    const mailId = String(newUser.mailId || '').trim().toLowerCase()
    const role = String(newUser.role || 'AGENT').trim().toUpperCase()
    if (!fullName || !mailId || !role) {
      const msg = 'Name, Email, and Role are required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    const payload = {
      fullName,
      email: mailId,
      mailId,
      role,
    }
    try {
      setAddUserBusy(true)
      let created: any
      try {
        created = await createRbacUser(payload)
      } catch (firstError: any) {
        if (!isTransientTimeoutError(firstError)) throw firstError
        await new Promise((resolve) => window.setTimeout(resolve, 650))
        created = await createRbacUser(payload)
      }
      setCreatedUserId(Number(created.id))
      setAddStep(2)
      notify('ok', 'User created')
      await loadUsers()
    } catch (error: any) {
      const status = Number(error?.response?.status || 0)
      const rawMessage = extractErrorText(error, 'Failed to create user')
      if (status === 409 && rawMessage.toLowerCase().includes('email already exists')) {
        let existing = users.find((u) => String(u.email || '').trim().toLowerCase() === mailId)
        if (!existing) {
          try {
            const fetched = await listRbacUsers({ q: mailId, limit: 250, principalType: 'agent' })
            existing = (Array.isArray(fetched) ? fetched : []).find((u) =>
              String(u.email || '').trim().toLowerCase() === mailId
            )
            if (existing) setUsers(Array.isArray(fetched) ? fetched : users)
          } catch {
            // keep graceful fallback message below
          }
        }
        if (existing?.id) {
          setSelectedUserId(Number(existing.id))
          setShowAddModal(false)
          setAddStep(1)
          setCreatedUserId(null)
          setModalError('')
          notify('ok', 'User already exists. Opened existing profile.')
          return
        }
      }
      const msg = isTransientTimeoutError(error)
        ? 'Service is waking up. Please try again in a few seconds.'
        : rawMessage
      setModalError(msg)
      notify('error', msg)
    } finally {
      setAddUserBusy(false)
    }
  }

  const resetAddModal = () => {
    setShowAddModal(false)
    setAddStep(1)
    setCreatedUserId(null)
    setModalError('')
    setNewUser(initialNewUserState)
  }

  const handleInviteNow = async () => {
    if (!canManageUsers) {
      notify('error', 'Forbidden: missing permission system.configure')
      return
    }
    if (!createdUserId) return
    const targetEmail = String(newUser.mailId || '').trim()
    try {
      const result = await sendServiceAccountInvite(createdUserId, targetEmail || undefined)
      await notifyInviteDelivery(
        result,
        `Agent invite sent successfully${result?.sentTo ? ` to ${result.sentTo}` : ''}`,
        `Invite email was not sent immediately${targetEmail ? ` for ${targetEmail}` : ''}. Please retry Invite.`
      )
      resetAddModal()
      await loadUsers()
    } catch (error: any) {
      if (isAlreadyInvitedError(error)) {
        try {
          const result = await reinviteServiceAccount(createdUserId, targetEmail || undefined)
          notify('ok', `Reactivation email sent${result?.sentTo ? ` to ${result.sentTo}` : ''}`)
          resetAddModal()
          await loadUsers()
          return
        } catch (retryError: any) {
          if (isTransientTimeoutError(retryError)) {
            notify('error', extractErrorText(retryError, 'Invite email was not sent immediately. Please retry Invite.'))
            return
          }
          notify('error', extractErrorText(retryError, 'Failed to resend invite'))
          return
        }
      }
      if (isTransientTimeoutError(error)) {
        notify('error', extractErrorText(error, 'Invite email was not sent immediately. Please retry Invite.'))
        return
      }
      notify('error', extractErrorText(error, 'Failed to send invite'))
    }
  }

  const handleInviteLater = async () => {
    if (!canManageUsers) {
      notify('error', 'Forbidden: missing permission system.configure')
      return
    }
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
    if (!canManageUsers) {
      const msg = 'Forbidden: missing permission system.configure'
      setModalError(msg)
      notify('error', msg)
      return
    }
    setModalError('')
    const payload = buildAgentPayload()
    if (!payload.mailId || !payload.fullName || !payload.role) {
      const msg = 'Name, Email, and Role are required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    try {
      let created: any
      try {
        created = await createRbacUser(payload)
      } catch (firstError: any) {
        if (!isTransientTimeoutError(firstError)) throw firstError
        await new Promise((resolve) => window.setTimeout(resolve, 650))
        created = await createRbacUser(payload)
      }
      const createdId = Number(created?.id || 0)
      if (!createdId) throw new Error('Created agent id not found')
      const queueIds = ticketQueueOptions.map((q) => q.id)
      await updateUser(createdId, {
        role: String(payload.role || 'AGENT').toUpperCase(),
        isServiceAccount: true,
        autoUpgradeQueues: true,
        queueIds,
      })
      await loadUsers()
      resetServiceAccountFlow()
      setNewUser(initialNewUserState)
      notify('ok', 'Agent created successfully.')
    } catch (error: any) {
      const msg = isTransientTimeoutError(error)
        ? 'Service is waking up. Please try again in a few seconds.'
        : (error?.response?.data?.error || 'Failed to create user')
      setModalError(msg)
      notify('error', msg)
    }
  }

  const handleSaveServiceAccount = async () => {
    if (!canManageUsers) {
      notify('error', 'Forbidden: missing permission system.configure')
      return
    }
    const targetUserId = Number(activeServiceUserId || 0)
    if (!targetUserId) {
      notify('error', 'Select a user first')
      return
    }
    try {
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
      setServiceInviteBusyUserId(targetUserId)
      if (mode === 'invite') {
        try {
          const result = await sendServiceAccountInvite(targetUserId, targetEmail)
          await notifyInviteDelivery(
            result,
            `Service account invite sent to ${result?.sentTo || targetEmail}`,
            `Invite email was not sent immediately for ${targetEmail}. Please retry Invite.`
          )
        } catch (inviteError: any) {
          if (!isAlreadyInvitedError(inviteError)) throw inviteError
          const result = await reinviteServiceAccount(targetUserId, targetEmail)
          await notifyInviteDelivery(
            result,
            `Reactivation email sent to ${result?.sentTo || targetEmail}`,
            `Reactivation email was not sent immediately for ${targetEmail}. Please retry Invite.`
          )
        }
      } else {
        const result = await reinviteServiceAccount(targetUserId, targetEmail)
        await notifyInviteDelivery(
          result,
          `Reactivation email sent to ${result?.sentTo || targetEmail}`,
          `Reactivation email was not sent immediately for ${targetEmail}. Please retry Invite.`
        )
      }
      await loadUsers()
      if (selectedUserId === targetUserId) {
        await loadPermissions(targetUserId)
      }
    } catch (error: any) {
      if (Number(error?.response?.status || 0) === 403) {
        notify('error', 'Forbidden: missing permission system.configure')
      } else if (isTransientTimeoutError(error)) {
        notify('error', extractErrorText(error, 'Invite email was not sent immediately. Please retry Invite.'))
      } else {
        notify('error', extractErrorText(error, 'Failed to process service account invite'))
      }
    } finally {
      setServiceInviteBusyUserId(null)
    }
  }

  const handleServiceAccountInviteActionForUser = async (user: RbacUserRow, mode: 'invite' | 'reinvite') => {
    const targetUserId = Number(user?.id || 0)
    const targetEmail = String(user?.email || '').trim()
    if (!targetUserId) {
      notify('error', 'Invalid user selected')
      return
    }
    if (!targetEmail) {
      notify('error', 'Selected user mail ID is missing')
      return
    }
    try {
      setServiceInviteBusyUserId(targetUserId)
      if (mode === 'invite') {
        try {
          const result = await sendServiceAccountInvite(targetUserId, targetEmail)
          await notifyInviteDelivery(
            result,
            `Service account invite sent to ${result?.sentTo || targetEmail}`,
            `Invite email was not sent immediately for ${targetEmail}. Please retry Invite.`
          )
        } catch (inviteError: any) {
          if (!isAlreadyInvitedError(inviteError)) throw inviteError
          const result = await reinviteServiceAccount(targetUserId, targetEmail)
          await notifyInviteDelivery(
            result,
            `Reactivation email sent to ${result?.sentTo || targetEmail}`,
            `Reactivation email was not sent immediately for ${targetEmail}. Please retry Invite.`
          )
        }
      } else {
        const result = await reinviteServiceAccount(targetUserId, targetEmail)
        await notifyInviteDelivery(
          result,
          `Reactivation email sent to ${result?.sentTo || targetEmail}`,
          `Reactivation email was not sent immediately for ${targetEmail}. Please retry Invite.`
        )
      }
      await loadUsers()
      if (selectedUserId === targetUserId) {
        await loadPermissions(targetUserId)
      }
    } catch (error: any) {
      if (Number(error?.response?.status || 0) === 403) {
        notify('error', 'Forbidden: missing permission system.configure')
      } else if (isTransientTimeoutError(error)) {
        notify('error', extractErrorText(error, 'Invite email was not sent immediately. Please retry Invite.'))
      } else {
        notify('error', extractErrorText(error, 'Failed to process service account invite'))
      }
    } finally {
      setServiceInviteBusyUserId(null)
    }
  }

  const handleDeactivateServiceAccount = async (user: RbacUserRow) => {
    const targetUserId = Number(user?.id || 0)
    if (!targetUserId) {
      notify('error', 'Invalid user selected')
      return
    }
    if (!canDeactivateToEndUser(user)) {
      notify('ok', 'User is already a normal end user')
      return
    }
    try {
      setServiceDeactivateBusy(true)
      try {
        const snapshot = await getUserPermissions(targetUserId)
        const templates = Array.isArray(snapshot?.permissionTemplates) ? snapshot.permissionTemplates : []
        const endUserTemplate = templates.find((template: any) => String(template?.baseRole || '').toUpperCase() === 'USER')
        const templatePermissions = endUserTemplate && typeof endUserTemplate.permissions === 'object'
          ? endUserTemplate.permissions
          : {}
        await saveUserPermissions(targetUserId, {
          role: 'USER',
          templateKey: endUserTemplate?.key,
          permissions: templatePermissions,
          autoSwitchCustom: false,
        })
      } catch {
        // Fall back to direct user update below.
      }
      await updateUser(targetUserId, { role: 'USER', isServiceAccount: false })
      await loadUsers()
      if (selectedUserId === targetUserId) {
        setSelectedUserId(null)
      }
      notify('ok', 'User converted to End User')
    } catch (error: any) {
      if (Number(error?.response?.status || 0) === 403) {
        notify('error', 'Forbidden: missing permission system.configure')
      } else {
        notify('error', error?.response?.data?.error || 'Failed to convert user to End User')
      }
    } finally {
      setServiceDeactivateBusy(false)
    }
  }

  const handleDeleteServiceUser = async (user: RbacUserRow) => {
    const userId = Number(user.id || 0)
    if (!userId) {
      notify('error', 'Invalid user selected')
      return
    }
    if (!isDeactivatedAccount(user)) {
      notify('error', 'Only deactivated accounts can be deleted')
      return
    }
    const label = String(user.name || user.email || `User #${userId}`).trim()
    if (!window.confirm(`Delete ${label}? This action cannot be undone.`)) return
    setServiceDeleteBusyUserId(userId)
    try {
      await deleteUser(userId)
      if (selectedUserId === userId) setSelectedUserId(null)
      notify('ok', 'User deleted successfully')
      await loadUsers()
    } catch (error: any) {
      notify('error', error?.response?.data?.error || 'Failed to delete user')
    } finally {
      setServiceDeleteBusyUserId(null)
    }
  }

  return (
    <>
      <div className="admin-tool-bar rbac-top-action-row">
        <div className="tool-bar-left">
          <div className="tool-bar-title">
            <div className="tool-bar-title-text">Agent Management</div>
          </div>
        </div>
        <div className="tool-bar-right rbac-top-action-actions">
          {selectedUserId && (
            <>
              <button className="rbac-update-btn" onClick={handleSave} disabled={!isDirty || saving || !selectedUserId}>
                {saving ? 'Updating...' : 'Update'}
              </button>
              <button className="admin-settings-ghost" onClick={() => setSelectedUserId(null)}>
                Cancel
              </button>
            </>
          )}
          <button
            className="rbac-add-btn"
            onClick={() => {
              resetAddModal()
              resetServiceAccountFlow()
              setServiceAccountView('none')
              setShowAddModal(true)
            }}
            disabled={!canManageUsers}
          >
            <span className="rbac-add-btn-plus" aria-hidden="true">+</span>
            <span>Add Agent</span>
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
                    <h4>Add agent from existing user</h4>
                    <p>Select a current user to add or edit queue-scoped service account settings.</p>
                  </button>
                  <button className="rbac-service-account-picker-card" onClick={() => setServiceAccountView('new-user')}>
                    <h4>Add new agent</h4>
                    <p>Create a new user first, then continue with service account conversion and queue scope.</p>
                  </button>
                </div>
              </>
            )}

            {serviceAccountView === 'existing-user' && (
              <div className="rbac-service-account-form">
                <div className="rbac-service-account-head">
                  <h3>Add agent from existing user</h3>
                  <button className="admin-settings-ghost" onClick={() => setServiceAccountView('picker')}>Back</button>
                </div>
                {modalError && <div className="rbac-modal-error">{modalError}</div>}
                <label className="rbac-service-account-label">
                  Select User
                  <select value={serviceExistingUserId ?? ''} onChange={(e) => setServiceExistingUserId(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">Select User</option>
                    {serviceAccountsForSelection.map((u) => (
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
                <div className="rbac-service-account-actions">
                  <button className="admin-settings-primary" onClick={handleSaveServiceAccount}>
                    {activeServiceAccountExists ? 'Update Service Account' : 'Save Service Account'}
                  </button>
                  {isActiveServiceAccountRole && (
                    <button
                      className="admin-settings-ghost"
                      onClick={() => handleServiceAccountInviteAction(activeServiceInviteMode)}
                      disabled={serviceInviteBusyUserId !== null || !canTriggerActiveServiceInvite || !canManageUsers}
                      title={activeServiceInviteMode === 'invite' ? 'Send invite' : 'Send reactivation email'}
                    >
                      {serviceInviteBusyUserId !== null && serviceInviteBusyUserId === Number(activeServiceUserId || 0)
                        ? 'Processing...'
                        : activeServiceInviteMode === 'invite'
                          ? 'Invite'
                          : 'Reactivate'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {serviceAccountView === 'new-user' && (
              <div className="rbac-agent-screen">
                <div className="rbac-agent-title-row">
                  <h3>Add Agent</h3>
                </div>
                {modalError && <div className="rbac-modal-error">{modalError}</div>}

                <div className="rbac-agent-scroll">
                  <div className="rbac-user-template-grid">
                    <label>
                      Name
                      <input
                        placeholder="Full name"
                        value={newUser.fullName}
                        onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))}
                      />
                    </label>
                    <label>
                      Email
                      <input
                        placeholder="name@company.com"
                        value={newUser.mailId}
                        onChange={(e) => setNewUser((p) => ({ ...p, mailId: e.target.value }))}
                      />
                    </label>
                    <label>
                      Role
                      <select
                        value={String(newUser.role || 'AGENT').toUpperCase()}
                        onChange={(e) => setNewUser((p) => ({ ...p, role: String(e.target.value || 'AGENT').toUpperCase() }))}
                      >
                        <option value="AGENT">Agent</option>
                        <option value="ADMIN">Admin</option>
                        <option value="USER">User</option>
                        <option value="SUPPLIER">Supplier</option>
                      </select>
                    </label>
                  </div>
                </div>

                <div className="rbac-agent-footer">
                  <button className="admin-settings-ghost" onClick={resetServiceAccountFlow}>Cancel</button>
                  <button className="admin-settings-primary" onClick={handleCreateUserAndContinueServiceAccount} disabled={!canManageUsers}>Add</button>
                </div>
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
                  <label>
                    Name
                    <input
                      placeholder="Full name"
                      value={newUser.fullName}
                      onChange={(e) => setNewUser((p) => ({ ...p, fullName: e.target.value }))}
                    />
                  </label>
                  <label>
                    Email
                    <input
                      placeholder="name@company.com"
                      value={newUser.mailId}
                      onChange={(e) => setNewUser((p) => ({ ...p, mailId: e.target.value }))}
                    />
                  </label>
                  <label>
                    Role
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser((p) => ({ ...p, role: String(e.target.value || 'AGENT').toUpperCase() }))}
                    >
                      <option value="AGENT">Agent</option>
                      <option value="ADMIN">Admin</option>
                      <option value="USER">User</option>
                      <option value="SUPPLIER">Supplier</option>
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
              {addStep === 1 && <button className="admin-settings-primary" onClick={handleAddUser} disabled={!canManageUsers || addUserBusy}>{addUserBusy ? 'Saving...' : 'Save'}</button>}
            </div>
          </div>
        </section>
      ) : (
        <section className="rbac-module-card">
          {selectedUserId ? (
            <div className="rbac-module-sections">
              {permissionModules.map((module) => {
                const actionCell = (action: PermissionActionKey) => {
                  const state = module.actions[action]
                  if (state.keys.length === 0) return <span className="rbac-action-na">-</span>
                  return (
                    <input
                      type="checkbox"
                      checked={state.checked}
                      ref={(el) => {
                        if (el) el.indeterminate = state.indeterminate
                      }}
                      onChange={(e) => setModuleActionChecked(module.key, action, e.target.checked)}
                      disabled={!canManageUsers}
                    />
                  )
                }

                return (
                  <div key={module.key} className="rbac-module-section">
                    <div className="rbac-module-section-head">
                      <label className="rbac-module-permission-parent">
                        <input
                          type="checkbox"
                          checked={module.checked}
                          ref={(el) => {
                            if (el) el.indeterminate = module.indeterminate
                          }}
                          onChange={(e) => setModuleChecked(module.key, e.target.checked)}
                          disabled={!canManageUsers || module.enabledActions.length === 0}
                        />
                        <span className="rbac-module-permission-title">{module.label}</span>
                      </label>
                    </div>
                    <div className="rbac-permission-matrix-wrap">
                      <table className="rbac-permission-matrix">
                        <thead>
                          <tr>
                            <th scope="col">Team</th>
                            <th scope="col">View</th>
                            <th scope="col">Create</th>
                            <th scope="col">Access</th>
                            <th scope="col">Edit</th>
                            <th scope="col">Export</th>
                          </tr>
                        </thead>
                        <tbody>
                          {module.key === 'ticket' ? (
                            ticketTeamRows.map((teamRow) => (
                              <tr key={`${module.key}-${teamRow.key}`}>
                                <td className="rbac-permission-module-cell">
                                  <span className="rbac-ticket-team-label">{teamRow.label}</span>
                                </td>
                              {(['view', 'create', 'access', 'edit', 'export'] as PermissionActionKey[]).map((action) => {
                                const state = teamRow.actions[action]
                                if (state.keys.length === 0) {
                                  return (
                                    <td key={`${teamRow.key}-${action}`} className="rbac-permission-matrix-cell">
                                      <span className="rbac-action-na">-</span>
                                    </td>
                                    )
                                  }
                                  return (
                                    <td key={`${teamRow.key}-${action}`} className="rbac-permission-matrix-cell">
                                      <input
                                        type="checkbox"
                                        checked={state.checked}
                                      ref={(el) => {
                                        if (el) el.indeterminate = state.indeterminate
                                      }}
                                      onChange={(e) => setTicketTeamRowActionChecked(teamRow.key, action, e.target.checked)}
                                      disabled={!canManageUsers}
                                    />
                                  </td>
                                )
                              })}
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td className="rbac-permission-module-cell"><span className="rbac-ticket-team-label">Default</span></td>
                              <td className="rbac-permission-matrix-cell">{actionCell('view')}</td>
                              <td className="rbac-permission-matrix-cell">{actionCell('create')}</td>
                              <td className="rbac-permission-matrix-cell">{actionCell('access')}</td>
                              <td className="rbac-permission-matrix-cell">{actionCell('edit')}</td>
                              <td className="rbac-permission-matrix-cell">{actionCell('export')}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : selectedAgentRow ? null : (
            <div className="rbac-permission-matrix-wrap">
              <table className="rbac-permission-matrix">
                <thead>
                  <tr>
                    <th scope="col">Agent</th>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col">Invite Status</th>
                    <th scope="col">Status</th>
                    <th scope="col">2FA</th>
                    {/* Actions moved to detail view */}
                  </tr>
                </thead>
                <tbody>
                  {usersForServiceTable.length > 0 ? (
                    usersForServiceTable.map((u) => (
                      <tr
                        key={u.id}
                        className="users-row-clickable"
                        onClick={() => {
                          setSelectedAgentRow(u)
                          setSelectedUserId(null)
                        }}
                      >
                        <td>{u.email}</td>
                        <td>{u.name || 'No name'}</td>
                        <td>{getRoleLabel(u)}</td>
                        <td>{titleCase(u.inviteStatus || 'none')}</td>
                        <td>{getDisplayStatus(u)}</td>
                        <td>{u.mfaEnabled ? 'Enabled' : 'Disabled'}</td>
                      </tr>
                    ))
                  ) : usersLoading ? (
                    <tr>
                      <td colSpan={6}>
                        <div className="rbac-empty-state">Loading users...</div>
                      </td>
                    </tr>
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="rbac-empty-state">No users found.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {selectedAgentRow ? (
            <section className="rbac-detail-card">
              <UserDetailView
                mode="agents"
                embedded
                userIdOverride={Number(selectedAgentRow.id)}
                seedUser={selectedAgentRow}
                onClose={() => setSelectedAgentRow(null)}
                onUserUpdated={(next) => {
                  setSelectedAgentRow(next)
                  setUsers((prev) => prev.map((u) => (Number(u.id) === Number(next.id) ? { ...u, ...next } : u)))
                }}
                onUserDeleted={(userId) => {
                  setSelectedAgentRow(null)
                  setUsers((prev) => prev.filter((u) => Number(u.id) !== Number(userId)))
                }}
              />
            </section>
          ) : null}
        </section>
      )}
      {deactivateConfirmUser && (
        <div className="admin-settings-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="deactivate-title">
          <div className="admin-settings-modal">
            <h4 id="deactivate-title">Confirm Deactivation</h4>
            <p>Are you sure you want to deactivate this account?</p>
            <div className="admin-settings-modal-actions">
              <button
                className="admin-settings-ghost"
                onClick={() => setDeactivateConfirmUser(null)}
                disabled={serviceDeactivateBusy}
              >
                Cancel
              </button>
              <button
                className="admin-settings-danger"
                onClick={async () => {
                  if (!deactivateConfirmUser) return
                  await handleDeactivateServiceAccount(deactivateConfirmUser)
                  setDeactivateConfirmUser(null)
                }}
                disabled={serviceDeactivateBusy}
              >
                {serviceDeactivateBusy ? 'Working...' : 'Yes, Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className={`rbac-toast ${toast.type}`}>{toast.text}</div>}
    </>
  )
}

