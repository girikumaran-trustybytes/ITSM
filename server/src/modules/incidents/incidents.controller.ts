import { Request, Response } from 'express'
import * as incidentService from './incidents.service'

export const listIncidents = async (req: Request, res: Response) => {
  const q = (req as any).validated?.query || req.query || {}
  try {
    const rows = await incidentService.getIncidents(q, (req as any).user)
    res.json(rows)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list incidents' })
  }
}

export const getIncident = async (req: Request, res: Response) => {
  const id = (req as any).validated?.params?.id || req.params.id
  try {
    const t = await incidentService.getIncidentById(id)
    if (!t) return res.status(404).json({ error: 'Incident not found' })
    res.json(t)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch incident' })
  }
}

export const createIncident = async (req: Request, res: Response) => {
  try {
    const payload = (req as any).validated?.body || req.body
    const creator = (req as any).user?.id || 'system'
    const t = await incidentService.createIncident(payload, creator)
    res.status(201).json(t)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to create incident' })
  }
}

export const updateIncident = async (req: Request, res: Response) => {
  const id = (req as any).validated?.params?.id || req.params.id
  const payload = (req as any).validated?.body || req.body
  const user = (req as any).user?.id || 'system'
  try {
    const updated = await incidentService.updateIncident(id, payload, user)
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to update incident' })
  }
}

export const acknowledgeIncident = async (req: Request, res: Response) => {
  const id = (req as any).validated?.params?.id || req.params.id
  const { assigneeId } = (req as any).validated?.body || req.body || {}
  if (!assigneeId) return res.status(400).json({ error: 'assigneeId is required' })
  try {
    const updated = await incidentService.acknowledgeIncident(id, assigneeId)
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to acknowledge incident' })
  }
}

export const mitigateIncident = async (req: Request, res: Response) => {
  const id = (req as any).validated?.params?.id || req.params.id
  const { mitigation, mitigatedAt } = (req as any).validated?.body || req.body || {}
  if (!mitigation || mitigation.trim().length === 0) return res.status(400).json({ error: 'mitigation is required' })
  try {
    const updated = await incidentService.mitigateIncident(id, mitigation, mitigatedAt)
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to mitigate incident' })
  }
}
