import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const slaListQuerySchema = z.object({
  q: zMaybeString,
})

export const slaIdParamsSchema = z.object({
  id: zId,
})

export const slaCreateBodySchema = z.object({
  name: z.string().min(1),
  priority: z.string().min(1),
  responseTimeMin: z.number().nonnegative(),
  resolutionTimeMin: z.number().nonnegative(),
  businessHours: z.boolean().optional(),
  active: z.boolean().optional(),
})

export const slaUpdateBodySchema = z.object({
  name: z.string().min(1).optional(),
  priority: z.string().min(1).optional(),
  responseTimeMin: z.number().nonnegative().optional(),
  resolutionTimeMin: z.number().nonnegative().optional(),
  businessHours: z.boolean().optional(),
  active: z.boolean().optional(),
})
