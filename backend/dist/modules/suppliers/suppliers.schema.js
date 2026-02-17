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
const zContactNumber = zod_1.z
    .union([
    zod_1.z.string().regex(/^\d+$/, 'Contact Number must be numeric'),
    zod_1.z.number().int().nonnegative(),
])
    .transform((value) => String(value));
exports.suppliersCreateBodySchema = zod_1.z.object({
    companyName: zod_1.z.string().min(1),
    companyMail: zod_1.z.string().email().optional(),
    contactPerson: zod_1.z.string().optional(),
    contactName: zod_1.z.string().optional(),
    contactEmail: zod_1.z.string().email().optional(),
    contactNumber: zContactNumber.optional(),
    slaTerms: zod_1.z.string().optional(),
}).transform((data) => ({
    ...data,
    contactPerson: data.contactPerson ?? data.contactName,
}));
exports.suppliersUpdateBodySchema = zod_1.z.object({
    companyName: zod_1.z.string().min(1).optional(),
    companyMail: zod_1.z.string().email().optional(),
    contactPerson: zod_1.z.string().optional(),
    contactName: zod_1.z.string().optional(),
    contactEmail: zod_1.z.string().email().optional(),
    contactNumber: zContactNumber.optional(),
    slaTerms: zod_1.z.string().optional(),
}).transform((data) => ({
    ...data,
    contactPerson: data.contactPerson ?? data.contactName,
}));
