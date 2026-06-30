"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleNotificationWebhook = exports.verifyNotificationWebhook = void 0;
const crypto_1 = require("crypto");
const logger_1 = __importDefault(require("../../common/logger/logger"));
const WEBHOOK_SIGNATURE_TOLERANCE_MS = Math.max(30000, Number(process.env.WEBHOOK_SIGNATURE_TOLERANCE_MS || 300000));
function timingSafeMatch(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    if (leftBuffer.length !== rightBuffer.length)
        return false;
    return (0, crypto_1.timingSafeEqual)(leftBuffer, rightBuffer);
}
function parseSignatureTimestamp(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed)
        return null;
    if (/^\d+$/.test(trimmed)) {
        const numeric = Number(trimmed);
        if (!Number.isFinite(numeric))
            return null;
        return trimmed.length <= 10 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}
function getRawBody(req) {
    const rawBody = req.rawBody;
    if (typeof rawBody === 'string')
        return rawBody;
    return JSON.stringify(req.body || {});
}
function getWebhookSecret() {
    return String(process.env.WEBHOOK_NOTIFICATIONS_SECRET || '').trim();
}
function getBearerToken(req) {
    const auth = String(req.header('Authorization') || '').trim();
    if (!auth)
        return '';
    const [scheme, token] = auth.split(/\s+/);
    if (String(scheme || '').toLowerCase() !== 'bearer')
        return '';
    return String(token || '').trim();
}
function verifyNotificationWebhook(req, res, next) {
    const secret = getWebhookSecret();
    if (!secret) {
        logger_1.default.error('webhook_notifications_secret_missing');
        return res.status(503).json({ error: 'Webhook secret is not configured' });
    }
    const signature = String(req.header('X-Webhook-Signature') || '').trim();
    const timestampHeader = String(req.header('X-Webhook-Timestamp') || '').trim();
    if (signature || timestampHeader) {
        if (!signature || !timestampHeader) {
            return res.status(401).json({ error: 'Invalid webhook signature headers' });
        }
        const timestamp = parseSignatureTimestamp(timestampHeader);
        if (!timestamp || Math.abs(Date.now() - timestamp) > WEBHOOK_SIGNATURE_TOLERANCE_MS) {
            return res.status(401).json({ error: 'Webhook signature expired or invalid timestamp' });
        }
        const payload = `${timestampHeader}.${getRawBody(req)}`;
        const expected = `sha256=${(0, crypto_1.createHmac)('sha256', secret).update(payload).digest('hex')}`;
        if (!timingSafeMatch(expected, signature)) {
            return res.status(401).json({ error: 'Invalid webhook signature' });
        }
        return next();
    }
    const providedSecret = String(req.header('X-Webhook-Secret') || '').trim() || getBearerToken(req);
    if (!providedSecret || !timingSafeMatch(secret, providedSecret)) {
        return res.status(401).json({ error: 'Invalid webhook secret' });
    }
    return next();
}
exports.verifyNotificationWebhook = verifyNotificationWebhook;
async function handleNotificationWebhook(req, res) {
    const eventType = String(req.body?.type || 'notification');
    logger_1.default.info('webhook_notifications_received', {
        eventType,
        hasPayload: Boolean(req.body && Object.keys(req.body || {}).length > 0),
    });
    res.status(202).json({ received: true });
}
exports.handleNotificationWebhook = handleNotificationWebhook;
