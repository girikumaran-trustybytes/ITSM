"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.permit = void 0;
function permit(roles) {
    return (req, res, next) => {
        const user = req.user || { role: 'guest' };
        if (roles.includes(user.role))
            return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}
exports.permit = permit;
