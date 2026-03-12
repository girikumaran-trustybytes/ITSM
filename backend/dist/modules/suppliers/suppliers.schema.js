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
    contactPerson2: zod_1.z.string().optional(),
    contactEmail2: zod_1.z.string().email().optional(),
    contactNumber2: zContactNumber.optional(),
    contactPerson3: zod_1.z.string().optional(),
    contactEmail3: zod_1.z.string().email().optional(),
    contactNumber3: zContactNumber.optional(),
    contactPerson4: zod_1.z.string().optional(),
    contactEmail4: zod_1.z.string().email().optional(),
    contactNumber4: zContactNumber.optional(),
    contactPerson5: zod_1.z.string().optional(),
    contactEmail5: zod_1.z.string().email().optional(),
    contactNumber5: zContactNumber.optional(),
    contactPerson6: zod_1.z.string().optional(),
    contactEmail6: zod_1.z.string().email().optional(),
    contactNumber6: zContactNumber.optional(),
    contactPerson7: zod_1.z.string().optional(),
    contactEmail7: zod_1.z.string().email().optional(),
    contactNumber7: zContactNumber.optional(),
    contactPerson8: zod_1.z.string().optional(),
    contactEmail8: zod_1.z.string().email().optional(),
    contactNumber8: zContactNumber.optional(),
    contactPerson9: zod_1.z.string().optional(),
    contactEmail9: zod_1.z.string().email().optional(),
    contactNumber9: zContactNumber.optional(),
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
    contactPerson2: zod_1.z.string().optional(),
    contactEmail2: zod_1.z.string().email().optional(),
    contactNumber2: zContactNumber.optional(),
    contactPerson3: zod_1.z.string().optional(),
    contactEmail3: zod_1.z.string().email().optional(),
    contactNumber3: zContactNumber.optional(),
    contactPerson4: zod_1.z.string().optional(),
    contactEmail4: zod_1.z.string().email().optional(),
    contactNumber4: zContactNumber.optional(),
    contactPerson5: zod_1.z.string().optional(),
    contactEmail5: zod_1.z.string().email().optional(),
    contactNumber5: zContactNumber.optional(),
    contactPerson6: zod_1.z.string().optional(),
    contactEmail6: zod_1.z.string().email().optional(),
    contactNumber6: zContactNumber.optional(),
    contactPerson7: zod_1.z.string().optional(),
    contactEmail7: zod_1.z.string().email().optional(),
    contactNumber7: zContactNumber.optional(),
    contactPerson8: zod_1.z.string().optional(),
    contactEmail8: zod_1.z.string().email().optional(),
    contactNumber8: zContactNumber.optional(),
    contactPerson9: zod_1.z.string().optional(),
    contactEmail9: zod_1.z.string().email().optional(),
    contactNumber9: zContactNumber.optional(),
}).transform((data) => ({
    ...data,
    contactPerson: data.contactPerson ?? data.contactName,
}));
