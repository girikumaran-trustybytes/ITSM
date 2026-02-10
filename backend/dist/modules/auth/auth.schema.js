"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRefreshQuerySchema = exports.authRefreshParamsSchema = exports.authRefreshBodySchema = exports.authLoginQuerySchema = exports.authLoginParamsSchema = exports.authLoginBodySchema = void 0;
const zod_1 = require("zod");
exports.authLoginBodySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(1),
});
exports.authLoginParamsSchema = zod_1.z.object({});
exports.authLoginQuerySchema = zod_1.z.object({});
exports.authRefreshBodySchema = zod_1.z.object({
    refreshToken: zod_1.z.string().min(1),
});
exports.authRefreshParamsSchema = zod_1.z.object({});
exports.authRefreshQuerySchema = zod_1.z.object({});
