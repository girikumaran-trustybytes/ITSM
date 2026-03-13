import api from './api'

export type AssetFieldConfig = {
  id: string
  label: string
  key: string
  type: 'text' | 'number' | 'date' | 'select' | 'textarea' | 'boolean'
  required: boolean
  options: string[]
}

export type AssetTypeConfig = {
  id: string
  label: string
  description: string
  parentId: string | null
  icon: string
  fields: AssetFieldConfig[]
}

export type AssetTypesSettings = {
  types: AssetTypeConfig[]
}

export async function getAssetTypesSettings() {
  const res = await api.get('/system/asset-types')
  return res.data as AssetTypesSettings
}

export async function updateAssetTypesSettings(payload: AssetTypesSettings) {
  const res = await api.put('/system/asset-types', payload)
  return res.data as AssetTypesSettings
}
