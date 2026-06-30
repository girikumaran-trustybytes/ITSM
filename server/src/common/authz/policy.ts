export type KnownRole = 'ADMIN' | 'AGENT' | 'USER' | 'SUPPLIER' | 'CUSTOM'

export type RoleInput = {
  role?: unknown
  roles?: unknown
}

const ROLE_PERMISSIONS: Record<KnownRole, string[]> = {
  ADMIN: [
    '*',
    'system.configure',
    'itsm.dashboard',
    'itsm.tickets',
    'itsm.assets',
    'itsm.users',
    'itsm.suppliers',
    'ticket.view',
    'ticket.create',
    'ticket.update',
    'ticket.delete',
    'ticket.access',
    'ticket.view.own',
    'ticket.update.own',
    'asset.view',
    'asset.create',
    'asset.edit',
    'asset.delete',
    'user.view',
    'supplier.view',
    'supplier.create',
    'supplier.edit',
    'portal.access',
  ],
  AGENT: [
    'itsm.dashboard',
    'itsm.tickets',
    'itsm.assets',
    'itsm.users',
    'itsm.suppliers',
    'ticket.view',
    'ticket.create',
    'ticket.update',
    'ticket.access',
    'ticket.view.own',
    'ticket.update.own',
    'asset.view',
    'asset.create',
    'asset.edit',
    'user.view',
    'supplier.view',
    'supplier.create',
    'supplier.edit',
    'portal.access',
  ],
  USER: [
    'itsm.tickets',
    'ticket.view',
    'ticket.create',
    'ticket.access',
    'ticket.view.own',
    'ticket.update.own',
    'portal.access',
  ],
  SUPPLIER: [
    'ticket.view',
    'ticket.access',
    'supplier.view',
    'reports.view',
  ],
  CUSTOM: [
    'ticket.view.own',
    'ticket.update.own',
  ],
}

export function normalizeRole(role: unknown): KnownRole {
  const value = String(role || '').trim().toUpperCase()
  if (value === 'ADMIN') return 'ADMIN'
  if (value === 'AGENT') return 'AGENT'
  if (value === 'USER') return 'USER'
  if (value === 'SUPPLIER') return 'SUPPLIER'
  return 'CUSTOM'
}

function normalizeRoleList(input: RoleInput): KnownRole[] {
  const values: KnownRole[] = []
  const roleArray = Array.isArray(input.roles) ? input.roles : []
  for (const item of roleArray) {
    values.push(normalizeRole(item))
  }

  const primary = normalizeRole(input.role)
  if (!values.includes(primary)) values.unshift(primary)
  return Array.from(new Set(values))
}

export function getRolePermissions(input: RoleInput): string[] {
  const roles = normalizeRoleList(input)
  const merged: string[] = []

  for (const role of roles) {
    merged.push(...(ROLE_PERMISSIONS[role] || []))
  }

  return Array.from(new Set(merged.filter((permission) => String(permission || '').trim().length > 0)))
}