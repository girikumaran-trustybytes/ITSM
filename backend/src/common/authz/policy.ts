export type SystemRole = 'ADMIN' | 'AGENT' | 'USER' | 'SUPPLIER' | 'CUSTOM' | 'GUEST'

export type PermissionKey =
  | 'portal.access'
  | 'itsm.access'
  | 'itsm.dashboard'
  | 'itsm.tickets'
  | 'itsm.assets'
  | 'itsm.users'
  | 'itsm.suppliers'
  | 'itsm.accounts'
  | 'ticket.view'
  | 'ticket.access'
  | 'ticket.export'
  | 'ticket.create'
  | 'ticket.view.own'
  | 'ticket.view.team'
  | 'ticket.view.assigned'
  | 'ticket.view.all'
  | 'ticket.update.own'
  | 'ticket.update'
  | 'asset.view'
  | 'asset.create'
  | 'asset.edit'
  | 'asset.export'
  | 'user.view'
  | 'user.create'
  | 'user.edit'
  | 'user.export'
  | 'supplier.view'
  | 'supplier.create'
  | 'supplier.edit'
  | 'supplier.export'
  | 'account.view'
  | 'system.configure'
  | '*'

export const ITSM_AGENT_TABS = ['dashboard', 'tickets', 'assets', 'users', 'suppliers', 'accounts'] as const
export type ItsmTab = (typeof ITSM_AGENT_TABS)[number] | 'reports' | 'admin'

const ROLE_PERMISSION_MAP: Record<SystemRole, PermissionKey[]> = {
  ADMIN: ['*'],
  AGENT: [
    'portal.access',
    'itsm.access',
    'itsm.dashboard',
    'itsm.tickets',
    'itsm.assets',
    'itsm.users',
    'itsm.suppliers',
    'itsm.accounts',
    'ticket.create',
    'ticket.view.team',
    'ticket.view.assigned',
    'ticket.update',
    'asset.view',
    'user.view',
    'supplier.view',
    'account.view',
  ],
  USER: [
    'portal.access',
    'ticket.create',
    'ticket.view.own',
    'ticket.update.own',
  ],
  SUPPLIER: [],
  CUSTOM: [],
  GUEST: [],
}

const ROLE_PRIORITY: SystemRole[] = ['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM']

function normalizeRoleValue(input: unknown): SystemRole | null {
  const role = String(input || '').trim().toUpperCase()
  if (role === 'ADMIN' || role === 'AGENT' || role === 'USER' || role === 'SUPPLIER' || role === 'CUSTOM') {
    return role
  }
  return null
}

function extractRoles(input: unknown): SystemRole[] {
  if (Array.isArray(input)) {
    const roles = input.map((value) => normalizeRoleValue(value)).filter(Boolean) as SystemRole[]
    return Array.from(new Set(roles))
  }

  if (input && typeof input === 'object') {
    const obj = input as any
    const fromRoles = Array.isArray(obj.roles)
      ? obj.roles.map((value: unknown) => normalizeRoleValue(value)).filter(Boolean) as SystemRole[]
      : []
    const fromRole = normalizeRoleValue(obj.role)
    const merged = fromRole ? [...fromRoles, fromRole] : fromRoles
    const unique = Array.from(new Set(merged))
    if (unique.length > 0) return unique
  }

  const single = normalizeRoleValue(input)
  return single ? [single] : []
}

function extractPermissions(input: unknown): string[] {
  if (!input || typeof input !== 'object') return []
  const permissions = (input as any).permissions
  if (!Array.isArray(permissions)) return []
  return Array.from(
    new Set(
      permissions
        .map((permission: unknown) => String(permission || '').trim())
        .filter((permission: string) => permission.length > 0)
    )
  )
}

export function normalizeRole(input: unknown): SystemRole {
  const roles = extractRoles(input)
  for (const priority of ROLE_PRIORITY) {
    if (roles.includes(priority)) return priority
  }
  return 'GUEST'
}

export function getRolePermissions(roleInput: unknown): PermissionKey[] {
  const explicitPermissions = extractPermissions(roleInput)
  if (explicitPermissions.length > 0) return explicitPermissions as PermissionKey[]

  const roles = extractRoles(roleInput)
  if (roles.length === 0) return ROLE_PERMISSION_MAP.GUEST

  const merged = new Set<PermissionKey>()
  for (const role of roles) {
    for (const permission of ROLE_PERMISSION_MAP[role] || []) merged.add(permission)
  }
  if (merged.size === 0) return ROLE_PERMISSION_MAP.GUEST
  return Array.from(merged)
}

export function hasPermission(roleInput: unknown, permission: PermissionKey): boolean {
  const permissions = getRolePermissions(roleInput)
  if (permissions.includes('*') || permissions.includes(permission)) return true

  const aliasMap: Record<string, string[]> = {
    'itsm.tickets': ['itsm.tickets', 'ticket.view', 'ticket.access', 'tickets:*:view', 'tickets:*:access'],
    'itsm.assets': ['itsm.assets', 'asset.view', 'assets:*:view'],
    'itsm.users': ['itsm.users', 'user.view', 'users:*:view'],
    'itsm.suppliers': ['itsm.suppliers', 'supplier.view', 'suppliers:*:view'],
    'ticket.view': ['ticket.view', 'ticket.view.team', 'ticket.view.assigned', 'ticket.view.all', 'tickets:*:view', 'itsm.tickets'],
    'ticket.access': ['ticket.access', 'tickets:*:access', 'itsm.tickets'],
    'ticket.create': ['ticket.create', 'tickets:*:create', 'itsm.tickets'],
    'ticket.export': ['ticket.export', 'tickets:*:export', 'itsm.tickets'],
    'asset.view': ['asset.view', 'assets:*:view', 'itsm.assets'],
    'asset.create': ['asset.create', 'assets:*:create', 'itsm.assets'],
    'asset.edit': ['asset.edit', 'assets:*:edit', 'itsm.assets'],
    'asset.export': ['asset.export', 'assets:*:export', 'itsm.assets'],
    'user.view': ['user.view', 'users:*:view', 'itsm.users'],
    'user.create': ['user.create', 'users:*:create', 'itsm.users'],
    'user.edit': ['user.edit', 'users:*:edit', 'itsm.users'],
    'user.export': ['user.export', 'users:*:export', 'itsm.users'],
    'supplier.view': ['supplier.view', 'suppliers:*:view', 'itsm.suppliers'],
    'supplier.create': ['supplier.create', 'suppliers:*:create', 'itsm.suppliers'],
    'supplier.edit': ['supplier.edit', 'suppliers:*:edit', 'itsm.suppliers'],
    'supplier.export': ['supplier.export', 'suppliers:*:export', 'itsm.suppliers'],
  }
  const aliases = aliasMap[String(permission)] || []
  return aliases.some((alias) => permissions.includes(alias as PermissionKey))
}

export function canAccessItsmTab(roleInput: unknown, tab: ItsmTab): boolean {
  const permissions = getRolePermissions(roleInput)
  if (permissions.includes('*')) return true
  const permissionByTab: Record<ItsmTab, PermissionKey | null> = {
    dashboard: 'itsm.dashboard',
    tickets: 'itsm.tickets',
    assets: 'itsm.assets',
    users: 'itsm.users',
    suppliers: 'itsm.suppliers',
    accounts: 'itsm.accounts',
    reports: null,
    admin: 'system.configure',
  }
  const mappedPermission = permissionByTab[tab]
  if (!mappedPermission) return false
  return permissions.includes(mappedPermission)
}
