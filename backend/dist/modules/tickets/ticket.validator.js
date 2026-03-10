"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransition = exports.validateUpdate = exports.validateCreate = void 0;
function validateCreate(payload) {
    if (!payload)
        return { ok: false, message: 'Missing body' };
    if ((!payload.subject && !payload.summary) || (payload.subject && typeof payload.subject !== 'string') || (payload.summary && typeof payload.summary !== 'string')) {
        return { ok: false, message: 'Missing subject' };
    }
    if (!payload.type || typeof payload.type !== 'string')
        return { ok: false, message: 'Missing type' };
    return { ok: true };
}
exports.validateCreate = validateCreate;
function validateUpdate(payload) {
    if (!payload)
        return { ok: false, message: 'Missing body' };
    // allow partial updates but ensure types are correct when present
    if (payload.subject && typeof payload.subject !== 'string')
        return { ok: false, message: 'Invalid subject' };
    if (payload.summary && typeof payload.summary !== 'string')
        return { ok: false, message: 'Invalid subject' };
    if (payload.type && typeof payload.type !== 'string')
        return { ok: false, message: 'Invalid type' };
    return { ok: true };
}
exports.validateUpdate = validateUpdate;
function validateTransition(body) {
    if (!body || !body.to)
        return { ok: false, message: 'Missing "to" state' };
    return { ok: true };
}
exports.validateTransition = validateTransition;
