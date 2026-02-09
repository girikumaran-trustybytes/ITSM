import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const servicesListQuerySchema = z.object({
  q: zMaybeString,
})

export const serviceIdParamsSchema = z.object({
  id: zId,
})

export const servicesCreateBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
})

export const servicesUpdateBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})
