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
exports.repost = exports.remove = exports.update = exports.create = exports.listActive = exports.listAdmin = void 0;
const svc = __importStar(require("./announcements.service"));
async function listAdmin(_req, res) {
    try {
        const rows = await svc.listAnnouncementsAdmin();
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Failed to load announcements' });
    }
}
exports.listAdmin = listAdmin;
async function listActive(req, res) {
    try {
        const typeRaw = String(req.query.type || '').trim().toLowerCase();
        const type = typeRaw === 'general' ? 'general' : typeRaw === 'maintenance' ? 'maintenance' : undefined;
        const rows = await svc.listActiveAnnouncements(type);
        res.json(rows);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Failed to load announcements' });
    }
}
exports.listActive = listActive;
async function create(req, res) {
    try {
        const userId = Number(req.user?.id);
        const row = await svc.createAnnouncement(req.body || {}, Number.isFinite(userId) ? userId : undefined);
        res.json(row);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err?.message || 'Failed to create announcement' });
    }
}
exports.create = create;
async function update(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0)
            return res.status(400).json({ error: 'Invalid announcement id' });
        const userId = Number(req.user?.id);
        const row = await svc.updateAnnouncement(id, req.body || {}, Number.isFinite(userId) ? userId : undefined);
        res.json(row);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err?.message || 'Failed to update announcement' });
    }
}
exports.update = update;
async function remove(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0)
            return res.status(400).json({ error: 'Invalid announcement id' });
        const row = await svc.deleteAnnouncement(id);
        res.json(row);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err?.message || 'Failed to delete announcement' });
    }
}
exports.remove = remove;
async function repost(req, res) {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id) || id <= 0)
            return res.status(400).json({ error: 'Invalid announcement id' });
        const userId = Number(req.user?.id);
        const row = await svc.repostAnnouncement(id, Number.isFinite(userId) ? userId : undefined);
        res.json(row);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err?.message || 'Failed to repost announcement' });
    }
}
exports.repost = repost;
