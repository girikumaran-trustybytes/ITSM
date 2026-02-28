import api from './api'

function normalizeRole(input: any) {
  return String(input || 'USER').trim().toUpperCase()
}

function clearStoredAuth() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  sessionStorage.removeItem('accessToken')
  sessionStorage.removeItem('refreshToken')
}

function storeAuth(data: any, rememberMe = true) {
  clearStoredAuth()
  const target = rememberMe ? localStorage : sessionStorage
  if (data?.accessToken) target.setItem('accessToken', data.accessToken)
  if (data?.refreshToken) target.setItem('refreshToken', data.refreshToken)
}

export function storeAuthTokens(accessToken: string, refreshToken: string, rememberMe = true) {
  storeAuth({ accessToken, refreshToken }, rememberMe)
}

export async function login(email: string, password: string, rememberMe = true) {
  const res = await api.post('/auth/login', { email, password })
  const data = res.data
  storeAuth(data, rememberMe)
  return data
}

export async function loginWithGoogle(idToken: string, rememberMe = true) {
  const res = await api.post('/auth/google', { idToken })
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

export async function verifyMfa(challengeToken: string, code: string, rememberMe = true) {
  const res = await api.post('/auth/mfa/verify', { challengeToken, code })
  const data = res.data
  storeAuth(data, rememberMe)
  return data
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await api.post('/auth/change-password', { currentPassword, newPassword })
  return res.data
}

export function logout() {
  clearStoredAuth()
  window.location.href = '/login'
}

export function getCurrentUser() {
  try {
    const token = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { id: payload.sub, role: normalizeRole(payload.role), name: payload.name, email: payload.email }
  } catch {
    return null
  }
}

