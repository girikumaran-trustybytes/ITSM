import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { changePassword } from '../services/auth.service'

type SecurityTab = 'password' | 'mfa' | 'sessions'

export default function AccountSecurityView() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [tab, setTab] = useState<SecurityTab>('password')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const initials = (user?.name || 'U').trim()[0]?.toUpperCase() || 'U'

  const onSubmitPassword = async () => {
    setMessage('')
    setError('')
    if (!form.currentPassword.trim() || !form.newPassword.trim()) {
      setError('Current password and new password are required.')
      return
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New password and confirm password do not match.')
      return
    }
    setBusy(true)
    try {
      await changePassword(form.currentPassword, form.newPassword)
      setMessage('Password updated successfully.')
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Failed to change password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="work-main">
      <div className="account-security-page">
        <div className="account-security-banner">
          <h2>Account Security</h2>
        </div>
        <div className="account-security-layout">
          <aside className="account-security-sidebar">
            <div className="account-security-user">
              <div className="account-security-avatar">{initials}</div>
              <div>
                <div className="account-security-name">{user?.name || 'User'}</div>
                <div className="account-security-email">{user?.email || ''}</div>
              </div>
            </div>
            <button className="account-security-return" onClick={() => navigate('/dashboard')}>
              Return to application
            </button>
            <div className="account-security-nav">
              <button className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>Password</button>
              <button className={tab === 'mfa' ? 'active' : ''} onClick={() => setTab('mfa')}>Two-Factor Authentication</button>
              <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>Sessions</button>
            </div>
          </aside>
          <section className="account-security-content">
            {tab === 'password' && (
              <div className="account-security-card">
                <h3>Change Password</h3>
                {error ? <div className="account-security-alert error">{error}</div> : null}
                {message ? <div className="account-security-alert success">{message}</div> : null}
                <label>
                  Old Password
                  <input
                    type="password"
                    value={form.currentPassword}
                    onChange={(e) => setForm((prev) => ({ ...prev, currentPassword: e.target.value }))}
                    placeholder="Enter current password"
                  />
                </label>
                <label>
                  New Password
                  <input
                    type="password"
                    value={form.newPassword}
                    onChange={(e) => setForm((prev) => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Enter new password"
                  />
                </label>
                <label>
                  Re-enter New Password
                  <input
                    type="password"
                    value={form.confirmPassword}
                    onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Re-enter new password"
                  />
                </label>
                <button className="account-security-submit" disabled={busy} onClick={onSubmitPassword}>
                  {busy ? 'Submitting...' : 'Submit'}
                </button>
              </div>
            )}
            {tab === 'mfa' && (
              <div className="account-security-card">
                <h3>Two-Factor Authentication</h3>
                <div className="account-security-alert success">Two factor authentication is enabled.</div>
                <p>Two-factor authentication requires a verification code after password sign-in based on policy.</p>
                <p>The administrator can enforce 2FA for roles. Contact admin to change policy behavior.</p>
                <div className="account-security-inline-actions">
                  <button type="button">Configure Authenticator App</button>
                  <button type="button">Reset Authenticator Key</button>
                </div>
              </div>
            )}
            {tab === 'sessions' && (
              <div className="account-security-card">
                <h3>Sessions</h3>
                <p>Current browser session is active.</p>
                <p>When password changes, refresh tokens are revoked for other sessions.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

