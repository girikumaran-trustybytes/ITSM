import { Request, Response } from 'express'
import { getAuditByTicketId } from '../../common/logger/logger'

export const getAudit = (req: Request, res: Response) => {
  const id = req.params.id
  const a = getAuditByTicketId(id)
  res.json(a)
}
