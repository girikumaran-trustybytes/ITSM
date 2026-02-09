import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const suppliersListQuerySchema = z.object({
  q: zMaybeString,
})

export const supplierIdParamsSchema = z.object({
  id: zId,
})

export const suppliersCreateBodySchema = z.object({
  companyName: z.string().min(1),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  slaTerms: z.string().optional(),
})

export const suppliersUpdateBodySchema = z.object({
  companyName: z.string().min(1).optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  slaTerms: z.string().optional(),
})
