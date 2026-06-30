import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ZodSchema } from 'zod'

type Schemas = {
  body?: ZodSchema<any>
  params?: ZodSchema<any>
  query?: ZodSchema<any>
}

export function validate(schemas: Schemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed: any = {}
      if (schemas.params) {
        const result = schemas.params.safeParse(req.params)
        if (!result.success) return res.status(400).json({ error: result.error.flatten() })
        parsed.params = result.data
        req.params = result.data
      }
      if (schemas.query) {
        const result = schemas.query.safeParse(req.query)
        if (!result.success) return res.status(400).json({ error: result.error.flatten() })
        parsed.query = result.data
        req.query = result.data
      }
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body)
        if (!result.success) return res.status(400).json({ error: result.error.flatten() })
        parsed.body = result.data
        req.body = result.data
      }
      ;(req as any).validated = parsed
      return next()
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Validation failed' })
    }
  }
}

export default validate
