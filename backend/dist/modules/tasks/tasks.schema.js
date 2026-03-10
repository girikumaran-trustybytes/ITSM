"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskStatusBodySchema = exports.taskStatusParamsSchema = exports.tasksCreateBodySchema = exports.tasksByTicketParamsSchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.tasksByTicketParamsSchema = zod_1.z.object({
    ticketId: common_1.zId,
});
exports.tasksCreateBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    assignedToId: common_1.zId.optional(),
});
exports.taskStatusParamsSchema = zod_1.z.object({
    taskId: common_1.zId,
});
exports.taskStatusBodySchema = zod_1.z.object({
    status: zod_1.z.string().min(1),
});
