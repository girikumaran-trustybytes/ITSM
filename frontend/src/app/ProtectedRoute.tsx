import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ children, roles }: { children: JSX.Element, roles?: string[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/portal/login" replace />
  if (roles && roles.length > 0) {
    const currentRole = String(user.role || '').trim().toUpperCase()
    const allowed = roles.map((role) => String(role || '').trim().toUpperCase())
    if (!allowed.includes(currentRole)) return <Navigate to="/unauthorized" replace />
  }
  return children
}

