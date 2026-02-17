import { Request, Response } from 'express'
import * as service from './tasks.service'

export async function createTask(req: Request, res: Response) {
  try {
    const ticketId = String(req.params.ticketId || '')
    const { name, assignedToId } = req.body
    const task = await service.createTask(ticketId, name, assignedToId)
    res.status(201).json(task)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to create task' })
  }
}

export async function listByTicket(req: Request, res: Response) {
  try {
    const ticketId = String(req.params.ticketId || '')
    const list = await service.listTasksByTicket(ticketId)
    res.json(list)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to list tasks' })
  }
}

export async function updateStatus(req: Request, res: Response) {
  try {
    const taskId = Number(req.params.taskId)
    const { status } = req.body
    const updated = await service.updateTaskStatus(taskId, status)
    res.json(updated)
  } catch (err: any) {
    res.status(err?.status || 500).json({ error: err?.message || 'Failed to update task status' })
  }
}
