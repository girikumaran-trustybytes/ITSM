import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { changePassword } from '../services/auth.service'
import { updateUser } from '../modules/users/services/user.service'
import { getUserAvatarUrl, getUserInitials, setUserAvatarOverride } from '../utils/avatar'

type SecurityTab = 'account-information' | 'password'

export default function AccountSecurityView() {
  const navigate = useNavigate()
  const { user, refreshUser } = useAuth()
  const canEditUserName = String(user?.role || '').toUpperCase() === 'ADMIN'
  const avatarFileRef = React.useRef<HTMLInputElement | null>(null)
  const [tab, setTab] = useState<SecurityTab>('account-information')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileMessage, setProfileMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [isProfileEditing, setIsProfileEditing] = useState(false)
  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const initials = getUserInitials(user, 'U')
  const avatarUrl = getUserAvatarUrl(user)
  const fullName = String(user?.name || '').trim()
  const nameParts = fullName.split(/\s+/).filter(Boolean)
  const firstName = nameParts[0] || ''
  const surname = nameParts.slice(1).join(' ')
  const singleInitial = (firstName || fullName || String(user?.email || 'U')).trim().charAt(0).toUpperCase() || 'U'
  const [profileForm, setProfileForm] = useState({
    firstName,
    surname,
    initial: singleInitial,
    phoneNo: String(user?.phone || user?.phoneNumber || '').trim(),
    avatarUrl,
  })

  React.useEffect(() => {
    const nextFullName = String(user?.name || '').trim()
    const nextParts = nextFullName.split(/\s+/).filter(Boolean)
    const nextFirstName = nextParts[0] || ''
    const nextSurname = nextParts.slice(1).join(' ')
    const nextInitial = (nextFirstName || nextFullName || String(user?.email || 'U')).trim().charAt(0).toUpperCase() || 'U'
    setProfileForm({
      firstName: nextFirstName,
      surname: nextSurname,
      initial: nextInitial,
      phoneNo: String(user?.phone || user?.phoneNumber || '').trim(),
      avatarUrl: getUserAvatarUrl(user),
    })
  }, [user?.name, user?.email, user?.phone, user?.phoneNumber])

  const onPickAvatar = () => {
    avatarFileRef.current?.click()
  }

  const onAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!String(file.type || '').startsWith('image/')) {
      setProfileError('Please select a valid image file.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileError('Image size should be less than 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      if (!result) return
      setProfileError('')
      setProfileForm((prev) => ({ ...prev, avatarUrl: result }))
    }
    reader.onerror = () => setProfileError('Failed to read selected image.')
    reader.readAsDataURL(file)
  }

  const onRemoveAvatar = () => {
    setProfileError('')
    setProfileForm((prev) => ({ ...prev, avatarUrl: '' }))
    if (avatarFileRef.current) avatarFileRef.current.value = ''
  }

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

  const onSaveProfile = async () => {
    if (!user?.id) {
      setProfileError('User ID not found. Unable to save.')
      return
    }
    setProfileError('')
    setProfileMessage('')
    const name = `${profileForm.firstName} ${profileForm.surname}`.trim()
    try {
      setProfileBusy(true)
      await updateUser(Number(user.id), {
        ...(canEditUserName ? { name: name || undefined } : {}),
        phone: profileForm.phoneNo.trim() || undefined,
        avatarUrl: profileForm.avatarUrl || null,
      })
      setUserAvatarOverride(user, profileForm.avatarUrl || '')
      refreshUser()
      setIsProfileEditing(false)
      setProfileMessage('Account information updated successfully.')
    } catch (err: any) {
      setProfileError(err?.response?.data?.error || err?.message || 'Failed to save account information')
    } finally {
      setProfileBusy(false)
    }
  }

  return (
    <div className="work-main">
      <div className="account-security-page">
        <div className="account-security-banner">
          <h2>Account Security</h2>
          <button className="account-security-close" onClick={() => navigate('/dashboard')} aria-label="Close">
            ×
          </button>
        </div>
        <div className="account-security-layout">
          <aside className="account-security-sidebar">
            <div className="account-security-user">
              <div className="account-security-avatar unified-user-avatar">
                {profileForm.avatarUrl ? <img src={profileForm.avatarUrl} alt={user?.name || 'User'} className="unified-user-avatar-image" /> : initials}
              </div>
              <div>
                <div className="account-security-name">{user?.name || 'User'}</div>
                <div className="account-security-email">{user?.email || ''}</div>
              </div>
            </div>
            <button className="account-security-return" onClick={() => navigate('/dashboard')}>
              Return to application
            </button>
            <div className="account-security-nav">
              <button className={tab === 'account-information' ? 'active' : ''} onClick={() => setTab('account-information')}>Account Information</button>
              <button className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>Password</button>
              <button type="button" disabled title="Disabled for now">Two-Factor Authentication</button>
            </div>
          </aside>
          <section className="account-security-content">
            {tab === 'account-information' && (
              <div className="account-security-card">
                <h3>Staff Details</h3>
                {profileError ? <div className="account-security-alert error">{profileError}</div> : null}
                {profileMessage ? <div className="account-security-alert success">{profileMessage}</div> : null}
                {isProfileEditing ? (
                  <div className="account-security-inline-actions" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
                    <input
                      ref={avatarFileRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={onAvatarFileChange}
                    />
                    <button type="button" onClick={onPickAvatar}>Change Photo</button>
                    <button type="button" onClick={onRemoveAvatar}>Remove Photo</button>
                  </div>
                ) : null}
                <div className="account-security-info-list">
                  <div className="account-security-table" role="table" aria-label="Staff Details">
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">User Name</div>
                      <div className="account-security-table-cell" role="cell">
                        <span className="account-security-table-value">{user?.name || 'Not set'}</span>
                      </div>
                    </div>
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">Email ID</div>
                      <div className="account-security-table-cell" role="cell">
                        <span className="account-security-table-value">{user?.email || 'Not set'}</span>
                      </div>
                    </div>
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">Role</div>
                      <div className="account-security-table-cell" role="cell">
                        <span className="account-security-table-value">{user?.role || 'Not set'}</span>
                      </div>
                    </div>
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">First Name</div>
                      <div className="account-security-table-cell" role="cell">
                        {!isProfileEditing || !canEditUserName ? (
                          <span className="account-security-table-value">{profileForm.firstName || 'Not set'}</span>
                        ) : (
                          <input
                            type="text"
                            value={profileForm.firstName}
                            placeholder="Not set"
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, firstName: e.target.value }))}
                          />
                        )}
                      </div>
                    </div>
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">Surname</div>
                      <div className="account-security-table-cell" role="cell">
                        {!isProfileEditing || !canEditUserName ? (
                          <span className="account-security-table-value">{profileForm.surname || 'Not set'}</span>
                        ) : (
                          <input
                            type="text"
                            value={profileForm.surname}
                            placeholder="Not set"
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, surname: e.target.value }))}
                          />
                        )}
                      </div>
                    </div>
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">Initial</div>
                      <div className="account-security-table-cell" role="cell">
                        {!isProfileEditing || !canEditUserName ? (
                          <span className="account-security-table-value">{profileForm.initial || 'Not set'}</span>
                        ) : (
                          <input
                            type="text"
                            value={profileForm.initial}
                            className="account-security-input-short"
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, initial: e.target.value.toUpperCase().slice(0, 2) }))}
                          />
                        )}
                      </div>
                    </div>
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">Phone No</div>
                      <div className="account-security-table-cell" role="cell">
                        {!isProfileEditing ? (
                          <span className="account-security-table-value">{profileForm.phoneNo || 'Not set'}</span>
                        ) : (
                          <input
                            type="text"
                            value={profileForm.phoneNo}
                            placeholder="Not set"
                            onChange={(e) => setProfileForm((prev) => ({ ...prev, phoneNo: e.target.value }))}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="account-security-inline-actions">
                  {!isProfileEditing ? (
                    <button type="button" onClick={() => { setProfileError(''); setProfileMessage(''); setIsProfileEditing(true) }}>
                      Edit
                    </button>
                  ) : (
                    <button type="button" onClick={onSaveProfile} disabled={profileBusy}>
                      {profileBusy ? 'Saving...' : 'Save'}
                    </button>
                  )}
                </div>
                {!canEditUserName ? (
                  <div className="account-security-alert" style={{ marginTop: 10 }}>
                    User Name can be changed only by Admin.
                  </div>
                ) : null}
              </div>
            )}
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
          </section>
        </div>
      </div>
    </div>
  )
}

