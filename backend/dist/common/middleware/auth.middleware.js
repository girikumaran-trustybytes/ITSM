"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateJWT = exports.mockAuth = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret';
function mockAuth(req, _res, next) {
    const user = req.header('X-User') || 'anonymous';
    const role = req.header('X-User-Role') || 'guest';
    req.user = { id: user, role };
    next();
}
exports.mockAuth = mockAuth;
function authenticateJWT(req, res, next) {
    // Let CORS preflight checks pass through without token validation.
    if (req.method === 'OPTIONS')
        return next();
    const auth = req.header('Authorization');
    if (!auth)
        return res.status(401).json({ error: 'Missing Authorization header' });
    const parts = auth.split(' ');
    if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer')
        return res.status(401).json({ error: 'Invalid Authorization format' });
    const token = parts[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
        req.user = { id: payload.sub, role: payload.role, name: payload.name, email: payload.email };
        next();
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
exports.authenticateJWT = authenticateJWT;
