import api from './api'

export type AccountSettings = {
  accountName: string
  currentPlan: string
  activeSince: string
  assetsCount: number
  agentsCount: number
  dataCenter: string
  version: string
  contact: {
    firstName: string
    lastName: string
    email: string
    phone: string
    invoiceEmail: string
  }
}

export async function getAccountSettings(): Promise<AccountSettings> {
  const res = await api.get('/system/account-settings')
  return res.data
}

export async function updateAccountSettings(payload: AccountSettings): Promise<AccountSettings> {
  const res = await api.put('/system/account-settings', payload)
  return res.data
}

export async function exportAccountData(): Promise<{ ok: boolean }> {
  const res = await api.post('/system/account-settings/export')
  return res.data
}

export async function cancelAccount(): Promise<{ ok: boolean }> {
  const res = await api.post('/system/account-settings/cancel')
  return res.data
}

