"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.googleConfig = exports.changePassword = exports.refresh = exports.verifyMfa = exports.resetPassword = exports.forgotPassword = exports.loginWithGoogle = exports.login = void 0;
const authService = __importStar(require("./auth.service"));
function isDbError(err) {
    const name = err?.constructor?.name ?? '';
    const msg = (err?.message ?? '').toLowerCase();
    const code = err?.code ?? '';
    return (name.includes('Postgres') ||
        msg.includes('database') ||
        msg.includes('postgres') ||
        msg.includes('db connection') ||
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        code === '57P01' || // admin shutdown
        code === '57P03' || // cannot connect now
        code === '53300' // too many connections
    );
}
async function login(req, res) {
    const { email, password } = req.body;
    try {
        const result = await authService.login(email, password);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(401).json({ error: err.message || 'Invalid credentials' });
    }
}
exports.login = login;
async function loginWithGoogle(req, res) {
    const { idToken } = req.body;
    try {
        const result = await authService.loginWithGoogle(idToken);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(401).json({ error: err.message || 'Google login failed' });
    }
}
exports.loginWithGoogle = loginWithGoogle;
async function forgotPassword(req, res) {
    const { email } = req.body;
    try {
        const result = await authService.forgotPassword(email);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 400).json({ error: err.message || 'Unable to process request' });
    }
}
exports.forgotPassword = forgotPassword;
async function resetPassword(req, res) {
    const { token, password } = req.body;
    try {
        const result = await authService.resetPassword(token, password);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(400).json({ error: err.message || 'Unable to reset password' });
    }
}
exports.resetPassword = resetPassword;
async function verifyMfa(req, res) {
    const { challengeToken, code } = req.body;
    try {
        const result = await authService.verifyMfa(challengeToken, code);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(401).json({ error: err.message || 'Invalid MFA code' });
    }
}
exports.verifyMfa = verifyMfa;
async function refresh(req, res) {
    const { refreshToken } = req.body;
    try {
        const result = await authService.refresh(refreshToken);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(401).json({ error: err.message || 'Unauthorized' });
    }
}
exports.refresh = refresh;
async function changePassword(req, res) {
    const { currentPassword, newPassword } = req.body || {};
    const userId = Number(req?.user?.id || 0);
    try {
        const result = await authService.changePassword(userId, String(currentPassword || ''), String(newPassword || ''));
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(400).json({ error: err.message || 'Unable to change password' });
    }
}
exports.changePassword = changePassword;
async function googleConfig(_req, res) {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    res.json({
        enabled: Boolean(clientId),
        clientId: clientId || null,
    });
}
exports.googleConfig = googleConfig;
