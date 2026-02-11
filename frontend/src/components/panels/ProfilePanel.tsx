import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function ProfilePanel() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const initials = user?.name ? user.name.trim()[0]?.toUpperCase() : 'G'

  return (
    <div className="profile-menu">
      <div className="profile-menu-header">
        <div className="profile-menu-title">Account</div>
        <div className="profile-menu-user">
          <div className="profile-menu-avatar">{initials}</div>
          <div className="profile-menu-name">{user?.name || 'User'}</div>
        </div>
      </div>
      <div className="profile-menu-items">
        <button className="profile-menu-item" onClick={() => navigate('/account')}>
          <span className="profile-menu-icon">Profile</span>
          <span className="profile-menu-text">Profile</span>
        </button>
        <button
          className="profile-menu-item"
          onClick={() => {
            logout()
            navigate('/login')
          }}
        >
          <span className="profile-menu-icon">Logout</span>
          <span className="profile-menu-text">Logout</span>
        </button>
      </div>
    </div>
  )
}
