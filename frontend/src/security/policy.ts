export type ItsmNavKey =
  | 'dashboard'
  | 'tickets'
  | 'assets'
  | 'users'
  | 'suppliers'
  | 'accounts'
  | 'reports'
  | 'admin'

type AuthLikeUser = {
  role?: unknown
  roles?: unknown
  permissions?: unknown
}

const NAV_PATHS: Record<ItsmNavKey, string> = {
  dashboard: '/dashboard',
  tickets: '/tickets',
  assets: '/assets',
  users: '/users',
  suppliers: '/supplier',
  accounts: '/accounts',
  reports: '/reports',
  admin: '/admin',
}

const ORDERED_NAV: ItsmNavKey[] = ['dashboard', 'tickets', 'assets', 'users', 'suppliers', 'reports', 'accounts', 'admin']
const DEFAULT_FALLBACK_ROUTE = NAV_PATHS.tickets

function normalizeRoles(user?: AuthLikeUser | null): string[] {
  const rolesFromArray = Array.isArray(user?.roles)
    ? user!.roles
        .map((value: unknown) => String(value || '').trim().toUpperCase())
        .filter((value: string) => value.length > 0)
    : []

  const singleRole = String(user?.role || '').trim().toUpperCase()
  if (singleRole && !rolesFromArray.includes(singleRole)) {
    rolesFromArray.unshift(singleRole)
  }

  return rolesFromArray
}

function normalizePermissions(user?: AuthLikeUser | null): Set<string> {
  const values = Array.isArray(user?.permissions)
    ? user!.permissions
        .map((value: unknown) => String(value || '').trim().toLowerCase())
        .filter((value: string) => value.length > 0)
    : []

  return new Set(values)
}

function hasAnyPermission(permissionSet: Set<string>, candidates: string[]): boolean {
  if (!permissionSet.size) return false
  return candidates.some((candidate) => permissionSet.has(candidate.toLowerCase()))
}

export function canAccessItsmNav(user: AuthLikeUser | null | undefined, nav: ItsmNavKey): boolean {
  if (!user) return false

  const roles = normalizeRoles(user)
  const permissions = normalizePermissions(user)

  if (roles.includes('ADMIN')) return true

  switch (nav) {
    case 'dashboard':
      return (
        roles.includes('AGENT') ||
        hasAnyPermission(permissions, ['itsm.dashboard', 'dashboard:*:view', 'dashboard:*:read'])
      )

    case 'tickets':
      return (
        roles.includes('AGENT') ||
        roles.includes('USER') ||
        hasAnyPermission(permissions, ['itsm.tickets', 'tickets:*:view', 'tickets:*:access', 'ticket:*:view'])
      )

    case 'assets':
      return (
        roles.includes('AGENT') ||
        hasAnyPermission(permissions, ['itsm.assets', 'assets:*:view', 'asset:*:read'])
      )

    case 'users':
      return (
        roles.includes('AGENT') ||
        hasAnyPermission(permissions, ['itsm.users', 'users:*:view', 'user:*:read', 'user:*:view_user'])
      )

    case 'suppliers':
      return (
        roles.includes('AGENT') ||
        hasAnyPermission(permissions, ['itsm.suppliers', 'suppliers:*:view', 'supplier:*:read'])
      )

    case 'reports':
      return (
        roles.includes('AGENT') ||
        hasAnyPermission(permissions, ['reports:*:view', 'report:*:read'])
      )

    case 'accounts':
      return true

    case 'admin':
      return hasAnyPermission(permissions, ['system.configure', 'admin:*:view', 'admin:*:read'])

    default:
      return false
  }
}

export function getVisibleItsmNav(user: AuthLikeUser | null | undefined): ItsmNavKey[] {
  return ORDERED_NAV.filter((nav) => canAccessItsmNav(user, nav))
}

export function canShowPortalSwitchToItsm(user: AuthLikeUser | null | undefined): boolean {
  return getVisibleItsmNav(user).some((nav) => nav !== 'tickets' && nav !== 'accounts')
}

export function getDefaultItsmRoute(user: AuthLikeUser | null | undefined): string {
  for (const nav of ORDERED_NAV) {
    if (canAccessItsmNav(user, nav)) {
      return NAV_PATHS[nav]
    }
  }

  return DEFAULT_FALLBACK_ROUTE
}
