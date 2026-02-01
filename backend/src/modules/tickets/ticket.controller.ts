import { Request, Response } from 'express'
import * as ticketService from './ticket.service'

import { validateCreate, validateTransition } from './ticket.validator'

export const listTickets = async (req: Request, res: Response) => {
  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.pageSize || 20)
  const q = String(req.query.q || '')
  const tickets = await ticketService.getTickets({ page, pageSize, q })
  res.json(tickets)
}

export const getTicket = async (req: Request, res: Response) => {
  const t = await ticketService.getTicketById(req.params.id)
  if (!t) return res.status(404).json({ error: 'Ticket not found' })
  res.json(t)
}

export const createTicket = async (req: Request, res: Response) => {
  const payload = req.body
  const check = validateCreate(payload)
  if (!check.ok) return res.status(400).json({ error: check.message })
  const creator = (req as any).user?.id || 'system'
  const t = await ticketService.createTicket(payload, creator)
  res.status(201).json(t)
}

export const transitionTicket = async (req: Request, res: Response) => {
  const id = req.params.id
  const check = validateTransition(req.body)
  if (!check.ok) return res.status(400).json({ error: check.message })
  const { to } = req.body
  const user = (req as any).user?.id || 'system'
  try {
    const t = await ticketService.transitionTicket(id, to, user)
    res.json(t)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed transition' })
  }
}
