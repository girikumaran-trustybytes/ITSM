import { z } from 'zod'

export const zId = z.coerce.number().int().positive()
export const zPage = z.coerce.number().int().positive().default(1)
export const zPageSize = z.coerce.number().int().positive().default(20)
export const zMaybeString = z.string().trim().min(1).optional()
export const zMaybeNumber = z.coerce.number().optional()
export const zMaybeBoolean = z.preprocess((val) => {
  if (val === 'true') return true
  if (val === 'false') return false
  return val
}, z.boolean().optional())

export const zDateLike = z.preprocess((val) => {
  if (val === '' || val === null || val === undefined) return null
  const d = new Date(val as any)
  if (Number.isNaN(d.getTime())) return null
  return d
}, z.date().nullable())
