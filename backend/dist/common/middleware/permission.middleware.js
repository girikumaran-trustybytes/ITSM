"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAnyPermission = exports.requirePermission = void 0;
const logger_1 = require("../logger/logger");
const policy_1 = require("../authz/policy");
function deny(req, res, permission, reason) {
    const user = req.user || {};
    void (0, logger_1.auditLog)({
        action: 'access_denied',
        entity: 'authorization',
        user: user?.id,
        meta: {
            permission,
            reason,
            role: (0, policy_1.normalizeRole)(user),
            roles: Array.isArray(user?.roles) ? user.roles : [user?.role].filter(Boolean),
            path: req.originalUrl,
            method: req.method,
        },
    });
    return res.status(403).json({ error: 'Forbidden' });
}
function requirePermission(permission) {
    return (req, res, next) => {
        const user = req.user;
        if (!(0, policy_1.hasPermission)(user, permission)) {
            return deny(req, res, permission, 'missing_permission');
        }
        return next();
    };
}
exports.requirePermission = requirePermission;
function requireAnyPermission(permissions) {
    return (req, res, next) => {
        const user = req.user;
        if (!permissions.some((permission) => (0, policy_1.hasPermission)(user, permission))) {
            return deny(req, res, permissions[0] || 'portal.access', 'missing_any_permission');
        }
        return next();
    };
}
exports.requireAnyPermission = requireAnyPermission;
