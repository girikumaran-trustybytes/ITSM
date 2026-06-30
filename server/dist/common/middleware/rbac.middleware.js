"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permit = void 0;
const logger_1 = require("../logger/logger");
function permit(roles) {
    return (req, res, next) => {
        const user = req.user || { role: 'guest' };
        const actualRoles = Array.isArray(user.roles)
            ? user.roles.map((role) => String(role || '').toUpperCase())
            : [];
        const fallbackRole = String(user.role || '').toUpperCase();
        if (fallbackRole && !actualRoles.includes(fallbackRole))
            actualRoles.push(fallbackRole);
        const allowedRoles = roles.map((r) => String(r || '').toUpperCase());
        if (allowedRoles.some((allowedRole) => actualRoles.includes(allowedRole)))
            return next();
        void (0, logger_1.auditLog)({
            action: 'access_denied',
            entity: 'authorization',
            user: user?.id,
            meta: {
                requiredRoles: allowedRoles,
                actualRoles,
                method: req.method,
                path: req.originalUrl,
            },
        });
        return res.status(403).json({ error: 'Forbidden' });
    };
}
exports.permit = permit;
