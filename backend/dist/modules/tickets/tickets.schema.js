"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ticketsUploadAttachmentsBodySchema = exports.ticketUploadFileSchema = exports.ticketsAuditQuerySchema = exports.ticketsUnassignAssetBodySchema = exports.ticketsAssignAssetBodySchema = exports.ticketsResolveBodySchema = exports.ticketsPrivateNoteBodySchema = exports.ticketsRespondBodySchema = exports.ticketsHistoryBodySchema = exports.ticketsTransitionBodySchema = exports.ticketsUpdateBodySchema = exports.ticketsCreateBodySchema = exports.ticketIdParamsSchema = exports.ticketsListQuerySchema = void 0;
const zod_1 = require("zod");
const common_1 = require("../../schema/common");
exports.ticketsListQuerySchema = zod_1.z.object({
    page: common_1.zPage.optional(),
    pageSize: common_1.zPageSize.optional(),
    q: common_1.zMaybeString,
});
exports.ticketIdParamsSchema = zod_1.z.object({
    id: zod_1.z.string().min(1),
});
exports.ticketsCreateBodySchema = zod_1.z.object({
    subject: zod_1.z.string().min(1).optional(),
    summary: zod_1.z.string().min(1).optional(),
    type: zod_1.z.string().min(1),
    priority: zod_1.z.string().min(1).optional(),
    impact: zod_1.z.string().min(1).optional(),
    urgency: zod_1.z.string().min(1).optional(),
    status: zod_1.z.string().min(1).optional(),
    category: zod_1.z.string().min(1).optional(),
    subcategory: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().min(1).optional(),
    requesterId: common_1.zId.optional(),
    requesterEmail: zod_1.z.string().email().optional(),
    assigneeId: common_1.zId.optional(),
    slaStart: zod_1.z.string().optional(),
}).refine((val) => val.subject || val.summary, {
    message: 'Missing subject',
    path: ['subject'],
});
exports.ticketsUpdateBodySchema = zod_1.z.object({
    subject: zod_1.z.string().min(1).optional(),
    summary: zod_1.z.string().min(1).optional(),
    type: zod_1.z.string().min(1).optional(),
    priority: zod_1.z.string().min(1).optional(),
    category: zod_1.z.string().min(1).optional(),
    description: zod_1.z.string().min(1).optional(),
    assigneeId: common_1.zId.optional(),
    requesterId: common_1.zId.optional(),
});
exports.ticketsTransitionBodySchema = zod_1.z.object({
    to: zod_1.z.string().min(1),
}).refine((val) => val.to.trim().length > 0, {
    message: 'Missing "to" state',
    path: ['to'],
});
exports.ticketsHistoryBodySchema = zod_1.z.object({
    note: zod_1.z.string().min(1),
});
exports.ticketsRespondBodySchema = zod_1.z.object({
    message: zod_1.z.string().min(1),
    sendEmail: zod_1.z.boolean().optional(),
    to: zod_1.z.string().email().optional(),
    cc: zod_1.z.string().optional(),
    bcc: zod_1.z.string().optional(),
    subject: zod_1.z.string().min(1).optional(),
    attachmentIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
});
exports.ticketsPrivateNoteBodySchema = zod_1.z.object({
    note: zod_1.z.string().min(1),
    attachmentIds: zod_1.z.array(zod_1.z.number().int().positive()).optional(),
});
exports.ticketsResolveBodySchema = zod_1.z.object({
    resolution: zod_1.z.string().min(1),
    resolutionCategory: zod_1.z.string().min(1).optional(),
    sendEmail: zod_1.z.boolean().optional(),
});
exports.ticketsAssignAssetBodySchema = zod_1.z.object({
    assetId: common_1.zId,
});
exports.ticketsUnassignAssetBodySchema = zod_1.z.object({});
exports.ticketsAuditQuerySchema = zod_1.z.object({});
exports.ticketUploadFileSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    type: zod_1.z.string().optional(),
    size: zod_1.z.number().int().nonnegative(),
    contentBase64: zod_1.z.string().min(1),
});
exports.ticketsUploadAttachmentsBodySchema = zod_1.z.object({
    files: zod_1.z.array(exports.ticketUploadFileSchema).min(1),
    note: zod_1.z.string().optional(),
    internal: zod_1.z.boolean().optional(),
});
