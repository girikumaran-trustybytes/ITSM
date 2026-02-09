import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const usersListQuerySchema = z.object({
  q: zMaybeString,
  limit: zId.optional(),
  role: zMaybeString,
})

export const userIdParamsSchema = z.object({
  id: zId,
})

export const usersCreateBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  phone: z.string().optional(),
  client: z.string().optional(),
  site: z.string().optional(),
  accountManager: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
})

export const usersUpdateBodySchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(6).optional(),
  name: z.string().optional(),
  phone: z.string().optional(),
  client: z.string().optional(),
  site: z.string().optional(),
  accountManager: z.string().optional(),
  role: z.string().optional(),
  status: z.string().optional(),
})
