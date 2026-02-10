"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.suppliersUpdateBodySchema = exports.suppliersCreateBodySchema = exports.supplierIdParamsSchema = exports.suppliersListQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.suppliersListQuerySchema = zod_1.z.object({
    q: common_1.zMaybeString,
});
exports.supplierIdParamsSchema = zod_1.z.object({
    id: common_1.zId,
});
exports.suppliersCreateBodySchema = zod_1.z.object({
    companyName: zod_1.z.string().min(1),
    contactName: zod_1.z.string().optional(),
    contactEmail: zod_1.z.string().email().optional(),
    slaTerms: zod_1.z.string().optional(),
});
exports.suppliersUpdateBodySchema = zod_1.z.object({
    companyName: zod_1.z.string().min(1).optional(),
    contactName: zod_1.z.string().optional(),
    contactEmail: zod_1.z.string().email().optional(),
    slaTerms: zod_1.z.string().optional(),
});
