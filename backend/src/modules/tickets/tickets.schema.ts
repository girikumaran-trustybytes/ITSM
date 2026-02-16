import { z } from 'zod'
import { zId, zPage, zPageSize, zMaybeString } from '../../schema/common'

export const ticketsListQuerySchema = z.object({
  page: zPage.optional(),
  pageSize: zPageSize.optional(),
  q: zMaybeString,
})

export const ticketIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const ticketsCreateBodySchema = z.object({
  subject: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  type: z.string().min(1),
  priority: z.string().min(1).optional(),
  impact: z.string().min(1).optional(),
  urgency: z.string().min(1).optional(),
  status: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  subcategory: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  requesterId: zId.optional(),
  requesterEmail: z.string().email().optional(),
  assigneeId: zId.optional(),
  slaStart: z.string().optional(),
}).refine((val) => val.subject || val.summary, {
  message: 'Missing subject',
  path: ['subject'],
})

export const ticketsUpdateBodySchema = z.object({
  subject: z.string().min(1).optional(),
  summary: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  priority: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  assigneeId: zId.optional(),
  requesterId: zId.optional(),
})

const incidentStates = ['New', 'In Progress', 'Awaiting Approval', 'Closed', 'Rejected'] as const

export const ticketsTransitionBodySchema = z.object({
  to: z.enum(incidentStates),
}).refine((val) => val.to.trim().length > 0, {
  message: 'Missing "to" state',
  path: ['to'],
})

export const ticketsHistoryBodySchema = z.object({
  note: z.string().min(1),
})

export const ticketsRespondBodySchema = z.object({
  message: z.string().min(1),
  sendEmail: z.boolean().optional(),
  to: z.string().email().optional(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1).optional(),
})

export const ticketsPrivateNoteBodySchema = z.object({
  note: z.string().min(1),
})

export const ticketsResolveBodySchema = z.object({
  resolution: z.string().min(1),
  resolutionCategory: z.string().min(1).optional(),
  sendEmail: z.boolean().optional(),
})

export const ticketsAssignAssetBodySchema = z.object({
  assetId: zId,
})

export const ticketsUnassignAssetBodySchema = z.object({})

export const ticketsAuditQuerySchema = z.object({})
