"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authVerifyMfaBodySchema = exports.authResetPasswordBodySchema = exports.authForgotPasswordBodySchema = exports.authGoogleBodySchema = exports.authRefreshQuerySchema = exports.authRefreshParamsSchema = exports.authRefreshBodySchema = exports.authLoginQuerySchema = exports.authLoginParamsSchema = exports.authLoginBodySchema = void 0;
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
exports.authGoogleBodySchema = zod_1.z.object({
    idToken: zod_1.z.string().min(1),
});
exports.authForgotPasswordBodySchema = zod_1.z.object({
    email: zod_1.z.string().email(),
});
exports.authResetPasswordBodySchema = zod_1.z.object({
    token: zod_1.z.string().min(1),
    password: zod_1.z.string().min(8),
});
exports.authVerifyMfaBodySchema = zod_1.z.object({
    challengeToken: zod_1.z.string().min(1),
    code: zod_1.z.string().min(4).max(8),
});
