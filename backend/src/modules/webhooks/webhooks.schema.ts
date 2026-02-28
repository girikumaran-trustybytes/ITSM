import { z } from 'zod'

export const notificationsWebhookBodySchema = z.object({
  event: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  payload: z.record(z.any()).optional(),
})

export const notificationsWebhookParamsSchema = z.object({})
export const notificationsWebhookQuerySchema = z.object({})
