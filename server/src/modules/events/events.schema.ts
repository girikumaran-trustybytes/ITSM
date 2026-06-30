import { z } from 'zod'

export const eventsListQuerySchema = z.object({
  sinceId: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

