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
exports.putState = exports.getState = exports.list = void 0;
const svc = __importStar(require("./notifications.service"));
async function list(req, res) {
    try {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const items = await svc.listNotifications(req.user, { limit });
        res.json(items);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Failed to load notifications' });
    }
}
exports.list = list;
async function getState(req, res) {
    try {
        const state = await svc.getNotificationState(req.user);
        res.json(state);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Failed to load notification state' });
    }
}
exports.getState = getState;
async function putState(req, res) {
    try {
        const body = req.body || {};
        const state = await svc.saveNotificationState(req.user, {
            readIds: Array.isArray(body.readIds) ? body.readIds : [],
            deletedIds: Array.isArray(body.deletedIds) ? body.deletedIds : [],
            clearedAt: body.clearedAt,
        });
        res.json(state);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Failed to save notification state' });
    }
}
exports.putState = putState;
