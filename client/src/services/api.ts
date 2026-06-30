import axios, { AxiosHeaders } from 'axios'

declare global {
  interface Window {
    __API_BASE__?: string
  }
}

function normalizeApiBase(rawBase: string, fallback = 'http://localhost:5000/api') {
  const trimmed = String(rawBase || '').trim()
  if (!trimmed) return fallback
  const noTrailingSlash = trimmed.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(noTrailingSlash)) {
    if (!noTrailingSlash.endsWith('/api')) return `${noTrailingSlash}/api`
    return noTrailingSlash
  }
  // Accept only explicit API-root relative overrides.
  if (noTrailingSlash === '/api' || noTrailingSlash.endsWith('/api')) {
    return noTrailingSlash
  }
  return fallback
}

function resolveApiBase() {
  const env = (import.meta as any).env || {}
  const isDev = Boolean(env.DEV)
  const defaultBase = isDev
    ? '/api'
    : (typeof window === 'undefined' ? 'http://localhost:5000/api' : '/api')
  const envBase = normalizeApiBase(env.VITE_API_BASE || '', defaultBase)
  if (typeof window === 'undefined') return envBase

  const runtimeBase = normalizeApiBase(String(window.__API_BASE__ || ''), '')
  if (runtimeBase) return runtimeBase

  // In dev, avoid stale persisted overrides breaking local proxyed API calls.
  if (!isDev) {
    const rawStoredBase = String(window.localStorage.getItem('itsm.api.base') || '')
    const storedBase = normalizeApiBase(rawStoredBase, '')
    if (storedBase) return storedBase
    if (rawStoredBase.trim()) {
      try {
        window.localStorage.removeItem('itsm.api.base')
      } catch {
        // ignore storage access issues
      }
    }
  }

  return envBase
}

let BASE = resolveApiBase()
const REMEMBERED_SESSION_EXPIRES_AT_KEY = 'rememberSessionExpiresAt'
const LAST_ROUTE_STORAGE_KEY = 'auth.lastRoute'
const REMEMBER_ME_TTL_MS = 8 * 60 * 60 * 1000
const API_TRANSIENT_RETRY_DELAY_MS = Math.max(200, Number((import.meta as any)?.env?.VITE_API_TRANSIENT_RETRY_DELAY_MS || 800))

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

function resolveLoginHref() {
  const base = String((import.meta as any)?.env?.BASE_URL || '/').trim() || '/'
  const normalizedBase = base.startsWith('/') ? base : `/${base}`
  const baseWithTrailingSlash = normalizedBase.endsWith('/') ? normalizedBase : `${normalizedBase}/`
  return `${baseWithTrailingSlash}#/login`
}

function resolveCurrentAppPath() {
  if (typeof window === 'undefined') return ''
  const hash = String(window.location.hash || '').trim()
  if (hash.startsWith('#/')) return hash.slice(1)
  return `${window.location.pathname || ''}${window.location.search || ''}` || ''
}

function isOnLoginRoute() {
  const route = resolveCurrentAppPath()
  return route === '/login' || route === '/portal/login'
}

function redirectToLogin() {
  if (typeof window === 'undefined') return
  window.location.href = resolveLoginHref()
}

function persistCurrentRouteForLoginRedirect() {
  if (typeof window === 'undefined') return
  const route = resolveCurrentAppPath()
  if (!route || route === '/login' || route.startsWith('/reset-password') || route.startsWith('/auth/Account/ConfirmEmail')) return
  try {
    window.localStorage.setItem(LAST_ROUTE_STORAGE_KEY, route)
  } catch {
    // ignore storage access issues
  }
}

function clearAuthTokens() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem(REMEMBERED_SESSION_EXPIRES_AT_KEY)
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('refreshToken')
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

