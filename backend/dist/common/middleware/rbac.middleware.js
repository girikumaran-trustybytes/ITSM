"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permit = void 0;
function permit(roles) {
    return (req, res, next) => {
        const user = req.user || { role: 'guest' };
        const actualRole = String(user.role || '').toUpperCase();
        const allowedRoles = roles.map((r) => String(r || '').toUpperCase());
        if (allowedRoles.includes(actualRole))
            return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}
exports.permit = permit;
