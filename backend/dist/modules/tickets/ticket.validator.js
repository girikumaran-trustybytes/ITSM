"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateTransition = exports.validateCreate = void 0;
function validateCreate(payload) {
    if (!payload)
        return { ok: false, message: 'Missing body' };
    if (!payload.subject || typeof payload.subject !== 'string')
        return { ok: false, message: 'Missing subject' };
    if (!payload.type || typeof payload.type !== 'string')
        return { ok: false, message: 'Missing type' };
    return { ok: true };
}
exports.validateCreate = validateCreate;
function validateTransition(body) {
    if (!body || !body.to)
        return { ok: false, message: 'Missing "to" state' };
    return { ok: true };
}
exports.validateTransition = validateTransition;
