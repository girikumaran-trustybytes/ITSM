"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvalActionBodySchema = exports.approvalActionParamsSchema = exports.approvalsCreateBodySchema = exports.approvalsByTicketParamsSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.approvalsByTicketParamsSchema = zod_1.z.object({
    ticketId: common_1.zId,
});
exports.approvalsCreateBodySchema = zod_1.z.object({
    approverId: common_1.zId.optional(),
});
exports.approvalActionParamsSchema = zod_1.z.object({
    approvalId: common_1.zId,
});
exports.approvalActionBodySchema = zod_1.z.object({
    comment: zod_1.z.string().optional(),
});
