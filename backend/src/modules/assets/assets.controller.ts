import { Request, Response } from 'express'
import * as svc from './assets.service'
import { auditLog } from '../../common/logger/logger'

function parseOptionalDate(value: any): Date | undefined {
  if (!value) return undefined
  const d = new Date(value)
  if (isNaN(d.getTime())) return undefined
  return d
}

function buildAssetData(body: any, req: Request, isUpdate = false) {
  const data: any = {}
  const set = (key: string, value: any) => { if (value !== undefined) data[key] = value }

  set('assetId', body.assetId)
  set('name', body.name)
  set('assetType', body.assetType)
  set('category', body.category)
  set('subcategory', body.subcategory || null)
  set('ciType', body.ciType || null)
  set('serial', body.serial || null)
  set('assetTag', body.assetTag || null)
  set('barcode', body.barcode || null)

  set('assignedToId', body.assignedToId ? Number(body.assignedToId) : null)
  set('assignedUserEmail', body.assignedUserEmail || null)
  set('department', body.department || null)
  set('location', body.location || null)
  set('site', body.site || null)
  set('costCentre', body.costCentre || null)
  set('manager', body.manager || null)
  set('assetOwner', body.assetOwner || null)

  set('manufacturer', body.manufacturer || null)
  set('model', body.model || null)
  set('cpu', body.cpu || null)
  set('ram', body.ram || null)
  set('storage', body.storage || null)
  set('macAddress', body.macAddress || null)
  set('ipAddress', body.ipAddress || null)
  set('biosVersion', body.biosVersion || null)
  set('firmware', body.firmware || null)

  set('os', body.os || null)
  set('osVersion', body.osVersion || null)
  set('licenseKey', body.licenseKey || null)
  if (body.installedSoftware !== undefined) {
    set('installedSoftware', Array.isArray(body.installedSoftware) ? body.installedSoftware : [])
  } else if (!isUpdate) {
    set('installedSoftware', [])
  }
  set('antivirus', body.antivirus || null)
  set('patchStatus', body.patchStatus || null)
  set('encryption', body.encryption || null)

  set('purchaseDate', parseOptionalDate(body.purchaseDate) || null)
  set('supplier', body.supplier || null)
  set('poNumber', body.poNumber || null)
  set('invoiceNumber', body.invoiceNumber || null)
  if (body.purchaseCost !== undefined) data.purchaseCost = Number(body.purchaseCost)
  set('warrantyStart', parseOptionalDate(body.warrantyStart) || null)
  set('warrantyUntil', parseOptionalDate(body.warrantyUntil) || null)
  set('amcSupport', body.amcSupport || null)
  set('depreciationEnd', parseOptionalDate(body.depreciationEnd) || null)

  set('status', body.status)
  set('lifecycleStage', body.lifecycleStage || null)
  set('condition', body.condition || null)
  set('deploymentDate', parseOptionalDate(body.deploymentDate) || null)
  set('lastAuditDate', parseOptionalDate(body.lastAuditDate) || null)
  set('endOfLife', parseOptionalDate(body.endOfLife) || null)
  set('disposalDate', parseOptionalDate(body.disposalDate) || null)
  set('disposalMethod', body.disposalMethod || null)

  set('securityClassification', body.securityClassification || null)
  set('dataSensitivity', body.dataSensitivity || null)
  if (body.mdmEnrolled !== undefined) data.mdmEnrolled = Boolean(body.mdmEnrolled)
  set('complianceStatus', body.complianceStatus || null)
  set('riskLevel', body.riskLevel || null)
  set('lastSecurityScan', parseOptionalDate(body.lastSecurityScan) || null)

  set('parentAssetId', body.parentAssetId ? Number(body.parentAssetId) : null)
  set('notes', body.notes || null)

  if (!isUpdate) {
    data.createdById = (req as any).user?.id ? Number((req as any).user?.id) : null
  }

  return data
}

export async function list(_req: Request, res: Response) {
  const page = Number(_req.query.page || 1)
  const pageSize = Number(_req.query.pageSize || 20)
  const q = _req.query.q ? String(_req.query.q) : undefined
  const status = _req.query.status ? String(_req.query.status) : undefined
  const category = _req.query.category ? String(_req.query.category) : undefined
  const viewer = (_req as any).user
  const viewerEmail = String(viewer?.email || '').trim().toLowerCase() || undefined
  const assignedToId = viewer?.role === 'USER'
    ? Number(viewer?.id || 0) || undefined
    : _req.query.assignedToId ? Number(_req.query.assignedToId) : undefined
  const assignedUserEmail = viewer?.role === 'USER'
    ? viewerEmail
    : _req.query.assignedUserEmail ? String(_req.query.assignedUserEmail).trim().toLowerCase() : undefined
  const items = await svc.listAssets({ page, pageSize, q, status, category, assignedToId, assignedUserEmail })
  res.json(items)
}

