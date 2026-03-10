"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRolePermissions = exports.normalizeRole = void 0;
const ROLE_PERMISSIONS = {
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
};
function normalizeRole(role) {
    const value = String(role || '').trim().toUpperCase();
    if (value === 'ADMIN')
        return 'ADMIN';
    if (value === 'AGENT')
        return 'AGENT';
    if (value === 'USER')
        return 'USER';
    if (value === 'SUPPLIER')
        return 'SUPPLIER';
    return 'CUSTOM';
}
exports.normalizeRole = normalizeRole;
function normalizeRoleList(input) {
    const values = [];
    const roleArray = Array.isArray(input.roles) ? input.roles : [];
    for (const item of roleArray) {
        values.push(normalizeRole(item));
    }
    const primary = normalizeRole(input.role);
    if (!values.includes(primary))
        values.unshift(primary);
    return Array.from(new Set(values));
}
function getRolePermissions(input) {
    const roles = normalizeRoleList(input);
    const merged = [];
    for (const role of roles) {
        merged.push(...(ROLE_PERMISSIONS[role] || []));
    }
    return Array.from(new Set(merged.filter((permission) => String(permission || '').trim().length > 0)));
}
exports.getRolePermissions = getRolePermissions;
