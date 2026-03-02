import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { CssBaseline } from '@mui/material'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {(() => {
      if (typeof window !== 'undefined') {
        const { pathname, hash, search } = window.location
        const base = import.meta.env.BASE_URL || '/'
        if (pathname !== '/' && hash.startsWith('#/')) {
          window.location.replace(`${base}${hash}`)
          return null
        }
        if (pathname !== '/' && !hash) {
          const cleanPath = pathname.replace(/^\/+/, '')
          const nextRoute = cleanPath ? `#/${cleanPath}${search || ''}` : '#/login'
          window.location.replace(`${base}${nextRoute}`)
        }
      }
      return null
    })()}
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <CssBaseline />
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
)
