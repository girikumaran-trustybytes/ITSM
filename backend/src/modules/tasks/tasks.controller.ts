import { Request, Response } from 'express'
import * as service from './tasks.service'

export async function createTask(req: Request, res: Response) {
  const ticketId = Number(req.params.ticketId)
  const { name, assignedToId } = req.body
  const task = await service.createTask(ticketId, name, assignedToId)
  res.status(201).json(task)
}

export async function listByTicket(req: Request, res: Response) {
  const ticketId = Number(req.params.ticketId)
  const list = await service.listTasksByTicket(ticketId)
  res.json(list)
}

export async function updateStatus(req: Request, res: Response) {
  const taskId = Number(req.params.taskId)
  const { status } = req.body
  const updated = await service.updateTaskStatus(taskId, status)
  res.json(updated)
}
