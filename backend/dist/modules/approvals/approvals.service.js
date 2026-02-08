"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.setApprovalStatus = exports.listApprovalsByTicket = exports.createApproval = void 0;
const client_1 = __importDefault(require("../../prisma/client"));
async function createApproval(ticketId, approverId) {
    return client_1.default.approval.create({
        data: {
            ticketId,
            approverId: approverId || null,
        },
    });
}
exports.createApproval = createApproval;
async function listApprovalsByTicket(ticketId) {
    return client_1.default.approval.findMany({ where: { ticketId } });
}
exports.listApprovalsByTicket = listApprovalsByTicket;
async function setApprovalStatus(approvalId, status, approverId, comment) {
    return client_1.default.approval.update({
        where: { id: approvalId },
        data: { status, approverId: approverId || undefined, comment, approvedAt: status === 'approved' ? new Date() : undefined },
    });
}
exports.setApprovalStatus = setApprovalStatus;
