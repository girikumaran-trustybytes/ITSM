"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.servicesUpdateBodySchema = exports.servicesCreateBodySchema = exports.serviceIdParamsSchema = exports.servicesListQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.servicesListQuerySchema = zod_1.z.object({
    q: common_1.zMaybeString,
});
exports.serviceIdParamsSchema = zod_1.z.object({
    id: common_1.zId,
});
exports.servicesCreateBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    description: zod_1.z.string().optional(),
});
exports.servicesUpdateBodySchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().optional(),
});
