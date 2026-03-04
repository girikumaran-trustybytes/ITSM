import api from './api'

const TRUSTED_TWO_FA_DEVICE_KEY = 'trustedTwoFaDeviceToken'
const TRUSTED_MFA_DEVICE_KEY = 'trustedMfaDeviceToken'
const REMEMBERED_SESSION_EXPIRES_AT_KEY = 'rememberSessionExpiresAt'
const LAST_ROUTE_STORAGE_KEY = 'auth.lastRoute'
const REMEMBER_ME_TTL_MS = 8 * 60 * 60 * 1000

function isRememberedSessionExpired() {
  const expiresRaw = localStorage.getItem(REMEMBERED_SESSION_EXPIRES_AT_KEY)
  if (!expiresRaw) return false
  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false
  return Date.now() >= expiresAt
}

function ensureRememberedSessionExpiry() {
  const hasLocalSession = Boolean(localStorage.getItem('accessToken') || localStorage.getItem('refreshToken'))
  if (!hasLocalSession) return
  const existingExpiry = Number(localStorage.getItem(REMEMBERED_SESSION_EXPIRES_AT_KEY) || 0)
  if (Number.isFinite(existingExpiry) && existingExpiry > 0) return
  localStorage.setItem(REMEMBERED_SESSION_EXPIRES_AT_KEY, String(Date.now() + REMEMBER_ME_TTL_MS))
}

function clearRememberedSessionIfExpired() {
  ensureRememberedSessionExpiry()
  if (!isRememberedSessionExpired()) return
  clearStoredAuth()
}

function clearStoredAuth() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem(REMEMBERED_SESSION_EXPIRES_AT_KEY)
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('refreshToken')
}

function storeAuth(data: any, rememberMe = true) {
  clearStoredAuth()
  const target = rememberMe ? localStorage : sessionStorage
  if (data?.accessToken) target.setItem('accessToken', data.accessToken)
  if (data?.refreshToken) target.setItem('refreshToken', data.refreshToken)
  if (rememberMe) {
    localStorage.setItem(REMEMBERED_SESSION_EXPIRES_AT_KEY, String(Date.now() + REMEMBER_ME_TTL_MS))
  }
}

export function storeAuthTokens(accessToken: string, refreshToken: string, rememberMe = true) {
  storeAuth({ accessToken, refreshToken }, rememberMe)
}

export async function login(email: string, password: string, rememberMe = true) {
  const trustedDeviceToken = localStorage.getItem(TRUSTED_TWO_FA_DEVICE_KEY) || localStorage.getItem(TRUSTED_MFA_DEVICE_KEY) || ''
  const res = await api.post('/auth/login', { email, password, rememberMe, trustedDeviceToken: trustedDeviceToken || undefined })
  const data = res.data
  storeAuth(data, rememberMe)
  return data
}

export async function loginWithGoogle(idToken: string, rememberMe = true) {
  const trustedDeviceToken = localStorage.getItem(TRUSTED_TWO_FA_DEVICE_KEY) || localStorage.getItem(TRUSTED_MFA_DEVICE_KEY) || ''
  const res = await api.post('/auth/google', { idToken, rememberMe, trustedDeviceToken: trustedDeviceToken || undefined })
  const data = res.data
  storeAuth(data, rememberMe)
  return data
}

export async function getGoogleConfig() {
  const res = await api.get('/auth/google/config')
  return res.data
}

export async function getSsoConfig() {
  const res = await api.get('/auth/sso/config')
  return res.data
}

export async function requestPasswordReset(email: string) {
  const res = await api.post('/auth/forgot-password', { email })
  return res.data
}

export async function resetPassword(token: string, password: string) {
  const res = await api.post('/auth/reset-password', { token, password })
  return res.data
}

export async function acceptInvite(token: string, password: string, name?: string) {
  const res = await api.post('/auth/accept-invite', { token, password, name })
  return res.data
}

export async function requestTwoFaChallenge(challengeToken: string, method: 'email' | 'authenticator') {
  const res = await api.post('/auth/mfa/challenge', { challengeToken, method })
  return res.data
}

export async function verifyTwoFa(
  challengeToken: string,
  code: string,
  rememberMe = true,
  dontAskAgain = false,
  trustedDeviceLabel = 'browser'
) {
  const res = await api.post('/auth/mfa/verify', { challengeToken, code, rememberMe, dontAskAgain, trustedDeviceLabel })
  const data = res.data
  if (data?.trustedDeviceToken) {
    localStorage.setItem(TRUSTED_TWO_FA_DEVICE_KEY, String(data.trustedDeviceToken))
    localStorage.removeItem(TRUSTED_MFA_DEVICE_KEY)
  }
  storeAuth(data, rememberMe)
  return data
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post('/auth/change-password', { currentPassword, newPassword })
  return res.data
}

export async function getMfaPolicy() {
  const res = await api.get('/auth/mfa/policy')
  return res.data
}

export async function updateMfaPolicy(payload: {
  mfaRequiredForPrivilegedRoles?: boolean
  primaryMfaMethod?: 'Authenticator App' | 'FIDO2 Key' | 'SMS OTP'
  enrollmentGracePeriodDays?: number
  allowEmergencyBypass?: boolean
}) {
  const res = await api.put('/auth/mfa/policy', payload)
  return res.data
}

export async function getMyMfaSettings() {
  const res = await api.get('/auth/mfa/me')
  return res.data
}

export async function updateMyMfaSettings(enabled: boolean) {
  const res = await api.put('/auth/mfa/me', { enabled })
  return res.data
}

export async function updateUserMfaSettings(userId: number, enabled: boolean) {
  const res = await api.put(`/auth/mfa/users/${userId}`, { enabled })
  return res.data
}

export async function setupAuthenticatorApp() {
  const res = await api.post('/auth/mfa/authenticator/setup')
  return res.data
}

export async function verifyAuthenticatorAppSetup(code: string) {
  const res = await api.post('/auth/mfa/authenticator/verify', { code })
  return res.data
}

export async function resetAuthenticatorApp() {
  const res = await api.post('/auth/mfa/authenticator/reset')
  return res.data
}

export const requestMfaChallenge = requestTwoFaChallenge
export const verifyMfa = verifyTwoFa

export function logout() {
  clearStoredAuth()
  window.location.href = '/login'
}

export function getCurrentUser() {
  try {
    clearRememberedSessionIfExpired()
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    const roles = Array.isArray(payload.roles)
      ? payload.roles.map((role: any) => String(role || '').toUpperCase()).filter((role: string) => role.length > 0)
      : []
    const role = String(payload.role || roles[0] || '').toUpperCase()
    if (role && !roles.includes(role)) roles.unshift(role)
    const permissions = Array.isArray(payload.permissions)
      ? payload.permissions.map((permission: any) => String(permission || '')).filter((permission: string) => permission.length > 0)
      : []
    return {
      id: payload.sub,
      role,
      roles,
      permissions,
      tenantId: Number(payload.tenantId || 1),
      name: payload.name,
      email: payload.email,
    }
  } catch {
    return null
  }
}

export function persistLastRoute(path: string) {
  const next = String(path || '').trim()
  if (!next || next === '/login' || next.startsWith('/reset-password') || next.startsWith('/auth/Account/ConfirmEmail')) return
  try {
    localStorage.setItem(LAST_ROUTE_STORAGE_KEY, next)
  } catch {
    // ignore storage access issues
  }
}

export function getLastRoute() {
  try {
    return String(localStorage.getItem(LAST_ROUTE_STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}

