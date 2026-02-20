import React, { createContext, useContext, useEffect, useState } from 'react'
import { getCurrentUser, logout } from '../services/auth.service'

type AuthState = {
  user: any | null
  refreshUser: () => void
  logout: () => void
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(() => getCurrentUser())

  const refreshUser = () => {
    setUser(getCurrentUser())
  }

  useEffect(() => {
    refreshUser()
  }, [])

  return (
    <AuthContext.Provider value={{ user, refreshUser, logout: () => { logout(); setUser(null) } }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

