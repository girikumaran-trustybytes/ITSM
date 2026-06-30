"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventsListQuerySchema = void 0;
const zod_1 = require("zod");
exports.eventsListQuerySchema = zod_1.z.object({
    sinceId: zod_1.z.coerce.number().int().nonnegative().optional(),
    limit: zod_1.z.coerce.number().int().min(1).max(500).optional(),
});
