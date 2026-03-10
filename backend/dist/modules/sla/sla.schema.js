"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.slaUpdateBodySchema = exports.slaCreateBodySchema = exports.slaIdParamsSchema = exports.slaListQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.slaListQuerySchema = zod_1.z.object({
    q: common_1.zMaybeString,
});
exports.slaIdParamsSchema = zod_1.z.object({
    id: common_1.zId,
});
exports.slaCreateBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    priority: zod_1.z.string().min(1),
    priorityRank: zod_1.z.number().int().min(1).max(4).optional(),
    format: zod_1.z.string().min(1).optional(),
    responseTimeMin: zod_1.z.number().nonnegative(),
    resolutionTimeMin: zod_1.z.number().nonnegative(),
    businessHours: zod_1.z.boolean().optional(),
    timeZone: zod_1.z.string().min(1).optional(),
    businessSchedule: zod_1.z.record(zod_1.z.any()).optional(),
    active: zod_1.z.boolean().optional(),
});
exports.slaUpdateBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    priority: zod_1.z.string().min(1).optional(),
    priorityRank: zod_1.z.number().int().min(1).max(4).optional(),
    format: zod_1.z.string().min(1).optional(),
    responseTimeMin: zod_1.z.number().nonnegative().optional(),
    resolutionTimeMin: zod_1.z.number().nonnegative().optional(),
    businessHours: zod_1.z.boolean().optional(),
    timeZone: zod_1.z.string().min(1).optional(),
    businessSchedule: zod_1.z.record(zod_1.z.any()).optional(),
    active: zod_1.z.boolean().optional(),
});
