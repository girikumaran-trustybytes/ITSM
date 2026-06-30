import api from './api'

const TRUSTED_TWO_FA_DEVICE_KEY = 'trustedTwoFaDeviceToken'
const TRUSTED_MFA_DEVICE_KEY = 'trustedMfaDeviceToken'
const REMEMBERED_SESSION_EXPIRES_AT_KEY = 'rememberSessionExpiresAt'
const LAST_ROUTE_STORAGE_KEY = 'auth.lastRoute'
const REMEMBER_ME_TTL_MS = 8 * 60 * 60 * 1000
const AUTH_REQUEST_TIMEOUT_MS = Math.max(3000, Number((import.meta as any)?.env?.VITE_AUTH_REQUEST_TIMEOUT_MS || 12000))
const AUTH_RETRY_BASE_DELAY_MS = Math.max(200, Number((import.meta as any)?.env?.VITE_AUTH_RETRY_BASE_DELAY_MS || 600))
const AUTH_RETRY_MAX_DELAY_MS = Math.max(400, Number((import.meta as any)?.env?.VITE_AUTH_RETRY_MAX_DELAY_MS || 2500))
const AUTH_RETRY_MAX_ATTEMPTS = Math.max(0, Number((import.meta as any)?.env?.VITE_AUTH_RETRY_MAX_ATTEMPTS || 2))
const AUTH_RETRY_MAX_WINDOW_MS = Math.max(
  AUTH_REQUEST_TIMEOUT_MS + 2000,
  Number((import.meta as any)?.env?.VITE_AUTH_RETRY_MAX_WINDOW_MS || 45000)
)
const AUTH_WAKEUP_TIMEOUT_MS = Math.max(1000, Number((import.meta as any)?.env?.VITE_AUTH_WAKEUP_TIMEOUT_MS || 6000))
const AUTH_WAKEUP_POLL_INTERVAL_MS = Math.max(800, Number((import.meta as any)?.env?.VITE_AUTH_WAKEUP_POLL_INTERVAL_MS || 1500))

const TRANSIENT_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504])
const TRANSIENT_ERROR_CODES = new Set([
  'ERR_NETWORK',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
])

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function getErrorMessage(error: any) {
  return String(
    error?.response?.data?.error ??
    error?.response?.data?.message ??
    error?.message ??
    ''
  ).toLowerCase()
}

function isTransientAuthError(error: any) {
  const status = Number(error?.response?.status || 0)
  if (TRANSIENT_STATUS_CODES.has(status)) return true

  const code = String(error?.code || '').toUpperCase()
  if (TRANSIENT_ERROR_CODES.has(code)) return true

  const message = getErrorMessage(error)
  return (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('service unavailable')
  )
}

async function pingAuthPublicEndpoint() {
  try {
    await api.get('/auth/warmup', { timeout: AUTH_WAKEUP_TIMEOUT_MS })
    return true
  } catch {
    // Fall back to an always-public endpoint if warmup route is not available yet.
  }
  try {
    await api.get('/auth/google/config', { timeout: Math.min(AUTH_WAKEUP_TIMEOUT_MS, 6000) })
    return true
  } catch {
    // Best-effort warm-up for sleeping backends (e.g., free-tier cold starts).
  }
  return false
}

let authWarmupPromise: Promise<void> | null = null
let authWarmedUp = false

export function prewarmAuthEndpoints() {
  if (authWarmedUp) return Promise.resolve()
  if (!authWarmupPromise) {
    authWarmupPromise = (async () => {
      const ready = await pingAuthPublicEndpoint()
      if (ready) authWarmedUp = true
    })()
      .finally(() => {
        authWarmupPromise = null
      })
  }
  return authWarmupPromise
}

async function waitForAuthWarmup(maxWaitMs: number) {
  if (authWarmedUp) return true
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const ready = await pingAuthPublicEndpoint()
    if (ready) {
      authWarmedUp = true
      return true
    }
    const elapsed = Date.now() - start
    const remaining = maxWaitMs - elapsed
    if (remaining <= 0) break
    await wait(Math.min(AUTH_WAKEUP_POLL_INTERVAL_MS, remaining))
  }
  return false
}

async function postAuthWithRetry(path: string, payload: Record<string, any>) {
  let lastError: any = null
  const deadline = Date.now() + AUTH_RETRY_MAX_WINDOW_MS
  if (!authWarmedUp) {
    const initialWarmupWait = Math.min(AUTH_WAKEUP_TIMEOUT_MS, Math.max(0, deadline - Date.now()))
    if (initialWarmupWait > 0) await waitForAuthWarmup(initialWarmupWait)
  }
  let attempt = 0
  while (Date.now() < deadline) {
    try {
      return await api.post(path, payload, { timeout: AUTH_REQUEST_TIMEOUT_MS })
    } catch (error: any) {
      lastError = error
      const isTransient = isTransientAuthError(error)
      const remaining = deadline - Date.now()
      const hasRetryBudget = attempt < AUTH_RETRY_MAX_ATTEMPTS && remaining > 0
      if (!isTransient || !hasRetryBudget) break

      attempt += 1
      const remainingAfterAttempt = deadline - Date.now()
      if (remainingAfterAttempt <= 0) break
      const warmupBudget = Math.min(remainingAfterAttempt, AUTH_WAKEUP_TIMEOUT_MS)
      if (!authWarmedUp && warmupBudget > 0) {
        await waitForAuthWarmup(warmupBudget)
      } else {
        await pingAuthPublicEndpoint()
      }
      const delayMs = Math.min(
        AUTH_RETRY_BASE_DELAY_MS * (2 ** Math.min(attempt - 1, 6)),
        AUTH_RETRY_MAX_DELAY_MS,
        remainingAfterAttempt
      )
      if (delayMs > 0) await wait(delayMs)
    }
  }

  throw lastError
}

function resolveLoginHref() {
  const base = String((import.meta as any)?.env?.BASE_URL || '/').trim() || '/'
  const normalizedBase = base.startsWith('/') ? base : `/${base}`
  const baseWithTrailingSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`
  return `${baseWithTrailingSlash}#/login`
}

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
  const res = await postAuthWithRetry('/auth/login', {
    email,
    password,
    rememberMe,
    trustedDeviceToken: trustedDeviceToken || undefined,
  })
  const data = res.data
  storeAuth(data, rememberMe)
  return data
}

export async function loginWithGoogle(idToken: string, rememberMe = true) {
  const trustedDeviceToken = localStorage.getItem(TRUSTED_TWO_FA_DEVICE_KEY) || localStorage.getItem(TRUSTED_MFA_DEVICE_KEY) || ''
  const res = await postAuthWithRetry('/auth/google', {
    idToken,
    rememberMe,
    trustedDeviceToken: trustedDeviceToken || undefined,
  })
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
  window.location.href = resolveLoginHref()
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

