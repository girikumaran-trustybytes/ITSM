import React from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { persistLastRoute } from '../services/auth.service'

export default function ProtectedRoute({ children, roles }: { children: JSX.Element, roles?: string[] }) {
  const { user } = useAuth()
  const location = useLocation()
  const currentRoles = Array.isArray(user?.roles)
    ? user.roles.map((role: any) => String(role || '').toUpperCase())
    : [String(user?.role || '').toUpperCase()]
  const allowedRoles = Array.isArray(roles) ? roles.map((r) => String(r || '').toUpperCase()) : undefined
  if (!user) {
    const attemptedRoute = `${location.pathname || ''}${location.search || ''}`
    persistLastRoute(attemptedRoute)
    return <Navigate to="/login" replace />
  }
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.some((role) => currentRoles.includes(role))) return <Navigate to="/unauthorized" replace />
  return children
}

