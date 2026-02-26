import axios from 'axios'

function normalizeApiBase(rawBase: string) {
  const trimmed = String(rawBase || '').trim()
  if (!trimmed) return 'http://localhost:5000/api'
  const noTrailingSlash = trimmed.replace(/\/+$/, '')
  if (/^https?:\/\//i.test(noTrailingSlash) && !noTrailingSlash.endsWith('/api')) {
    return `${noTrailingSlash}/api`
  }
  return noTrailingSlash
}

const BASE = normalizeApiBase(import.meta.env.VITE_API_BASE || '')

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

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

// Request interceptor to add access token
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  const url = String(config.url || '')

  if (token && config.headers) {
    config.headers['Authorization'] = `Bearer ${token}`
    return config
  }

  // Prevent sending protected API calls without auth; keep public auth endpoints accessible.
  if (!isPublicEndpoint(url)) {
    const onLoginRoute = typeof window !== 'undefined'
      && (window.location.pathname === '/login' || window.location.pathname === '/portal/login')
    if (typeof window !== 'undefined' && !onLoginRoute) {
      window.location.href = '/login'
    }
    return Promise.reject(new Error('Missing access token'))
  }

  return config
})

// Response interceptor to handle 401 -> try refresh once
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    // Only attempt refresh for non-login, non-refresh endpoints
    if (
      error.response &&
      error.response.status === 401 &&
      !original._retry &&
      original.url &&
      !original.url.includes('/auth/login') &&
      !original.url.includes('/auth/refresh') &&
      !isPublicEndpoint(String(original.url || ''))
    ) {
      original._retry = true;
      try {
        const newToken = await refreshToken();
        original.headers['Authorization'] = `Bearer ${newToken}`;
        return api(original);
      } catch (e) {
        // fallback
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        const onLoginRoute = typeof window !== 'undefined'
          && (window.location.pathname === '/login' || window.location.pathname === '/portal/login')
        if (!onLoginRoute) {
          window.location.href = '/login';
        }
        return Promise.reject(e);
      }
    }
    // For login/refresh endpoints or already retried, just reject
    return Promise.reject(error);
  }
);


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
