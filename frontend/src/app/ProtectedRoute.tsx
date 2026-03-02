import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, roles }: { children: JSX.Element, roles?: string[] }) {
  const { user } = useAuth()
  const currentRoles = Array.isArray(user?.roles)
    ? user.roles.map((role: any) => String(role || '').toUpperCase())
    : [String(user?.role || '').toUpperCase()]
  const allowedRoles = Array.isArray(roles) ? roles.map((r) => String(r || '').toUpperCase()) : undefined
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.some((role) => currentRoles.includes(role))) return <Navigate to="/unauthorized" replace />
  return children
}

