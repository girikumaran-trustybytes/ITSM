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
exports.remove = exports.update = exports.getOne = exports.list = exports.create = void 0;
const svc = __importStar(require("./suppliers.service"));
const logger_1 = require("../../common/logger/logger");
async function create(req, res) {
    const data = req.body;
    const s = await svc.createSupplier(data);
    await (0, logger_1.auditLog)({ action: 'create_supplier', entity: 'supplier', entityId: s.id, user: req.user?.id, meta: { companyName: s.companyName } });
    res.status(201).json(s);
}
exports.create = create;
async function list(req, res) {
    const q = req.query.q ? String(req.query.q) : undefined;
    const items = await svc.listSuppliers({ q });
    res.json(items);
}
exports.list = list;
async function getOne(req, res) {
    const id = Number(req.params.id);
    const s = await svc.getSupplier(id);
    if (!s)
        return res.status(404).json({ error: 'Not found' });
    res.json(s);
}
exports.getOne = getOne;
async function update(req, res) {
    const id = Number(req.params.id);
    const data = req.body;
    const s = await svc.updateSupplier(id, data);
    if (!s)
        return res.status(404).json({ error: 'Not found' });
    await (0, logger_1.auditLog)({ action: 'update_supplier', entity: 'supplier', entityId: s.id, user: req.user?.id });
    res.json(s);
}
exports.update = update;
async function remove(req, res) {
    const id = Number(req.params.id);
    const deleted = await svc.deleteSupplier(id);
    if (!deleted)
        return res.status(404).json({ error: 'Not found' });
    await (0, logger_1.auditLog)({ action: 'delete_supplier', entity: 'supplier', entityId: deleted.id, user: req.user?.id, meta: { companyName: deleted.companyName } });
    res.json({ ok: true });
}
exports.remove = remove;
