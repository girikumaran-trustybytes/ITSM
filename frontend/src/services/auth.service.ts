import api from './api'

export async function login(email: string, password: string) {
  const res = await api.post('/auth/login', { email, password })
  const data = res.data
  if (data.accessToken) {
    localStorage.setItem('accessToken', data.accessToken)
  }
  if (data.refreshToken) {
    localStorage.setItem('refreshToken', data.refreshToken)
  }
  return data
}

export function logout() {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  window.location.href = '/login'
}

export function getCurrentUser() {
  try {
    const token = localStorage.getItem('accessToken')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { id: payload.sub, role: payload.role, name: payload.name, email: payload.email }
  } catch {
    return null
  }
}

