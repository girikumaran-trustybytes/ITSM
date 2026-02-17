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

export const authGoogleBodySchema = z.object({
  idToken: z.string().min(1),
})

export const authForgotPasswordBodySchema = z.object({
  email: z.string().email(),
})

export const authResetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
})

export const authVerifyMfaBodySchema = z.object({
  challengeToken: z.string().min(1),
  code: z.string().min(4).max(8),
})
