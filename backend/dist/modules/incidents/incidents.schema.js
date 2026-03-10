"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incidentStatusEnum = exports.incidentSeverityEnum = exports.mitigateIncidentActionSchema = exports.acknowledgeIncidentActionSchema = exports.updateIncidentSchema = exports.createIncidentSchema = exports.listIncidentsQuerySchema = exports.incidentParamsSchema = void 0;
const zod_1 = require("zod");
const IncidentSeverity = zod_1.z.enum(['P1', 'P2', 'P3', 'P4']);
exports.incidentSeverityEnum = IncidentSeverity;
const IncidentStatus = zod_1.z.enum(['new', 'investigating', 'mitigated', 'resolved', 'closed']);
exports.incidentStatusEnum = IncidentStatus;
const uuid = () => zod_1.z.string().uuid();
// param schema matching Express `:id`
exports.incidentParamsSchema = zod_1.z.object({ id: zod_1.z.string().uuid() });
exports.listIncidentsQuerySchema = zod_1.z.object({
    severity: IncidentSeverity.optional(),
    status: IncidentStatus.optional(),
    impactedService: zod_1.z.string().optional(),
    page: zod_1.z.preprocess((v) => (typeof v === 'string' ? parseInt(v, 10) : v), zod_1.z.number().int().positive().optional()),
    limit: zod_1.z.preprocess((v) => (typeof v === 'string' ? parseInt(v, 10) : v), zod_1.z.number().int().positive().optional()),
});
exports.createIncidentSchema = zod_1.z
    .object({
    title: zod_1.z.string().min(5),
    description: zod_1.z.string().max(4000).optional(),
    severity: IncidentSeverity.optional().default('P3'),
    assigneeId: zod_1.z.string().uuid().optional(),
    impactedServices: zod_1.z.array(zod_1.z.string()).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
})
    .superRefine((val, ctx) => {
    if (val.severity === 'P1') {
        if (!val.impactedServices || val.impactedServices.length === 0) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'P1 incidents must list impacted services' });
        }
        if (!val.assigneeId) {
            ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'P1 incidents must be assigned' });
        }
    }
});
exports.updateIncidentSchema = zod_1.z
    .object({
    title: zod_1.z.string().min(5).optional(),
    description: zod_1.z.string().max(4000).optional(),
    severity: IncidentSeverity.optional(),
    assigneeId: zod_1.z.string().uuid().optional().nullable(),
    status: IncidentStatus.optional(),
    mitigation: zod_1.z.string().max(2000).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    metadata: zod_1.z.record(zod_1.z.any()).optional(),
})
    .superRefine((val, ctx) => {
    if (val.status === 'resolved' && (!val.mitigation || val.mitigation.trim().length === 0)) {
        ctx.addIssue({ code: zod_1.z.ZodIssueCode.custom, message: 'Resolved incidents should include mitigation notes' });
    }
});
// Business-action schemas
exports.acknowledgeIncidentActionSchema = zod_1.z.object({
    assigneeId: zod_1.z.string().uuid(),
});
exports.mitigateIncidentActionSchema = zod_1.z.object({
    mitigation: zod_1.z.string().min(10),
    mitigatedAt: zod_1.z.string().optional(),
});
