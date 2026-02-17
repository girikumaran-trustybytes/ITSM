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
exports.updateStatus = exports.listByTicket = exports.createTask = void 0;
const service = __importStar(require("./tasks.service"));
async function createTask(req, res) {
    try {
        const ticketId = String(req.params.ticketId || '');
        const { name, assignedToId } = req.body;
        const task = await service.createTask(ticketId, name, assignedToId);
        res.status(201).json(task);
    }
    catch (err) {
        res.status(err?.status || 500).json({ error: err?.message || 'Failed to create task' });
    }
}
exports.createTask = createTask;
async function listByTicket(req, res) {
    try {
        const ticketId = String(req.params.ticketId || '');
        const list = await service.listTasksByTicket(ticketId);
        res.json(list);
    }
    catch (err) {
        res.status(err?.status || 500).json({ error: err?.message || 'Failed to list tasks' });
    }
}
exports.listByTicket = listByTicket;
async function updateStatus(req, res) {
    try {
        const taskId = Number(req.params.taskId);
        const { status } = req.body;
        const updated = await service.updateTaskStatus(taskId, status);
        res.json(updated);
    }
    catch (err) {
        res.status(err?.status || 500).json({ error: err?.message || 'Failed to update task status' });
    }
}
exports.updateStatus = updateStatus;
