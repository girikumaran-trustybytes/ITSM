import api from './api'

export type AssetPayload = {
  assetId: string
  name: string
  assetType: string
  category: string
  subcategory?: string | null
  ciType?: string | null
  serial?: string | null
  assetTag?: string | null
  barcode?: string | null
  assignedToId?: number | null
  assignedUserEmail?: string | null
  department?: string | null
  location?: string | null
  site?: string | null
  costCentre?: string | null
  manager?: string | null
  assetOwner?: string | null
  manufacturer?: string | null
  model?: string | null
  cpu?: string | null
  ram?: string | null
  storage?: string | null
  macAddress?: string | null
  ipAddress?: string | null
  biosVersion?: string | null
  firmware?: string | null
  os?: string | null
  osVersion?: string | null
  licenseKey?: string | null
  installedSoftware?: string[]
  antivirus?: string | null
  patchStatus?: string | null
  encryption?: string | null
  purchaseDate?: string | null
  supplier?: string | null
  poNumber?: string | null
  invoiceNumber?: string | null
  purchaseCost?: number | null
  warrantyStart?: string | null
  warrantyUntil?: string | null
  amcSupport?: string | null
  depreciationEnd?: string | null
  status: string
  lifecycleStage?: string | null
  condition?: string | null
  deploymentDate?: string | null
  lastAuditDate?: string | null
  endOfLife?: string | null
  disposalDate?: string | null
  disposalMethod?: string | null
  securityClassification?: string | null
  dataSensitivity?: string | null
  mdmEnrolled?: boolean
  complianceStatus?: string | null
  riskLevel?: string | null
  lastSecurityScan?: string | null
  parentAssetId?: number | null
  notes?: string | null
  linkedTicketIds?: string[]
  changeIds?: number[]
  problemIds?: number[]
  serviceIds?: number[]
}

export async function listAssets(params: any = {}) {
  const res = await api.get('/assets', { params })
  return res.data
}

export async function getAsset(id: number) {
  const res = await api.get(`/assets/${id}`)
  return res.data
}

export async function createAsset(payload: AssetPayload) {
  const res = await api.post('/assets', payload)
  return res.data
}

export async function updateAsset(id: number, payload: Partial<AssetPayload>) {
  const res = await api.patch(`/assets/${id}`, payload)
  return res.data
}

export async function deleteAsset(id: number) {
  const res = await api.delete(`/assets/${id}`)
  return res.data
}
