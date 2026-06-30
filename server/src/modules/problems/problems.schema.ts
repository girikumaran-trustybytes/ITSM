import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const problemsListQuerySchema = z.object({
  q: zMaybeString,
})

export const problemIdParamsSchema = z.object({
  id: zId,
})

export const problemsCreateBodySchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  status: z.string().optional(),
})

export const problemsUpdateBodySchema = z.object({
  code: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  status: z.string().optional(),
})
