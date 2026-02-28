import api from './api'

export type RbacUserRow = {
  id: number
  name: string | null
  email: string
  role: string
  status: string
  isServiceAccount?: boolean
  autoUpgradeQueues?: boolean
  queueIds?: string[]
  inviteStatus?: string
  createdAt?: string
}

export async function listRbacUsers(params: { q?: string; limit?: number; role?: string } = {}) {
  const res = await api.get('/users', { params })
  return res.data as RbacUserRow[]
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
  employeeId?: string
  department?: string
  reportingManager?: string
  dateOfJoining?: string
  employmentType?: string
  workMode?: string
  designation?: string
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
