"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTaskStatus = exports.listTasksByTicket = exports.createTask = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function createTask(ticketId, name, assignedToId) {
    return client_1.default.task.create({ data: { ticketId, name, assignedToId: assignedToId || null } });
}
exports.createTask = createTask;
async function listTasksByTicket(ticketId) {
    return client_1.default.task.findMany({ where: { ticketId } });
}
exports.listTasksByTicket = listTasksByTicket;
async function updateTaskStatus(taskId, status) {
    return client_1.default.task.update({ where: { id: taskId }, data: { status, completedAt: status === 'completed' ? new Date() : undefined } });
}
exports.updateTaskStatus = updateTaskStatus;
