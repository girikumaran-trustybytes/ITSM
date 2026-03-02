export type AppRole = 'ADMIN' | 'AGENT' | 'USER' | 'GUEST'
type AuthLike = { role?: unknown; roles?: unknown; permissions?: unknown }

export type ItsmNavKey =
  | 'dashboard'
  | 'tickets'
  | 'assets'
  | 'users'
  | 'suppliers'
  | 'accounts'
  | 'reports'
  | 'admin'
  | 'security'

const AGENT_ITSM_TABS: ItsmNavKey[] = ['dashboard', 'tickets', 'assets', 'users', 'suppliers', 'accounts']

export function normalizeRole(input: unknown): AppRole {
  const role = String(input || '').trim().toUpperCase()
  if (role === 'ADMIN' || role === 'ADMINISTRATOR') return 'ADMIN'
  if (
    role === 'AGENT' ||
    role === 'SERVICE ACCOUNT (AGENT)' ||
    role === 'SERVICE ACCOUNT AGENT' ||
    role === 'SERVICE_ACCOUNT_AGENT'
  ) return 'AGENT'
  if (role === 'USER' || role === 'END USER' || role === 'END_USER') return 'USER'
  return 'GUEST'
}

export function isPortalOnlyRole(roleInput: unknown): boolean {
  const role = normalizeRole(roleInput)
  if (roleInput && typeof roleInput === 'object') {
    const auth = roleInput as AuthLike
    const roles = normalizeRoleList(auth.roles)
    if (role === 'ADMIN' || role === 'AGENT') return false
    if (roles.includes('ADMIN') || roles.includes('AGENT')) return false
  }
  return role === 'USER'
}

function normalizeRoleList(input: unknown): AppRole[] {
  if (!Array.isArray(input)) return []
  const roles = new Set<AppRole>()
  for (const candidate of input) {
    const normalized = normalizeRole(candidate)
    if (normalized !== 'GUEST') roles.add(normalized)
  }
  return Array.from(roles)
}

function normalizePermissionList(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  const permissions = new Set<string>()
  for (const candidate of input) {
    const normalized = String(candidate || '').trim().toLowerCase()
    if (normalized) permissions.add(normalized)
  }
  return Array.from(permissions)
}

export function canAccessItsm(userInput: { role?: unknown; roles?: unknown; permissions?: unknown } | null | undefined): boolean {
  if (!userInput) return false
  const primaryRole = normalizeRole(userInput.role)
  if (primaryRole === 'ADMIN' || primaryRole === 'AGENT') return true
  const roles = normalizeRoleList(userInput.roles)
  if (roles.includes('ADMIN') || roles.includes('AGENT')) return true
  const permissions = normalizePermissionList(userInput.permissions)
  return permissions.includes('*') || permissions.includes('itsm.access')
}

export function canShowPortalSwitchToItsm(userInput: { role?: unknown; roles?: unknown; permissions?: unknown } | null | undefined): boolean {
  if (!userInput) return false
  if (normalizeRole(userInput.role) === 'USER') return false
  return canAccessItsm(userInput)
}

export function canAccessItsmNav(roleInput: unknown, nav: ItsmNavKey): boolean {
  let roleInputValue: unknown = roleInput
  let rolesInputValue: unknown = undefined
  let permissionsInputValue: unknown = undefined
  if (roleInput && typeof roleInput === 'object') {
    const auth = roleInput as AuthLike
    roleInputValue = auth.role
    rolesInputValue = auth.roles
    permissionsInputValue = auth.permissions
  }
  const role = normalizeRole(roleInputValue)
  const roles = normalizeRoleList(rolesInputValue)
  const hasAdmin = role === 'ADMIN' || roles.includes('ADMIN')
  const hasAgent = role === 'AGENT' || roles.includes('AGENT')
  const permissions = normalizePermissionList(permissionsInputValue)
  const hasAdminPermission = permissions.includes('*') || permissions.includes('system.configure')

  if (nav === 'admin') {
    return hasAdmin || hasAdminPermission
  }

  if (hasAdmin) return true
  if (hasAgent) {
    if (nav === 'security') return true
    return AGENT_ITSM_TABS.includes(nav)
  }
  if (permissions.includes('*') || permissions.includes('itsm.access') || permissions.includes(`itsm.${nav}`)) {
    return true
  }
  return false
}

export function getVisibleItsmNav(roleInput: unknown): ItsmNavKey[] {
  const ordered: ItsmNavKey[] = ['dashboard', 'tickets', 'assets', 'users', 'suppliers', 'accounts', 'reports', 'admin']
  return ordered.filter((nav) => canAccessItsmNav(roleInput, nav))
}

export function getDefaultItsmRoute(roleInput: unknown): string {
  if (roleInput && typeof roleInput === 'object') {
    const auth = roleInput as AuthLike
    const role = normalizeRole(auth.role)
    const roles = normalizeRoleList(auth.roles)
    if (role === 'ADMIN' || roles.includes('ADMIN')) return '/dashboard'
    if (role === 'AGENT' || roles.includes('AGENT')) return '/dashboard'
    const permissions = normalizePermissionList(auth.permissions)
    if (permissions.includes('*') || permissions.includes('itsm.access')) return '/dashboard'
    return '/portal/home'
  }
  const role = normalizeRole(roleInput)
  if (role === 'ADMIN' || role === 'AGENT') return '/dashboard'
  return '/portal/home'
}
