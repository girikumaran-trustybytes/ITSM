import { z } from 'zod'

export const authLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const authLoginParamsSchema = z.object({})
export const authLoginQuerySchema = z.object({})

export const authRefreshBodySchema = z.object({
  refreshToken: z.string().min(1),
})

export const authRefreshParamsSchema = z.object({})
export const authRefreshQuerySchema = z.object({})
