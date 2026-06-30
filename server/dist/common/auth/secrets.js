"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRequiredSecret = void 0;
const BLOCKED_DEFAULT_SECRETS = new Set([
    'access_secret',
    'refresh_secret',
    'secret',
    'changeme',
    'change-me',
    'default',
]);
function normalizeSecret(value) {
    return String(value || '').trim();
}
function getRequiredSecret(envName) {
    const secret = normalizeSecret(process.env[envName] || '');
    if (!secret) {
        throw new Error(`${envName} is required and must be configured`);
    }
    if (BLOCKED_DEFAULT_SECRETS.has(secret.toLowerCase())) {
        throw new Error(`${envName} uses an insecure default value`);
    }
    return secret;
}
exports.getRequiredSecret = getRequiredSecret;
