"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.usersUpdateBodySchema = exports.usersCreateBodySchema = exports.userIdParamsSchema = exports.usersListQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.usersListQuerySchema = zod_1.z.object({
    q: common_1.zMaybeString,
    limit: common_1.zId.optional(),
    role: common_1.zMaybeString,
});
exports.userIdParamsSchema = zod_1.z.object({
    id: common_1.zId,
});
exports.usersCreateBodySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6).optional(),
    name: zod_1.z.string().optional(),
    avatarUrl: zod_1.z.string().optional(),
    phone: zod_1.z.string().optional(),
    client: zod_1.z.string().optional(),
    site: zod_1.z.string().optional(),
    accountManager: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
});
exports.usersUpdateBodySchema = zod_1.z.object({
    email: zod_1.z.string().email().optional(),
    password: zod_1.z.string().min(6).optional(),
    name: zod_1.z.string().optional(),
    avatarUrl: zod_1.z.string().nullable().optional(),
    phone: zod_1.z.string().optional(),
    client: zod_1.z.string().optional(),
    site: zod_1.z.string().optional(),
    accountManager: zod_1.z.string().optional(),
    role: zod_1.z.string().optional(),
    status: zod_1.z.string().optional(),
});
