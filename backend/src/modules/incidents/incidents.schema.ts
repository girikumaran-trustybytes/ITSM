import { z } from 'zod'

const IncidentSeverity = z.enum(['P1', 'P2', 'P3', 'P4'])
const IncidentStatus = z.enum(['new', 'investigating', 'mitigated', 'resolved', 'closed'])

const uuid = () => z.string().uuid()

// param schema matching Express `:id`
export const incidentParamsSchema = z.object({ id: z.string().uuid() })

export const listIncidentsQuerySchema = z.object({
  severity: IncidentSeverity.optional(),
  status: IncidentStatus.optional(),
  impactedService: z.string().optional(),
  page: z.preprocess((v) => (typeof v === 'string' ? parseInt(v, 10) : v), z.number().int().positive().optional()),
  limit: z.preprocess((v) => (typeof v === 'string' ? parseInt(v, 10) : v), z.number().int().positive().optional()),
})

export const createIncidentSchema = z
  .object({
    title: z.string().min(5),
    description: z.string().max(4000).optional(),
    severity: IncidentSeverity.optional().default('P3'),
    assigneeId: z.string().uuid().optional(),
    impactedServices: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.severity === 'P1') {
      if (!val.impactedServices || val.impactedServices.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'P1 incidents must list impacted services' })
      }
      if (!val.assigneeId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'P1 incidents must be assigned' })
      }
    }
  })

export const updateIncidentSchema = z
  .object({
    title: z.string().min(5).optional(),
    description: z.string().max(4000).optional(),
    severity: IncidentSeverity.optional(),
    assigneeId: z.string().uuid().optional().nullable(),
    status: IncidentStatus.optional(),
    mitigation: z.string().max(2000).optional(),
    tags: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.status === 'resolved' && (!val.mitigation || val.mitigation.trim().length === 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Resolved incidents should include mitigation notes' })
    }
  })

// Business-action schemas
export const acknowledgeIncidentActionSchema = z.object({
  assigneeId: z.string().uuid(),
})

export const mitigateIncidentActionSchema = z.object({
  mitigation: z.string().min(10),
  mitigatedAt: z.string().optional(),
})

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>
export type IncidentParams = z.infer<typeof incidentParamsSchema>
export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>

export { IncidentSeverity as incidentSeverityEnum, IncidentStatus as incidentStatusEnum }
