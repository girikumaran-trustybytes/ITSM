import { z } from 'zod'
import { zId } from '../../schema/common'

export const approvalsByTicketParamsSchema = z.object({
  ticketId: zId,
})

export const approvalsCreateBodySchema = z.object({
  approverId: zId.optional(),
})

export const approvalActionParamsSchema = z.object({
  approvalId: zId,
})

export const approvalActionBodySchema = z.object({
  comment: z.string().optional(),
})
