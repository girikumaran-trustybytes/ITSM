import { Request, Response } from 'express'
import * as service from './approvals.service'

export async function createApproval(req: Request, res: Response) {
  try {
    const ticketId = String(req.params.ticketId || '')
    const approverId = req.body.approverId
    const approval = await service.createApproval(ticketId, approverId)
    res.status(201).json(approval)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to create approval' })
  }
}

export async function listByTicket(req: Request, res: Response) {
  try {
    const ticketId = String(req.params.ticketId || '')
    const list = await service.listApprovalsByTicket(ticketId)
    res.json(list)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to list approvals' })
  }
}

export async function approve(req: Request, res: Response) {
  try {
    const approvalId = Number(req.params.approvalId)
    const userId = (req as any).user?.id
    const comment = req.body.comment
    const updated = await service.setApprovalStatus(approvalId, 'approved', userId, comment)
    res.json(updated)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to approve' })
  }
}

export async function reject(req: Request, res: Response) {
  try {
    const approvalId = Number(req.params.approvalId)
    const userId = (req as any).user?.id
    const comment = req.body.comment
    const updated = await service.setApprovalStatus(approvalId, 'rejected', userId, comment)
    res.json(updated)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to reject' })
  }
}
