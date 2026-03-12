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
  contactPerson2: z.string().optional(),
  contactEmail2: z.string().email().optional(),
  contactNumber2: zContactNumber.optional(),
  contactPerson3: z.string().optional(),
  contactEmail3: z.string().email().optional(),
  contactNumber3: zContactNumber.optional(),
  contactPerson4: z.string().optional(),
  contactEmail4: z.string().email().optional(),
  contactNumber4: zContactNumber.optional(),
  contactPerson5: z.string().optional(),
  contactEmail5: z.string().email().optional(),
  contactNumber5: zContactNumber.optional(),
  contactPerson6: z.string().optional(),
  contactEmail6: z.string().email().optional(),
  contactNumber6: zContactNumber.optional(),
  contactPerson7: z.string().optional(),
  contactEmail7: z.string().email().optional(),
  contactNumber7: zContactNumber.optional(),
  contactPerson8: z.string().optional(),
  contactEmail8: z.string().email().optional(),
  contactNumber8: zContactNumber.optional(),
  contactPerson9: z.string().optional(),
  contactEmail9: z.string().email().optional(),
  contactNumber9: zContactNumber.optional(),
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
  contactPerson2: z.string().optional(),
  contactEmail2: z.string().email().optional(),
  contactNumber2: zContactNumber.optional(),
  contactPerson3: z.string().optional(),
  contactEmail3: z.string().email().optional(),
  contactNumber3: zContactNumber.optional(),
  contactPerson4: z.string().optional(),
  contactEmail4: z.string().email().optional(),
  contactNumber4: zContactNumber.optional(),
  contactPerson5: z.string().optional(),
  contactEmail5: z.string().email().optional(),
  contactNumber5: zContactNumber.optional(),
  contactPerson6: z.string().optional(),
  contactEmail6: z.string().email().optional(),
  contactNumber6: zContactNumber.optional(),
  contactPerson7: z.string().optional(),
  contactEmail7: z.string().email().optional(),
  contactNumber7: zContactNumber.optional(),
  contactPerson8: z.string().optional(),
  contactEmail8: z.string().email().optional(),
  contactNumber8: zContactNumber.optional(),
  contactPerson9: z.string().optional(),
  contactEmail9: z.string().email().optional(),
  contactNumber9: zContactNumber.optional(),
}).transform((data) => ({
  ...data,
  contactPerson: data.contactPerson ?? data.contactName,
}))
