import { Request, Response } from 'express'
import * as ticketService from './ticket.service'

import { validateCreate, validateTransition, validateUpdate } from './ticket.validator'

export const listTickets = async (req: Request, res: Response) => {
  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.pageSize || 20)
  const q = String(req.query.q || '')
  const viewer = (req as any).user
  const tickets = await ticketService.getTickets({ page, pageSize, q }, viewer)
  res.json(tickets)
}

export const getTicket = async (req: Request, res: Response) => {
  const viewer = (req as any).user
  const t = await ticketService.getTicketById(req.params.id, viewer)
  if (!t) return res.status(404).json({ error: 'Ticket not found' })
  if (viewer?.role === 'USER' && Array.isArray((t as any).history)) {
    ;(t as any).history = (t as any).history.filter((h: any) => !h.internal)
  }
  res.json(t)
}

export const createTicket = async (req: Request, res: Response) => {
  try {
    const payload = req.body
    const check = validateCreate(payload)
    if (!check.ok) return res.status(400).json({ error: check.message })
    const creator = (req as any).user?.id || 'system'
    const role = (req as any).user?.role
    if (role === 'USER') {
      payload.requesterId = (req as any).user?.id
    }
    const t = await ticketService.createTicket(payload, creator)
    res.status(201).json(t)
  } catch (err: any) {
    console.error('Error creating ticket:', err)
    res.status(500).json({ error: err.message || 'Failed to create ticket' })
  }
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

export const addHistory = async (req: Request, res: Response) => {
  const id = req.params.id
  const payload = req.body || {}
  const note = String(payload.note || '')
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note is required' })
  const user = (req as any).user?.id || 'system'
  try {
    const entry = await ticketService.createHistoryEntry(id, { note, user })
    res.status(201).json(entry)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed creating history entry' })
  }
}

export const respond = async (req: Request, res: Response) => {
  const id = req.params.id
  const { message, sendEmail } = req.body || {}
  if (!message || !message.trim()) return res.status(400).json({ error: 'Message is required' })
  const user = (req as any).user?.id || 'system'
  try {
    const entry = await ticketService.addResponse(id, { message, user, sendEmail })
    res.status(201).json(entry)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to add response' })
  }
}

export const privateNote = async (req: Request, res: Response) => {
  const id = req.params.id
  const { note } = req.body || {}
  if (!note || !note.trim()) return res.status(400).json({ error: 'Note is required' })
  const user = (req as any).user?.id || 'system'
  try {
    const entry = await ticketService.addPrivateNote(id, { note, user })
    res.status(201).json(entry)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to add private note' })
  }
}

export const resolveTicket = async (req: Request, res: Response) => {
  const id = req.params.id
  const { resolution, resolutionCategory, sendEmail } = req.body || {}
  if (!resolution || !resolution.trim()) return res.status(400).json({ error: 'Resolution details are required' })
  const user = (req as any).user?.id || 'system'
  try {
    const updated = await ticketService.resolveTicketWithDetails(id, { resolution, resolutionCategory, user, sendEmail })
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to resolve ticket' })
  }
}

export const assignAsset = async (req: Request, res: Response) => {
  const id = req.params.id
  const { assetId } = req.body || {}
  if (!assetId) return res.status(400).json({ error: 'assetId is required' })
  const user = (req as any).user?.id || 'system'
  try {
    const updated = await ticketService.assignAsset(id, Number(assetId), user)
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to assign asset' })
  }
}

export const unassignAsset = async (req: Request, res: Response) => {
  const id = req.params.id
  const user = (req as any).user?.id || 'system'
  try {
    const updated = await ticketService.unassignAsset(id, user)
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to unassign asset' })
  }
}

export const updateTicket = async (req: Request, res: Response) => {
  const id = req.params.id
  const payload = req.body || {}
  const check = validateUpdate(payload)
  if (!check.ok) return res.status(400).json({ error: check.message })
  const user = (req as any).user?.id || 'system'
  try {
    const updated = await ticketService.updateTicket(id, payload, user)
    res.json(updated)
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to update ticket' })
  }
}

export const deleteTicket = async (req: Request, res: Response) => {
  const id = req.params.id
  const user = (req as any).user?.id || 'system'
  try {
    const deleted = await ticketService.deleteTicket(id, user)
    res.json({ success: true, deleted })
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message || 'Failed to delete ticket' })
  }
}
