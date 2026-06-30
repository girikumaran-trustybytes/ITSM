"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changesUpdateBodySchema = exports.changesCreateBodySchema = exports.changeIdParamsSchema = exports.changesListQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.changesListQuerySchema = zod_1.z.object({
    q: common_1.zMaybeString,
});
exports.changeIdParamsSchema = zod_1.z.object({
    id: common_1.zId,
});
exports.changesCreateBodySchema = zod_1.z.object({
    code: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    status: zod_1.z.string().optional(),
});
exports.changesUpdateBodySchema = zod_1.z.object({
    code: zod_1.z.string().min(1).optional(),
    title: zod_1.z.string().min(1).optional(),
    status: zod_1.z.string().optional(),
});
