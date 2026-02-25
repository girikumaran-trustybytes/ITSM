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
        const { pathname, hash } = window.location
        if (pathname !== '/' && hash.startsWith('#/')) {
          window.location.replace(`/${hash}`)
          return null
        }
        if (pathname !== '/' && !hash) {
          window.location.replace('/#/portal/login')
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
