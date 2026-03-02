"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canAccessItsmTab = exports.hasPermission = exports.getRolePermissions = exports.normalizeRole = exports.ITSM_AGENT_TABS = void 0;
exports.ITSM_AGENT_TABS = ['dashboard', 'tickets', 'assets', 'users', 'suppliers', 'accounts'];
const ROLE_PERMISSION_MAP = {
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
};
const ROLE_PRIORITY = ['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM'];
function normalizeRoleValue(input) {
    const role = String(input || '').trim().toUpperCase();
    if (role === 'ADMIN' || role === 'AGENT' || role === 'USER' || role === 'SUPPLIER' || role === 'CUSTOM') {
        return role;
    }
    return null;
}
function extractRoles(input) {
    if (Array.isArray(input)) {
        const roles = input.map((value) => normalizeRoleValue(value)).filter(Boolean);
        return Array.from(new Set(roles));
    }
    if (input && typeof input === 'object') {
        const obj = input;
        const fromRoles = Array.isArray(obj.roles)
            ? obj.roles.map((value) => normalizeRoleValue(value)).filter(Boolean)
            : [];
        const fromRole = normalizeRoleValue(obj.role);
        const merged = fromRole ? [...fromRoles, fromRole] : fromRoles;
        const unique = Array.from(new Set(merged));
        if (unique.length > 0)
            return unique;
    }
    const single = normalizeRoleValue(input);
    return single ? [single] : [];
}
function extractPermissions(input) {
    if (!input || typeof input !== 'object')
        return [];
    const permissions = input.permissions;
    if (!Array.isArray(permissions))
        return [];
    return Array.from(new Set(permissions
        .map((permission) => String(permission || '').trim())
        .filter((permission) => permission.length > 0)));
}
function normalizeRole(input) {
    const roles = extractRoles(input);
    for (const priority of ROLE_PRIORITY) {
        if (roles.includes(priority))
            return priority;
    }
    return 'GUEST';
}
exports.normalizeRole = normalizeRole;
function getRolePermissions(roleInput) {
    const explicitPermissions = extractPermissions(roleInput);
    if (explicitPermissions.length > 0)
        return explicitPermissions;
    const roles = extractRoles(roleInput);
    if (roles.length === 0)
        return ROLE_PERMISSION_MAP.GUEST;
    const merged = new Set();
    for (const role of roles) {
        for (const permission of ROLE_PERMISSION_MAP[role] || [])
            merged.add(permission);
    }
    if (merged.size === 0)
        return ROLE_PERMISSION_MAP.GUEST;
    return Array.from(merged);
}
exports.getRolePermissions = getRolePermissions;
function hasPermission(roleInput, permission) {
    const permissions = getRolePermissions(roleInput);
    if (permissions.includes('*') || permissions.includes(permission))
        return true;
    const aliasMap = {
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
    };
    const aliases = aliasMap[String(permission)] || [];
    return aliases.some((alias) => permissions.includes(alias));
}
exports.hasPermission = hasPermission;
function canAccessItsmTab(roleInput, tab) {
    const permissions = getRolePermissions(roleInput);
    if (permissions.includes('*'))
        return true;
    const permissionByTab = {
        dashboard: 'itsm.dashboard',
        tickets: 'itsm.tickets',
        assets: 'itsm.assets',
        users: 'itsm.users',
        suppliers: 'itsm.suppliers',
        accounts: 'itsm.accounts',
        reports: null,
        admin: 'system.configure',
    };
    const mappedPermission = permissionByTab[tab];
    if (!mappedPermission)
        return false;
    return permissions.includes(mappedPermission);
}
exports.canAccessItsmTab = canAccessItsmTab;
