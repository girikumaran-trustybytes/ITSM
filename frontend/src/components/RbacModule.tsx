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
import { getCurrentUser } from '../services/auth.service'
import { updateUser } from '../modules/users/services/user.service'
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
  accessKey?: string
  exportKey?: string
  selected: boolean
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

type TicketTeamGroupRow = {
  key: 'support' | 'hr' | 'management'
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
  const currentUser = getCurrentUser()
  const canManageUsers = useMemo(() => {
    const rawPermissions = Array.isArray((currentUser as any)?.permissions)
      ? (currentUser as any).permissions.map((p: any) => String(p || '').trim().toLowerCase()).filter((p: string) => p.length > 0)
      : []
    if (rawPermissions.length > 0) {
      return rawPermissions.includes('*') || rawPermissions.includes('system.configure')
    }
    const role = String((currentUser as any)?.role || '').trim().toUpperCase()
    return role === 'ADMIN' || isAdmin
  }, [currentUser, isAdmin])

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
    firstName: '',
    lastName: '',
    fullName: '',
    mailId: '',
    role: 'AGENT',
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

  const composeNewUserFullName = () => {
    const first = String(newUser.firstName || '').trim()
    if (first) return first
    return String(newUser.fullName || '').trim()
  }
  const [serviceAccountView, setServiceAccountView] = useState<ServiceAccountView>('none')
  const [serviceExistingUserId, setServiceExistingUserId] = useState<number | null>(null)
  const [newServiceUserId, setNewServiceUserId] = useState<number | null>(null)
  const [convertToServiceAccount, setConvertToServiceAccount] = useState(false)
  const [autoUpgradeQueues, setAutoUpgradeQueues] = useState(true)
  const [selectedServiceQueueIds, setSelectedServiceQueueIds] = useState<string[]>([])
  const [serviceInviteBusy, setServiceInviteBusy] = useState(false)
  const [serviceDeactivateBusy, setServiceDeactivateBusy] = useState(false)
  const [deactivateConfirmUser, setDeactivateConfirmUser] = useState<RbacUserRow | null>(null)

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

  const getRoleLabel = (u: RbacUserRow) => {
    if (u.isServiceAccount) return 'Service Account (Agent)'
    return titleCase(u.role || 'user')
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

  const isAlreadyInvitedStatus = (status: string) => ['invited', 'invited_not_accepted', 'accepted'].includes(status)

  const isAlreadyInvitedOrActiveUser = (u: RbacUserRow) => {
    const inviteStatus = getServiceInviteStatus(u)
    const accountStatus = String(u.status || '').trim().toLowerCase()
    return isAlreadyInvitedStatus(inviteStatus) || accountStatus === 'active'
  }

  const getInviteActionModeForUser = (u: RbacUserRow): 'invite' | 'reinvite' => {
    return isAlreadyInvitedOrActiveUser(u) ? 'reinvite' : 'invite'
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

    const ticketViewKeys = findKeys(['tickets', 'ticket'], ['view', 'read'], 'none')
    const ticketCreateKeys = findKeys(['tickets', 'ticket'], ['create', 'add'], 'none')
    const ticketAccessGlobalKeys = findKeys(['tickets', 'ticket'], ['access'], 'none')
    const ticketExportGlobalKeys = findKeys(['tickets', 'ticket'], ['export'], 'none')

    const teamAccessByQueue = queueIds.reduce<Record<string, string>>((acc, queueId) => {
      const row = entries.find((entry) =>
        String(entry.module || '').toLowerCase() === 'ticket'
        && String(entry.queue || '').toLowerCase() === queueId
        && String(entry.action || '').toLowerCase() === 'access'
      )
      if (row?.permissionKey) acc[queueId] = row.permissionKey
      return acc
    }, {})

    const teamExportByQueue = queueIds.reduce<Record<string, string>>((acc, queueId) => {
      const row = entries.find((entry) =>
        String(entry.module || '').toLowerCase() === 'ticket'
        && String(entry.queue || '').toLowerCase() === queueId
        && String(entry.action || '').toLowerCase() === 'export'
      )
      if (row?.permissionKey) acc[queueId] = row.permissionKey
      return acc
    }, {})

    const ticketAccessKeys = [...Object.values(teamAccessByQueue), ...ticketAccessGlobalKeys]
    const ticketExportKeys = [...Object.values(teamExportByQueue), ...ticketExportGlobalKeys]

    const ticketTeams: TicketTeamState[] = normalizedQueueOptions.map((team) => ({
      id: team.id,
      label: team.label,
      accessKey: teamAccessByQueue[team.id],
      exportKey: teamExportByQueue[team.id],
      selected: Boolean(teamAccessByQueue[team.id] && permissions[teamAccessByQueue[team.id]]),
    }))

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
        showTeams: key === 'ticket' && actions.access.checked,
        teams: key === 'ticket' ? ticketTeams : [],
      }
    }

    return [
      buildModule('ticket', 'Ticket', {
        view: ticketViewKeys,
        create: ticketCreateKeys,
        access: ticketAccessKeys,
        edit: findKeys(['tickets', 'ticket'], ['edit', 'update'], 'none'),
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

    if (moduleKey === 'ticket' && actionKey === 'access') {
      module.teams.forEach((team) => {
        if (team.accessKey) next[team.accessKey] = checked
        if (!checked && team.exportKey) next[team.exportKey] = false
      })
    }

    if (moduleKey === 'ticket' && actionKey === 'export') {
      const selectedTeamIds = new Set(module.teams.filter((team) => team.selected).map((team) => team.id))
      module.teams.forEach((team) => {
        if (team.exportKey) next[team.exportKey] = checked && (selectedTeamIds.size === 0 || selectedTeamIds.has(team.id))
      })
    }

    if (moduleKey === 'ticket' && actionKey === 'view' && !checked) {
      // Enforce: if "View" is unchecked, all other actions in the same module must be unchecked.
      ;(Object.keys(module.actions) as PermissionActionKey[])
        .filter((key) => key !== 'view')
        .forEach((key) => {
          module.actions[key].keys.forEach((permissionKey) => {
            next[permissionKey] = false
          })
        })
      module.teams.forEach((team) => {
        if (team.accessKey) next[team.accessKey] = false
        if (team.exportKey) next[team.exportKey] = false
      })
    }

    setPermissions(next)
    syncTemplateState(next)
  }

  const setTicketTeamChecked = (teamId: string, checked: boolean) => {
    const ticket = permissionModules.find((row) => row.key === 'ticket')
    if (!ticket) return
    const team = ticket.teams.find((row) => row.id === teamId)
    if (!team?.accessKey) return
    const next = { ...permissions, [team.accessKey]: checked }
    if (team.exportKey && ticket.actions.export.checked) {
      next[team.exportKey] = checked
    }
    setPermissions(next)
    syncTemplateState(next)
  }

  const ticketTeamGroups = useMemo<TicketTeamGroupRow[]>(() => {
    const ticket = permissionModules.find((row) => row.key === 'ticket')
    if (!ticket) return []
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
    const hrTeams = ticket.teams.filter((team) => /(^|[^a-z])hr([^a-z]|$)/i.test(team.label))
    const managementTeamsRaw = ticket.teams.filter((team) => /(management|admin|mgr)/i.test(team.label))
    const supportTeamsRaw = ticket.teams.filter((team) => !hrTeams.includes(team) && !managementTeamsRaw.includes(team))
    const managementTeams = managementTeamsRaw.length > 0 ? managementTeamsRaw : supportTeamsRaw
    const supportTeams = supportTeamsRaw

    const build = (key: TicketTeamGroupRow['key'], label: string, teams: TicketTeamState[]): TicketTeamGroupRow => ({
      key,
      label,
      actions: {
        view: ticket.actions.view,
        create: ticket.actions.create,
        edit: ticket.actions.edit,
        access: byAction(teams.map((team) => team.accessKey).filter((k): k is string => Boolean(k))),
        export: byAction(teams.map((team) => team.exportKey).filter((k): k is string => Boolean(k))),
      },
    })

    return [
      build('support', 'Support Team', supportTeams),
      build('hr', 'HR Team', hrTeams),
      build('management', 'Management', managementTeams),
    ]
  }, [permissionModules, permissions])

  const setTicketTeamGroupActionChecked = (groupKey: TicketTeamGroupRow['key'], action: PermissionActionKey, checked: boolean) => {
    if (action === 'view' || action === 'create' || action === 'edit') {
      setModuleActionChecked('ticket', action, checked)
      return
    }
    const group = ticketTeamGroups.find((row) => row.key === groupKey)
    if (!group) return
    const keys = group.actions[action].keys
    if (keys.length === 0) return
    const next = { ...permissions }
    keys.forEach((k) => {
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
    if (!canManageUsers) {
      const msg = 'Forbidden: missing permission system.configure'
      setModalError(msg)
      notify('error', msg)
      return
    }
    setModalError('')
    const mailId = newUser.mailId.trim()
    const fullName = composeNewUserFullName()
    if (!fullName || !mailId) {
      const msg = 'Name and Mail ID is required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    try {
      const created = await createRbacUser({
        fullName,
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
        role: String(newUser.role || 'AGENT').toUpperCase(),
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
      firstName: '',
      lastName: '',
      fullName: '',
      mailId: '',
      role: 'AGENT',
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
    if (!canManageUsers) {
      notify('error', 'Forbidden: missing permission system.configure')
      return
    }
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
    const mailId = newUser.mailId.trim()
    const fullName = composeNewUserFullName()
    const userName = String(newUser.firstName || '').trim()
    if (!userName || !mailId) {
      const msg = 'User name and Email ID are required.'
      setModalError(msg)
      notify('error', msg)
      return
    }
    try {
      const created = await createRbacUser({
        fullName,
        email: mailId,
        mailId,
        role: String(newUser.role || 'AGENT').toUpperCase(),
      })
      setNewServiceUserId(null)
      notify('ok', 'User created. Send invitation to activate account.')
      await loadUsers()
      setNewUser((prev) => ({
        ...prev,
        firstName: '',
        lastName: '',
        fullName: '',
        mailId: '',
        role: 'AGENT',
      }))
    } catch (error: any) {
      const msg = error?.response?.data?.error || 'Failed to create user'
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
      if (Number(error?.response?.status || 0) === 403) {
        notify('error', 'Forbidden: missing permission system.configure')
      } else {
        notify('error', error?.response?.data?.error || 'Failed to process service account invite')
      }
    } finally {
      setServiceInviteBusy(false)
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
      if (Number(error?.response?.status || 0) === 403) {
        notify('error', 'Forbidden: missing permission system.configure')
      } else {
        notify('error', error?.response?.data?.error || 'Failed to process service account invite')
      }
    } finally {
      setServiceInviteBusy(false)
    }
  }

  const handleDeactivateServiceAccount = async (user: RbacUserRow) => {
    const targetUserId = Number(user?.id || 0)
    if (!targetUserId) {
      notify('error', 'Invalid user selected')
      return
    }
    try {
      setServiceDeactivateBusy(true)
      await updateUser(targetUserId, { role: 'USER', isServiceAccount: false })
      await loadUsers()
      if (selectedUserId === targetUserId) {
        setSelectedUserId(null)
      }
      notify('ok', 'Service account deactivated')
    } catch (error: any) {
      if (Number(error?.response?.status || 0) === 403) {
        notify('error', 'Forbidden: missing permission system.configure')
      } else {
        notify('error', error?.response?.data?.error || 'Failed to deactivate service account')
      }
    } finally {
      setServiceDeactivateBusy(false)
    }
  }

  return (
    <>
      <div className="rbac-top-action-row">
        <div className="rbac-top-action-title">User & Access management</div>
        <div className="rbac-top-action-actions">
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
              setServiceAccountView('picker')
            }}
            disabled={!canManageUsers}
          >
            <span className="rbac-add-btn-plus" aria-hidden="true">+</span>
            <span>Add Service Account (Agent)</span>
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
                    <h4>Add service account from existing user</h4>
                    <p>Select a current user to add or edit queue-scoped service account settings.</p>
                  </button>
                  <button className="rbac-service-account-picker-card" onClick={() => setServiceAccountView('new-user')}>
                    <h4>Add new user for service account</h4>
                    <p>Create a new user first, then continue with service account conversion and queue scope.</p>
                  </button>
                </div>
              </>
            )}

            {serviceAccountView === 'existing-user' && (
              <div className="rbac-service-account-form">
                <div className="rbac-service-account-head">
                  <h3>Add service account from existing user</h3>
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
                      disabled={serviceInviteBusy || !canTriggerActiveServiceInvite || !canManageUsers}
                      title={activeServiceInviteMode === 'invite' ? 'Send invite' : 'Send re-invite'}
                    >
                      {serviceInviteBusy ? 'Processing...' : activeServiceInviteMode === 'invite' ? 'Invite' : 'Reinvite'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {serviceAccountView === 'new-user' && (
              <div className="rbac-service-account-form">
                <div className="rbac-service-account-head">
                  <h3>Add new user for service account</h3>
                  <button className="admin-settings-ghost" onClick={() => setServiceAccountView('picker')}>Back</button>
                </div>
                {modalError && <div className="rbac-modal-error">{modalError}</div>}
                <div className="rbac-user-template-grid">
                  <label>User name<input placeholder="User name" value={newUser.firstName} onChange={(e) => setNewUser((p) => ({ ...p, firstName: e.target.value, fullName: e.target.value }))} /></label>
                  <label>Email ID<input placeholder="name@company.com" value={newUser.mailId} onChange={(e) => setNewUser((p) => ({ ...p, mailId: e.target.value }))} /></label>
                  <label>Role
                    <select value={String(newUser.role || 'AGENT').toUpperCase()} onChange={(e) => setNewUser((p) => ({ ...p, role: String(e.target.value || 'AGENT').toUpperCase() }))}>
                      <option value="AGENT">Agent</option>
                      <option value="ADMIN">Admin</option>
                    </select>
                  </label>
                </div>
                <div className="rbac-service-account-actions">
                  <button className="admin-settings-primary" onClick={handleCreateUserAndContinueServiceAccount} disabled={!canManageUsers}>Create User</button>
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
              {addStep === 1 && <button className="admin-settings-primary" onClick={handleAddUser} disabled={!canManageUsers}>Save</button>}
            </div>
          </div>
        </section>
      ) : (
        <section className="rbac-module-card">
          {selectedUserId ? (
            <div className="rbac-module-sections">
              {permissionModules.map((module) => {
                const ticketViewChecked = module.key !== 'ticket' || module.actions.view.checked
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
                      disabled={!canManageUsers || (module.key === 'ticket' && action !== 'view' && !ticketViewChecked)}
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
                            ticketTeamGroups.map((group) => (
                              <tr key={`${module.key}-${group.key}`}>
                                <td className="rbac-permission-module-cell">
                                  <span className="rbac-ticket-team-label">{group.label}</span>
                                </td>
                                {(['view', 'create', 'access', 'edit', 'export'] as PermissionActionKey[]).map((action) => {
                                  const state = group.actions[action]
                                  if (state.keys.length === 0) {
                                    return (
                                      <td key={`${group.key}-${action}`} className="rbac-permission-matrix-cell">
                                        <span className="rbac-action-na">-</span>
                                      </td>
                                    )
                                  }
                                  return (
                                    <td key={`${group.key}-${action}`} className="rbac-permission-matrix-cell">
                                      <input
                                        type="checkbox"
                                        checked={state.checked}
                                        ref={(el) => {
                                          if (el) el.indeterminate = state.indeterminate
                                        }}
                                        onChange={(e) => setTicketTeamGroupActionChecked(group.key, action, e.target.checked)}
                                        disabled={!canManageUsers || (!ticketViewChecked && action !== 'view')}
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
          ) : (
            <div className="rbac-permission-matrix-wrap">
              <table className="rbac-permission-matrix">
                <thead>
                  <tr>
                    <th scope="col">Service Account (Agent)</th>
                    <th scope="col">Name</th>
                    <th scope="col">Role</th>
                    <th scope="col">Invite Status</th>
                    <th scope="col">Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {usersForServiceTable.length > 0 ? (
                    usersForServiceTable.map((u) => (
                      <tr key={u.id}>
                        <td>{u.email}</td>
                        <td>{u.name || 'No name'}</td>
                        <td>{getRoleLabel(u)}</td>
                        <td>{titleCase(u.inviteStatus || 'none')}</td>
                        <td>{getDisplayStatus(u)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {(() => {
                              const inviteMode = getInviteActionModeForUser(u)
                              const isReinvite = inviteMode === 'reinvite'
                              return (
                                <>
                                  <button className="admin-settings-ghost" onClick={() => setSelectedUserId(Number(u.id))}>
                                    Edit
                                  </button>
                                  <button
                                    className="admin-settings-ghost"
                                    onClick={() => handleServiceAccountInviteActionForUser(u, inviteMode)}
                                    disabled={serviceInviteBusy || (isReinvite ? !isAlreadyInvitedOrActiveUser(u) : isAlreadyInvitedOrActiveUser(u)) || !canManageUsers}
                                    title={isReinvite ? 'Send re-invite' : 'Send invite'}
                                  >
                                    {serviceInviteBusy ? 'Processing...' : isReinvite ? 'Reinvite' : 'Invite'}
                                  </button>
                                  <button
                                    className="admin-settings-danger"
                                    onClick={() => setDeactivateConfirmUser(u)}
                                    disabled={serviceDeactivateBusy || !canManageUsers || !u.isServiceAccount}
                                    title="Remove agent permissions and keep as user"
                                  >
                                    {serviceDeactivateBusy ? 'Working...' : 'Deactivate'}
                                  </button>
                                </>
                              )
                            })()}
                          </div>
                        </td>
                      </tr>
                    ))
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

