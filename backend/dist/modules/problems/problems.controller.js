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
exports.remove = exports.update = exports.create = exports.getOne = exports.list = void 0;
const svc = __importStar(require("./problems.service"));
const logger_1 = require("../../common/logger/logger");
async function list(req, res) {
    const q = req.query.q ? String(req.query.q) : undefined;
    const items = await svc.listProblems({ q });
    res.json(items);
}
exports.list = list;
async function getOne(req, res) {
    const id = Number(req.params.id);
    if (!id)
        return res.status(400).json({ error: 'Invalid id' });
    const item = await svc.getProblem(id);
    if (!item)
        return res.status(404).json({ error: 'Not found' });
    res.json(item);
}
exports.getOne = getOne;
async function create(req, res) {
    try {
        const created = await svc.createProblem(req.body || {});
        await (0, logger_1.auditLog)({ action: 'create_problem', entity: 'problem', entityId: created.id, user: req.user?.id, meta: { code: created.code } });
        res.status(201).json(created);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to create problem' });
    }
}
exports.create = create;
async function update(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const updated = await svc.updateProblem(id, req.body || {});
        await (0, logger_1.auditLog)({ action: 'update_problem', entity: 'problem', entityId: updated.id, user: req.user?.id });
        res.json(updated);
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to update problem' });
    }
}
exports.update = update;
async function remove(req, res) {
    try {
        const id = Number(req.params.id);
        if (!id)
            return res.status(400).json({ error: 'Invalid id' });
        const deleted = await svc.deleteProblem(id);
        await (0, logger_1.auditLog)({ action: 'delete_problem', entity: 'problem', entityId: deleted.id, user: req.user?.id, meta: { code: deleted.code } });
        res.json({ success: true, deleted });
    }
    catch (err) {
        res.status(err.status || 500).json({ error: err.message || 'Failed to delete problem' });
    }
}
exports.remove = remove;
