import api from './api'

export type RbacUserRow = {
  id: number
  name: string | null
  email: string
  role: string
  status: string
  mfaEnabled?: boolean
  isServiceAccount?: boolean
  autoUpgradeQueues?: boolean
  queueIds?: string[]
  inviteStatus?: string
  createdAt?: string
}

export async function listRbacUsers(params: { q?: string; limit?: number; role?: string } = {}) {
  const res = await api.get('/users', { params })
  const payload = res.data as any
  if (Array.isArray(payload)) return payload as RbacUserRow[]
  if (Array.isArray(payload?.items)) return payload.items as RbacUserRow[]
  if (Array.isArray(payload?.data)) return payload.data as RbacUserRow[]
  if (Array.isArray(payload?.data?.items)) return payload.data.items as RbacUserRow[]
  if (Array.isArray(payload?.data?.data)) return payload.data.data as RbacUserRow[]
  if (Array.isArray(payload?.users)) return payload.users as RbacUserRow[]
  if (Array.isArray(payload?.data?.users)) return payload.data.users as RbacUserRow[]
  if (Array.isArray(payload?.result?.items)) return payload.result.items as RbacUserRow[]
  if (payload && typeof payload === 'object') {
    const tryMapValues = (value: any) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null
      const entries = Object.values(value)
      const looksLikeUsers = entries.length > 0 && entries.every((row) =>
        row && typeof row === 'object' && ('email' in row || 'mailId' in row || 'name' in row || 'id' in row)
      )
      return looksLikeUsers ? (entries as RbacUserRow[]) : null
    }
    const mapped = tryMapValues(payload)
    if (mapped) return mapped
    const mappedData = tryMapValues(payload?.data)
    if (mappedData) return mappedData
    const seen = new Set<any>()
    const queue: any[] = [payload]
    let steps = 0
    while (queue.length && steps < 200) {
      const current = queue.shift()
      steps += 1
      if (!current || typeof current !== 'object') continue
      if (seen.has(current)) continue
      seen.add(current)
      if (Array.isArray(current)) {
        const looksLikeUsers = current.length > 0 && current.every((row) =>
          row && typeof row === 'object' && ('email' in row || 'mailId' in row || 'name' in row || 'id' in row)
        )
        if (looksLikeUsers) return current as RbacUserRow[]
        queue.push(...current)
        continue
      }
      for (const value of Object.values(current)) {
        if (value && typeof value === 'object') queue.push(value)
      }
    }
  }
  return []
}

export async function getUserPermissions(userId: number) {
  const res = await api.get(`/users/${userId}/permissions`)
  return res.data
}

export async function createRbacUser(payload: {
  fullName: string
  email: string
  mailId?: string
  phone?: string
  workPhone?: string
  mobilePhone?: string
  employeeId?: string
  department?: string
  reportingManager?: string
  dateOfJoining?: string
  employmentType?: string
  workMode?: string
  designation?: string
  client?: string
  site?: string
  accountManager?: string
  timeZone?: string
  workSchedule?: string
  loadForTicketAssignment?: number
  language?: string
  timeFormat?: string
  isVip?: boolean
  location?: string
  company?: string
  canSeeAssociatedCompanies?: boolean
  address?: string
  signature?: string
  backgroundInformation?: string
  avatarUrl?: string
  role: string
  isServiceAccount?: boolean
  autoUpgradeQueues?: boolean
  queueIds?: string[]
  defaultPermissionTemplate?: string
  inviteMode?: 'now' | 'later'
}) {
  const res = await api.post('/users', {
    name: payload.fullName,
    email: payload.email,
    phone: payload.phone || null,
    workEmail: payload.mailId || payload.email || null,
    employeeId: payload.employeeId || null,
    department: payload.department || null,
    reportingManager: payload.reportingManager || null,
    dateOfJoining: payload.dateOfJoining || null,
    employmentType: payload.employmentType || null,
    workMode: payload.workMode || null,
    designation: payload.designation || null,
    client: payload.company || payload.client || null,
    site: payload.location || payload.site || null,
    accountManager: payload.accountManager || payload.backgroundInformation || null,
    workPhone: payload.workPhone || null,
    mobilePhone: payload.mobilePhone || null,
    timeZone: payload.timeZone || null,
    workSchedule: payload.workSchedule || null,
    loadForTicketAssignment: payload.loadForTicketAssignment || null,
    language: payload.language || null,
    timeFormat: payload.timeFormat || null,
    isVip: payload.isVip === true,
    location: payload.location || null,
    company: payload.company || null,
    canSeeAssociatedCompanies: payload.canSeeAssociatedCompanies === true,
    address: payload.address || null,
    signature: payload.signature || null,
    backgroundInformation: payload.backgroundInformation || null,
    avatarUrl: payload.avatarUrl || null,
    role: payload.role,
    isServiceAccount: payload.isServiceAccount,
    autoUpgradeQueues: payload.autoUpgradeQueues,
    queueIds: payload.queueIds,
    status: payload.inviteMode ? 'INVITED' : 'ACTIVE',
    inviteMode: payload.inviteMode,
    defaultPermissionTemplate: payload.defaultPermissionTemplate,
  })
  return res.data
}

export async function sendUserInvite(userId: number) {
  const res = await api.post(`/users/${userId}/send-invite`)
  return res.data
}

export async function markInvitePending(userId: number) {
  const res = await api.post(`/users/${userId}/mark-invite-pending`)
  return res.data
}

export async function sendServiceAccountInvite(userId: number, toEmail?: string) {
  const res = await api.post(`/users/${userId}/service-account/invite`, {
    toEmail: toEmail || undefined,
  })
  return res.data
}

export async function reinviteServiceAccount(userId: number, toEmail?: string) {
  const res = await api.post(`/users/${userId}/service-account/reinvite`, {
    toEmail: toEmail || undefined,
  })
  return res.data
}

export async function saveUserPermissions(userId: number, payload: {
  role: string
  templateKey?: string
  permissions: Record<string, boolean>
  autoSwitchCustom?: boolean
}) {
  const res = await api.put(`/users/${userId}/permissions`, payload)
  return res.data
}

export async function addTicketCustomAction(payload: { queue: string; label: string; actionKey?: string }) {
  const res = await api.post('/users/rbac/ticket-actions', payload)
  return res.data
}

export async function updateUserMfaSettings(userId: number, enabled: boolean) {
  const res = await api.put(`/auth/mfa/users/${userId}`, { enabled })
  return res.data
}
