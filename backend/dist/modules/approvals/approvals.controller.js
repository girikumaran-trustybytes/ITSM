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
exports.reject = exports.approve = exports.listByTicket = exports.createApproval = void 0;
const service = __importStar(require("./approvals.service"));
async function createApproval(req, res) {
    const ticketId = Number(req.params.ticketId);
    const approverId = req.body.approverId;
    const approval = await service.createApproval(ticketId, approverId);
    res.status(201).json(approval);
}
exports.createApproval = createApproval;
async function listByTicket(req, res) {
    const ticketId = Number(req.params.ticketId);
    const list = await service.listApprovalsByTicket(ticketId);
    res.json(list);
}
exports.listByTicket = listByTicket;
async function approve(req, res) {
    const approvalId = Number(req.params.approvalId);
    const userId = req.user?.id;
    const comment = req.body.comment;
    const updated = await service.setApprovalStatus(approvalId, 'approved', userId, comment);
    res.json(updated);
}
exports.approve = approve;
async function reject(req, res) {
    const approvalId = Number(req.params.approvalId);
    const userId = req.user?.id;
    const comment = req.body.comment;
    const updated = await service.setApprovalStatus(approvalId, 'rejected', userId, comment);
    res.json(updated);
}
exports.reject = reject;
