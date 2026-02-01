import axios from 'axios'

const BASE = import.meta.env.VITE_API_BASE || ''

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

// simple token helper using localStorage
function getAccessToken() {
  return localStorage.getItem('accessToken')
}

async function refreshToken() {
  const refresh = localStorage.getItem('refreshToken')
  if (!refresh) throw new Error('No refresh token')
  const res = await api.post('/api/v1/auth/refresh', { refreshToken: refresh })
  const data = res.data
  if (data.accessToken) {
    localStorage.setItem('accessToken', data.accessToken)
    return data.accessToken
  }
  throw new Error('Failed refresh')
}

// Request interceptor to add access token
api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token && config.headers) config.headers['Authorization'] = `Bearer ${token}`
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
      !original.url.includes('/auth/refresh')
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
        window.location.href = '/login';
        return Promise.reject(e);
      }
    }
    // For login/refresh endpoints or already retried, just reject
    return Promise.reject(error);
  }
);


export default api

export async function fetchJSON(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