function clearExpiredRememberedSession() {
  ensureRememberedSessionExpiry()
  if (!isRememberedSessionExpired()) return
  clearAuthTokens()
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isIdempotentMethod(method: unknown) {
  const normalized = String(method || 'get').trim().toLowerCase()
  return normalized === 'get' || normalized === 'head' || normalized === 'options'
}

function isTransientApiError(error: any) {
  const status = Number(error?.response?.status || 0)
  if (TRANSIENT_STATUS_CODES.has(status)) return true

  const code = String(error?.code || '').toUpperCase()
  if (TRANSIENT_ERROR_CODES.has(code)) return true

  const message = String(
    error?.response?.data?.error ??
    error?.response?.data?.message ??
    error?.message ??
    ''
  ).toLowerCase()
  return (
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable') ||
    message.includes('service unavailable')
  )
}

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

let refreshInFlight: Promise<string> | null = null

// token helper (persistent + session)
function getAccessToken() {
  return localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
}

function isPublicEndpoint(url: string) {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/google') ||
    url.includes('/auth/google/config') ||
    url.includes('/auth/sso/config') ||
    url.includes('/auth/forgot-password') ||
    url.includes('/auth/reset-password') ||
    url.includes('/auth/accept-invite') ||
    url.includes('/auth/mfa/challenge') ||
    url.includes('/auth/mfa/verify') ||
    url.includes('/auth/refresh')
  )
}

async function refreshToken() {
  const localRefresh = localStorage.getItem('refreshToken')
  const sessionRefresh = sessionStorage.getItem('refreshToken')
  const refresh = localRefresh || sessionRefresh
  if (!refresh) throw new Error('No refresh token')
  const res = await api.post('/auth/refresh', { refreshToken: refresh })
  const data = res.data
  if (data.accessToken) {
    if (localRefresh) localStorage.setItem('accessToken', data.accessToken)
    else sessionStorage.setItem('accessToken', data.accessToken)
    return data.accessToken
  }
  throw new Error('Failed refresh')
}

async function getRefreshedAccessToken() {
  if (refreshInFlight) return refreshInFlight
  refreshInFlight = refreshToken().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// Request interceptor to add access token
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  const url = String(config.url || '')

  if (token) {
    const headers = AxiosHeaders.from(config.headers || {})
    headers.set('Authorization', `Bearer ${token}`)
    config.headers = headers
    return config
  }

  // Prevent sending protected API calls without auth; keep public auth endpoints accessible.
  if (!isPublicEndpoint(url)) {
    const onLoginRoute = isOnLoginRoute()
    if (typeof window !== 'undefined' && !onLoginRoute) {
      persistCurrentRouteForLoginRedirect()
      redirectToLogin()
    }
    return Promise.reject(new Error('Missing access token'))
  }

  return config
})

// Response interceptor to handle 401 -> try refresh once
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const status = Number(error?.response?.status || 0)
    const originalUrl = String(original?.url || '')
    // Only attempt refresh for non-login, non-refresh endpoints
    if (
      status === 401 &&
      !original._retry &&
      originalUrl &&
      !originalUrl.includes('/auth/login') &&
      !originalUrl.includes('/auth/refresh') &&
      !isPublicEndpoint(originalUrl)
    ) {
      original._retry = true
      try {
        const newToken = await getRefreshedAccessToken()
        const headers = AxiosHeaders.from(original.headers || {})
        headers.set('Authorization', `Bearer ${newToken}`)
        original.headers = headers
        return api(original)
      } catch (e) {
        // fallback
        clearAuthTokens()
        const onLoginRoute = isOnLoginRoute()
        if (!onLoginRoute) {
          persistCurrentRouteForLoginRedirect()
          redirectToLogin()
        }
        return Promise.reject(e)
      }
    }

    // If a protected endpoint still returns 401 after a refresh attempt (or cannot be retried),
    // force a clean re-login instead of leaving the UI in a stale-token state.
    if (
      status === 401 &&
      originalUrl &&
      !originalUrl.includes('/auth/login') &&
      !originalUrl.includes('/auth/refresh') &&
      !isPublicEndpoint(originalUrl)
    ) {
      clearAuthTokens()
      const onLoginRoute = isOnLoginRoute()
      if (!onLoginRoute) {
        persistCurrentRouteForLoginRedirect()
        redirectToLogin()
      }
      return Promise.reject(error)
    }

    if (
      original &&
      !original._transientRetry &&
      isIdempotentMethod(original.method) &&
      isTransientApiError(error)
    ) {
      original._transientRetry = true
      await wait(API_TRANSIENT_RETRY_DELAY_MS)
      return api(original)
    }

    // For login/refresh endpoints or already retried, just reject
    return Promise.reject(error)
  }
)


export default api

export function buildApiUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${BASE}${normalizedPath}`
}

export async function fetchJSON(path: string, options: RequestInit = {}) {
  const res = await fetch(buildApiUrl(path), options)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
