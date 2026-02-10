"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsWebhookQuerySchema = exports.notificationsWebhookParamsSchema = exports.notificationsWebhookBodySchema = void 0;
const zod_1 = require("zod");
exports.notificationsWebhookBodySchema = zod_1.z.object({
    event: zod_1.z.string().min(1).optional(),
    type: zod_1.z.string().min(1).optional(),
    payload: zod_1.z.record(zod_1.z.any()).optional(),
});
exports.notificationsWebhookParamsSchema = zod_1.z.object({});
exports.notificationsWebhookQuerySchema = zod_1.z.object({});
