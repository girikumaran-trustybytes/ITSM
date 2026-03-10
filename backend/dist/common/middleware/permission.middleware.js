"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAnyPermission = exports.requirePermission = void 0;
const logger_1 = require("../logger/logger");
function getUserRoles(user) {
    const roles = Array.isArray(user?.roles)
        ? user.roles.map((role) => String(role || '').trim().toUpperCase()).filter((role) => role.length > 0)
        : [];
    const primary = String(user?.role || '').trim().toUpperCase();
    if (primary && !roles.includes(primary))
        roles.unshift(primary);
    return roles;
}
function getUserPermissions(user) {
    return Array.isArray(user?.permissions)
        ? user.permissions.map((permission) => String(permission || '').trim()).filter((permission) => permission.length > 0)
        : [];
}
function hasPermission(granted, required) {
    if (!required)
        return true;
    if (granted.includes('*'))
        return true;
    return granted.includes(required);
}
function deny(req, res, reason, required) {
    const user = req.user || {};
    void (0, logger_1.auditLog)({
        action: 'access_denied',
        entity: 'permission',
        user: user?.id,
        meta: {
            reason,
            required,
            role: String(user?.role || '').toUpperCase(),
            roles: getUserRoles(user),
            permissions: getUserPermissions(user),
            method: req.method,
            path: req.originalUrl,
        },
    });
    return res.status(403).json({ error: 'Forbidden' });
}
function requirePermission(permission) {
    const required = String(permission || '').trim();
    return (req, res, next) => {
        const user = req.user;
        if (!user?.id)
            return res.status(401).json({ error: 'Unauthorized' });
        const roles = getUserRoles(user);
        if (roles.includes('ADMIN'))
            return next();
        const granted = getUserPermissions(user);
        if (hasPermission(granted, required))
            return next();
        return deny(req, res, 'missing_permission', [required]);
    };
}
exports.requirePermission = requirePermission;
function requireAnyPermission(permissions) {
    const required = (Array.isArray(permissions) ? permissions : [])
        .map((permission) => String(permission || '').trim())
        .filter((permission) => permission.length > 0);
    return (req, res, next) => {
        const user = req.user;
        if (!user?.id)
            return res.status(401).json({ error: 'Unauthorized' });
        const roles = getUserRoles(user);
        if (roles.includes('ADMIN'))
            return next();
        const granted = getUserPermissions(user);
        if (required.some((permission) => hasPermission(granted, permission)))
            return next();
        return deny(req, res, 'missing_any_permission', required);
    };
}
exports.requireAnyPermission = requireAnyPermission;
