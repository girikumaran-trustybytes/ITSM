import api from './api'

export type SecuritySettings = {
  loginMethods: {
    password: boolean
    passwordless: boolean
    googleSso: boolean
    sso: boolean
  }
  ipRangeRestriction: {
    enabled: boolean
    ranges: string[]
  }
  sessionTimeoutMinutes: number
  requireAuthForPublicUrls: boolean
  ticketSharing: {
    publicLinks: boolean
    shareOutsideGroup: boolean
    allowRequesterShare: boolean
    requesterShareScope: 'any' | 'department'
  }
  adminNotifications: {
    adminUserId: string | null
  }
  attachmentFileTypes: {
    mode: 'all' | 'specific'
    types: string[]
  }
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  const res = await api.get('/system/security-settings')
  return res.data
}

export async function updateSecuritySettings(payload: SecuritySettings): Promise<SecuritySettings> {
  const res = await api.put('/system/security-settings', payload)
  return res.data
}

