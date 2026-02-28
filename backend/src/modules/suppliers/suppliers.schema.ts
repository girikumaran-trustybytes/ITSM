import { z } from 'zod'
import { zId, zMaybeString } from '../../schema/common'

export const suppliersListQuerySchema = z.object({
  q: zMaybeString,
})

export const supplierIdParamsSchema = z.object({
  id: zId,
})

const zContactNumber = z
  .union([
    z.string().regex(/^\d+$/, 'Contact Number must be numeric'),
    z.number().int().nonnegative(),
  ])
  .transform((value) => String(value))

export const suppliersCreateBodySchema = z.object({
  companyName: z.string().min(1),
  companyMail: z.string().email().optional(),
  contactPerson: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactNumber: zContactNumber.optional(),
  slaTerms: z.string().optional(),
}).transform((data) => ({
  ...data,
  contactPerson: data.contactPerson ?? data.contactName,
}))

export const suppliersUpdateBodySchema = z.object({
  companyName: z.string().min(1).optional(),
  companyMail: z.string().email().optional(),
  contactPerson: z.string().optional(),
  contactName: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactNumber: zContactNumber.optional(),
  slaTerms: z.string().optional(),
}).transform((data) => ({
  ...data,
  contactPerson: data.contactPerson ?? data.contactName,
}))
