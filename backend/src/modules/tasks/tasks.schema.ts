import { z } from 'zod'
import { zId } from '../../schema/common'

export const tasksByTicketParamsSchema = z.object({
  ticketId: zId,
})

export const tasksCreateBodySchema = z.object({
  name: z.string().min(1),
  assignedToId: zId.optional(),
})

export const taskStatusParamsSchema = z.object({
  taskId: zId,
})

export const taskStatusBodySchema = z.object({
  status: z.string().min(1),
})
