import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const changesListQuerySchema = z.object({
  q: zMaybeString,
})

export const changeIdParamsSchema = z.object({
  id: zId,
})

export const changesCreateBodySchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  status: z.string().optional(),
})

export const changesUpdateBodySchema = z.object({
  code: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  status: z.string().optional(),
})