export async function listMine(req: Request, res: Response) {
  const page = Number(req.query.page || 1)
  const pageSize = Number(req.query.pageSize || 200)
  const q = req.query.q ? String(req.query.q) : undefined
  const status = req.query.status ? String(req.query.status) : undefined
  const category = req.query.category ? String(req.query.category) : undefined
  const viewer = (req as any).user
  const viewerIdRaw = Number(viewer?.id)
  const viewerId = Number.isFinite(viewerIdRaw) && viewerIdRaw > 0 ? viewerIdRaw : undefined
  const viewerEmail = String(viewer?.email || '').trim().toLowerCase()
  const viewerName = String(viewer?.name || '').trim().toLowerCase()
  const norm = (v: any) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const viewerEmailLocal = viewerEmail.includes('@') ? viewerEmail.split('@')[0] : viewerEmail
  const viewerNameNorm = norm(viewerName)
  const viewerEmailNorm = norm(viewerEmail)
  const viewerEmailLocalNorm = norm(viewerEmailLocal)

  const raw = await svc.listAssets({ page: 1, pageSize: 2000, q, status, category })
  const filtered = (Array.isArray(raw?.items) ? raw.items : []).filter((asset: any) => {
    const assignedToId = Number(asset?.assignedToId || 0) || undefined
    const assignedUserEmail = String(asset?.assignedUserEmail || '').trim().toLowerCase()
    const assignedToEmail = String(asset?.assignedTo?.email || '').trim().toLowerCase()
    const assignedToName = String(asset?.assignedTo?.name || '').trim().toLowerCase()
    const assetOwner = String(asset?.assetOwner || '').trim().toLowerCase()
    const manager = String(asset?.manager || '').trim().toLowerCase()
    const assignedToNameNorm = norm(assignedToName)
    const ownerNorm = norm(assetOwner)
    const managerNorm = norm(manager)
    const assignedToEmailNorm = norm(assignedToEmail)
    const assignedUserEmailNorm = norm(assignedUserEmail)
    const fieldsNorm = [assignedToNameNorm, ownerNorm, managerNorm, assignedToEmailNorm, assignedUserEmailNorm].filter(Boolean)

    if (viewerId && assignedToId && assignedToId === viewerId) return true
    if (viewerEmail && (assignedUserEmail === viewerEmail || assignedToEmail === viewerEmail || assetOwner === viewerEmail || manager === viewerEmail)) return true
    if (viewerName && (assignedToName === viewerName || assetOwner === viewerName || manager === viewerName)) return true
    if (viewerEmailNorm && fieldsNorm.some((f) => f.includes(viewerEmailNorm) || viewerEmailNorm.includes(f))) return true
    if (viewerEmailLocalNorm && fieldsNorm.some((f) => f.includes(viewerEmailLocalNorm) || viewerEmailLocalNorm.includes(f))) return true
    if (viewerNameNorm && fieldsNorm.some((f) => f.includes(viewerNameNorm) || viewerNameNorm.includes(f))) return true
    return false
  })

  const safePage = Number.isFinite(page) && page > 0 ? page : 1
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 200
  const offset = (safePage - 1) * safeSize
  const paged = filtered.slice(offset, offset + safeSize)
  res.json({ items: paged, total: filtered.length, page: safePage, pageSize: safeSize })
}

export async function getOne(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid asset id' })
  const asset = await svc.getAssetById(id)
  if (!asset) return res.status(404).json({ error: 'Asset not found' })
  const viewer = (req as any).user
  const assignedEmail = String(asset?.assignedUserEmail || asset?.assignedTo?.email || '').trim().toLowerCase()
  const viewerEmail = String(viewer?.email || '').trim().toLowerCase()
  const assignedById = viewer?.id && Number(asset.assignedToId) === Number(viewer.id)
  const assignedByEmail = Boolean(viewerEmail) && assignedEmail === viewerEmail
  if (viewer?.role === 'USER' && !assignedById && !assignedByEmail) {
    return res.status(403).json({ error: 'Forbidden' })
  }
  res.json(asset)
}

export async function create(req: Request, res: Response) {
  const body = req.body || {}
  const {
    assetId,
    name,
    assetType,
    category,
    status,
  } = body
  if (!assetId || !name || !assetType || !category || !status) {
    return res.status(400).json({ error: 'Missing required fields: assetId, name, assetType, category, status' })
  }
  const created = await svc.createAsset(buildAssetData(body, req))
  // link tickets if provided
  if (Array.isArray(body.linkedTicketIds) && body.linkedTicketIds.length > 0) {
    await svc.linkTicketsToAsset(created.id, body.linkedTicketIds)
  }
  // link relations if provided
  if (Array.isArray(body.changeIds)) await svc.setAssetChanges(created.id, body.changeIds)
  if (Array.isArray(body.problemIds)) await svc.setAssetProblems(created.id, body.problemIds)
  if (Array.isArray(body.serviceIds)) await svc.setAssetServices(created.id, body.serviceIds)
  await auditLog({ action: 'create_asset', entity: 'asset', entityId: created.id, user: (req as any).user?.id, assetId: created.id, meta: { name: created.name } })
  res.status(201).json(created)
}

export async function update(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid asset id' })
  const body = req.body || {}
  const updated = await svc.updateAsset(id, buildAssetData(body, req, true))
  if (Array.isArray(body.linkedTicketIds)) {
    await svc.linkTicketsToAsset(id, body.linkedTicketIds)
  }
  if (Array.isArray(body.changeIds)) await svc.setAssetChanges(id, body.changeIds)
  if (Array.isArray(body.problemIds)) await svc.setAssetProblems(id, body.problemIds)
  if (Array.isArray(body.serviceIds)) await svc.setAssetServices(id, body.serviceIds)
  await auditLog({ action: 'update_asset', entity: 'asset', entityId: updated.id, user: (req as any).user?.id, assetId: updated.id })
  res.json(updated)
}

export async function remove(req: Request, res: Response) {
  const id = Number(req.params.id)
  if (!id) return res.status(400).json({ error: 'Invalid asset id' })
  const deleted = await svc.deleteAsset(id)
  await auditLog({ action: 'delete_asset', entity: 'asset', entityId: deleted.id, user: (req as any).user?.id, assetId: deleted.id, meta: { name: deleted.name } })
  res.json({ ok: true })
}
