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
exports.ssoCallback = exports.ssoStart = exports.ssoConfig = exports.googleConfig = exports.updateUserMfaSettings = exports.resetAuthenticator = exports.verifyAuthenticatorSetup = exports.setupAuthenticator = exports.updateMyMfaSettings = exports.getMyMfaSettings = exports.updateMfaPolicy = exports.getMfaPolicy = exports.changePassword = exports.refresh = exports.requestMfaChallenge = exports.verifyMfa = exports.acceptInvite = exports.resetPassword = exports.forgotPassword = exports.loginWithGoogle = exports.login = void 0;
const authService = __importStar(require("./auth.service"));
const invitations_service_1 = require("../users/invitations.service");
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
function toBool(value, fallback = false) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
async function login(req, res) {
    const { email, password, trustedDeviceToken, rememberMe } = req.body || {};
    try {
        const result = await authService.login(email, password, trustedDeviceToken, toBool(rememberMe, false));
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
    const { idToken, trustedDeviceToken, rememberMe } = req.body || {};
    try {
        const result = await authService.loginWithGoogle(idToken, trustedDeviceToken, toBool(rememberMe, false));
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
async function acceptInvite(req, res) {
    const { token, password, name } = req.body || {};
    try {
        const result = await (0, invitations_service_1.acceptInvitationToken)(String(token || ''), String(password || ''), String(name || '') || null, { ipAddress: req.ip });
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 400).json({ error: err.message || 'Unable to accept invitation' });
    }
}
exports.acceptInvite = acceptInvite;
async function verifyMfa(req, res) {
    const { challengeToken, code, dontAskAgain, trustedDeviceLabel, rememberMe } = req.body || {};
    try {
        const result = await authService.verifyMfa(challengeToken, code, Boolean(dontAskAgain), String(trustedDeviceLabel || 'browser'), toBool(rememberMe, false));
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(401).json({ error: err.message || 'Invalid 2FA code' });
    }
}
exports.verifyMfa = verifyMfa;
async function requestMfaChallenge(req, res) {
    const { challengeToken, method } = req.body || {};
    try {
        const normalizedMethod = String(method || '').trim().toLowerCase() === 'authenticator' ? 'authenticator' : 'email';
        const result = await authService.requestMfaChallenge(String(challengeToken || ''), normalizedMethod);
        res.json(result);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(400).json({ error: err.message || 'Unable to create 2FA challenge' });
    }
}
exports.requestMfaChallenge = requestMfaChallenge;
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
async function getMfaPolicy(_req, res) {
    try {
        const data = await authService.getMfaPolicy();
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to load 2FA policy' });
    }
}
exports.getMfaPolicy = getMfaPolicy;
async function updateMfaPolicy(req, res) {
    try {
        const data = await authService.updateMfaPolicy(req.body || {});
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to update 2FA policy' });
    }
}
exports.updateMfaPolicy = updateMfaPolicy;
async function getMyMfaSettings(req, res) {
    try {
        const userId = Number(req?.user?.id || 0);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const data = await authService.getUserMfaState(userId);
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to load 2FA settings' });
    }
}
exports.getMyMfaSettings = getMyMfaSettings;
async function updateMyMfaSettings(req, res) {
    try {
        const userId = Number(req?.user?.id || 0);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const enabled = Boolean((req.body || {}).enabled);
        const data = await authService.setUserMfaEnabled(userId, enabled);
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to update 2FA settings' });
    }
}
exports.updateMyMfaSettings = updateMyMfaSettings;
async function setupAuthenticator(req, res) {
    try {
        const userId = Number(req?.user?.id || 0);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const data = await authService.setupAuthenticator(userId);
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to setup authenticator app' });
    }
}
exports.setupAuthenticator = setupAuthenticator;
async function verifyAuthenticatorSetup(req, res) {
    try {
        const userId = Number(req?.user?.id || 0);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const code = String((req.body || {}).code || '');
        const data = await authService.verifyAuthenticatorSetup(userId, code);
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 400).json({ error: err.message || 'Unable to verify authenticator app setup' });
    }
}
exports.verifyAuthenticatorSetup = verifyAuthenticatorSetup;
async function resetAuthenticator(req, res) {
    try {
        const userId = Number(req?.user?.id || 0);
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const data = await authService.resetAuthenticator(userId);
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to reset authenticator app' });
    }
}
exports.resetAuthenticator = resetAuthenticator;
async function updateUserMfaSettings(req, res) {
    try {
        const userId = Number(req.params?.id || 0);
        if (!userId)
            return res.status(400).json({ error: 'Invalid user id' });
        const enabled = Boolean((req.body || {}).enabled);
        const data = await authService.setUserMfaEnabled(userId, enabled);
        res.json(data);
    }
    catch (err) {
        if (isDbError(err)) {
            res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' });
            return;
        }
        res.status(err.status || 500).json({ error: err.message || 'Unable to update user 2FA settings' });
    }
}
exports.updateUserMfaSettings = updateUserMfaSettings;
async function googleConfig(_req, res) {
    const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
    const hostedDomain = String(process.env.GOOGLE_HOSTED_DOMAIN || '').trim();
    res.json({
        enabled: Boolean(clientId),
        clientId: clientId || null,
        hostedDomain: hostedDomain || null,
    });
}
exports.googleConfig = googleConfig;
function normalizeSsoProvider(value) {
    const provider = String(value || '').trim().toLowerCase();
    if (provider === 'google' || provider === 'zoho' || provider === 'outlook')
        return provider;
    return null;
}
async function ssoConfig(_req, res) {
    try {
        return res.json(authService.getSsoConfig());
    }
    catch (err) {
        return res.status(500).json({ error: err.message || 'Unable to load SSO config' });
    }
}
exports.ssoConfig = ssoConfig;
async function ssoStart(req, res) {
    const provider = normalizeSsoProvider(String(req.params?.provider || ''));
    if (!provider)
        return res.status(400).json({ error: 'Invalid SSO provider' });
    const rememberMeRaw = String(req.query?.rememberMe || '1').trim().toLowerCase();
    const rememberMe = ['1', 'true', 'yes', 'on'].includes(rememberMeRaw);
    try {
        const url = authService.getSsoStartUrl(provider, rememberMe);
        return res.redirect(url);
    }
    catch (err) {
        return res.status(400).json({ error: err.message || 'Unable to start SSO login' });
    }
}
exports.ssoStart = ssoStart;
async function ssoCallback(req, res) {
    const provider = normalizeSsoProvider(String(req.params?.provider || ''));
    if (!provider)
        return res.status(400).send('Invalid SSO provider');
    const code = String(req.query?.code || '').trim();
    const state = String(req.query?.state || '').trim();
    const error = String(req.query?.error || '').trim();
    const errorDescription = String(req.query?.error_description || '').trim();
    const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
    if (error) {
        const message = errorDescription || error;
        return res.redirect(`${frontendBase}/login?ssoError=${encodeURIComponent(message)}`);
    }
    if (!code || !state) {
        return res.redirect(`${frontendBase}/login?ssoError=${encodeURIComponent('Missing SSO callback parameters')}`);
    }
    try {
        const { rememberMe, auth } = await authService.completeSsoCallback(provider, code, state);
        if (auth?.mfaRequired && auth?.challengeToken) {
            const methods = Array.isArray(auth?.availableMethods)
                ? auth.availableMethods.filter((m) => m === 'email' || m === 'authenticator')
                : [];
            const params = new URLSearchParams({
                mode: 'twofa',
                challengeToken: String(auth.challengeToken || ''),
                ...(methods.length ? { methods: methods.join(',') } : {}),
                ...(auth?.maskedEmail ? { maskedEmail: String(auth.maskedEmail) } : {}),
                ...(auth?.defaultMethod ? { defaultMethod: String(auth.defaultMethod) } : {}),
                ...(auth?.user?.name ? { twoFaUser: String(auth.user.name) } : {}),
                ...(auth?.mfaCodePreview ? { twoFaCodePreview: String(auth.mfaCodePreview) } : {}),
            });
            return res.redirect(`${frontendBase}/login?${params.toString()}`);
        }
        const params = new URLSearchParams({
            ssoSuccess: '1',
            rememberMe: rememberMe ? '1' : '0',
            accessToken: String(auth?.accessToken || ''),
            refreshToken: String(auth?.refreshToken || ''),
        });
        return res.redirect(`${frontendBase}/login?${params.toString()}`);
    }
    catch (err) {
        const message = err.message || 'SSO login failed';
        return res.redirect(`${frontendBase}/login?ssoError=${encodeURIComponent(message)}`);
    }
}
exports.ssoCallback = ssoCallback;
