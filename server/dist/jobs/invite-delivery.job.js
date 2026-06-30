"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startInviteDeliveryRetryJob = void 0;
const logger_1 = __importDefault(require("../common/logger/logger"));
const db_1 = require("../db");
const rbac_service_1 = require("../modules/users/rbac.service");
function toBool(value, fallback) {
    if (value === undefined || value === null || value === '')
        return fallback;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized))
        return true;
    if (['0', 'false', 'no', 'off'].includes(normalized))
        return false;
    return fallback;
}
function toInt(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.max(1, Math.floor(n));
}
function isTransientInviteError(error) {
    const rawCode = String(error?.code || '').trim().toUpperCase();
    const code = rawCode.startsWith('SMTP_') ? rawCode.slice(5) : rawCode;
    const message = String(error?.message || '').toLowerCase();
    return (code === 'ETIMEDOUT' ||
        code === 'ECONNRESET' ||
        code === 'ECONNREFUSED' ||
        code === 'EHOSTUNREACH' ||
        code === 'ENETUNREACH' ||
        code === 'ENOTFOUND' ||
        code === 'EAI_AGAIN' ||
        code === 'ESOCKET' ||
        code === 'EPIPE' ||
        message.includes('timeout') ||
        message.includes('connection closed') ||
        message.includes('socket hang up') ||
        message.includes('greeting never received'));
}
const INVITE_RETRY_INTERVAL_MS = Math.max(30000, toInt(process.env.INVITE_RETRY_INTERVAL_MS, 120000));
const INVITE_RETRY_BATCH_SIZE = Math.max(1, toInt(process.env.INVITE_RETRY_BATCH_SIZE, 5));
const INVITE_RETRY_BACKOFF_MS = Math.max(30000, toInt(process.env.INVITE_RETRY_BACKOFF_MS, 180000));
const INVITE_RETRY_MAX_TRACKED_USERS = Math.max(200, toInt(process.env.INVITE_RETRY_MAX_TRACKED_USERS, 2000));
let running = false;
const lastAttemptAtByUserId = new Map();
function rememberAttempt(userId, now) {
    lastAttemptAtByUserId.set(userId, now);
    if (lastAttemptAtByUserId.size <= INVITE_RETRY_MAX_TRACKED_USERS)
        return;
    const entries = Array.from(lastAttemptAtByUserId.entries()).sort((a, b) => a[1] - b[1]);
    while (entries.length > INVITE_RETRY_MAX_TRACKED_USERS) {
        const [oldUserId] = entries.shift();
        lastAttemptAtByUserId.delete(oldUserId);
    }
}
async function fetchPendingInviteUsers(limit) {
    return (0, db_1.query)(`
      WITH latest AS (
        SELECT DISTINCT ON (i.user_id)
          i.user_id,
          i.status,
          i.token_hash,
          i.expires_at,
          i.last_sent_at,
          i.created_at
        FROM invitations i
        WHERE i.user_id IS NOT NULL
        ORDER BY i.user_id, i.created_at DESC
      )
      SELECT user_id
      FROM latest
      WHERE UPPER(COALESCE(status, '')) = 'PENDING'
        AND last_sent_at IS NULL
        AND token_hash IS NOT NULL
        AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY user_id ASC
      LIMIT $1
    `, [limit]);
}
async function runInviteDeliverySweep() {
    if (running)
        return;
    running = true;
    try {
        const candidates = await fetchPendingInviteUsers(INVITE_RETRY_BATCH_SIZE * 3);
        if (!Array.isArray(candidates) || candidates.length === 0)
            return;
        const now = Date.now();
        const eligible = candidates
            .map((row) => Number(row?.user_id || 0))
            .filter((userId) => userId > 0)
            .filter((userId) => {
            const last = Number(lastAttemptAtByUserId.get(userId) || 0);
            return now - last >= INVITE_RETRY_BACKOFF_MS;
        })
            .slice(0, INVITE_RETRY_BATCH_SIZE);
        for (const userId of eligible) {
            rememberAttempt(userId, Date.now());
            try {
                const result = await (0, rbac_service_1.sendUserInvite)(userId, undefined, { mode: 'reinvite' });
                logger_1.default.info('invite_retry_sent', {
                    userId,
                    inviteStatus: result?.inviteStatus || null,
                    sentTo: result?.sentTo || null,
                    delivery: result?.delivery || 'sent',
                });
            }
            catch (error) {
                logger_1.default.warn('invite_retry_failed', {
                    userId,
                    transient: isTransientInviteError(error),
                    code: error?.code || null,
                    message: error?.message || String(error),
                });
            }
        }
    }
    catch (error) {
        logger_1.default.warn('invite_retry_job_failed', { error: error?.message || String(error) });
    }
    finally {
        running = false;
    }
}
function startInviteDeliveryRetryJob() {
    const enabled = toBool(process.env.INVITE_RETRY_ENABLED, true);
    if (!enabled) {
        logger_1.default.info('invite_retry_job_skipped', { reason: 'disabled' });
        return;
    }
    void runInviteDeliverySweep();
    setInterval(() => {
        void runInviteDeliverySweep();
    }, INVITE_RETRY_INTERVAL_MS);
    logger_1.default.info('invite_retry_job_started', {
        intervalMs: INVITE_RETRY_INTERVAL_MS,
        batchSize: INVITE_RETRY_BATCH_SIZE,
        backoffMs: INVITE_RETRY_BACKOFF_MS,
    });
}
exports.startInviteDeliveryRetryJob = startInviteDeliveryRetryJob;
