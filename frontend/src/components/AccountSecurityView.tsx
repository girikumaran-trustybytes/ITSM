import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { changePassword, getMyMfaSettings, resetAuthenticatorApp, setupAuthenticatorApp, updateMyMfaSettings, verifyAuthenticatorAppSetup } from '../services/auth.service'
import { updateUser } from '../modules/users/services/user.service'
import { getUserAvatarUrl, getUserInitials, setUserAvatarOverride } from '../utils/avatar'

type SecurityTab = 'account-information' | 'password' | 'two-factor-authentication'

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
  const [mfaEnabled, setMfaEnabled] = useState(false)
  const [mfaBusy, setMfaBusy] = useState(false)
  const [mfaMessage, setMfaMessage] = useState('')
  const [mfaError, setMfaError] = useState('')
  const [authenticatorConfigured, setAuthenticatorConfigured] = useState(false)
  const [authenticatorSecret, setAuthenticatorSecret] = useState('')
  const [authenticatorOtpUrl, setAuthenticatorOtpUrl] = useState('')
  const [authenticatorCode, setAuthenticatorCode] = useState('')
  const [showAuthenticatorSetup, setShowAuthenticatorSetup] = useState(false)
  const authCodeRefs = React.useRef<Array<HTMLInputElement | null>>([])

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

  React.useEffect(() => {
    let cancelled = false
    const loadMfa = async () => {
      try {
        const data = await getMyMfaSettings()
        if (cancelled) return
        setMfaEnabled(Boolean(data?.mfaEnabled))
        setAuthenticatorConfigured(Boolean(data?.authenticatorConfigured))
      } catch (_err) {
        if (cancelled) return
      }
    }
    loadMfa()
    return () => { cancelled = true }
  }, [])

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

  const onToggleMfa = async (enabled: boolean) => {
    if (!enabled) {
      const confirmed = window.confirm('Are you sure you want to disable 2FA for your account?')
      if (!confirmed) return
    }
    setMfaError('')
    setMfaMessage('')
    setMfaBusy(true)
    try {
      const data = await updateMyMfaSettings(enabled)
      setMfaEnabled(Boolean(data?.mfaEnabled))
      setAuthenticatorConfigured(Boolean(data?.authenticatorConfigured))
      setMfaMessage(enabled ? 'Two-factor authentication enabled.' : 'Two-factor authentication disabled.')
    } catch (err: any) {
      setMfaError(err?.response?.data?.error || err?.message || 'Failed to update two-factor authentication')
    } finally {
      setMfaBusy(false)
    }
  }

  const onSetupAuthenticator = async () => {
    setMfaError('')
    setMfaMessage('')
    setMfaBusy(true)
    try {
      const data = await setupAuthenticatorApp()
      setAuthenticatorSecret(String(data?.manualEntryKey || ''))
      setAuthenticatorOtpUrl(String(data?.otpauthUrl || ''))
      setAuthenticatorCode('')
      setShowAuthenticatorSetup(true)
      setMfaMessage('Authenticator setup initialized. Scan QR or use the manual key, then verify code.')
    } catch (err: any) {
      setMfaError(err?.response?.data?.error || err?.message || 'Failed to initialize authenticator setup')
    } finally {
      setMfaBusy(false)
    }
  }

  const onVerifyAuthenticator = async () => {
    setMfaError('')
    setMfaMessage('')
    if (!/^\d{6}$/.test(authenticatorCode.trim())) {
      setMfaError('Enter a valid 6-digit verification code.')
      return
    }
    setMfaBusy(true)
    try {
      await verifyAuthenticatorAppSetup(authenticatorCode.trim())
      setAuthenticatorConfigured(true)
      setAuthenticatorCode('')
      setAuthenticatorSecret('')
      setAuthenticatorOtpUrl('')
      setShowAuthenticatorSetup(false)
      setMfaEnabled(true)
      setMfaMessage('Authenticator App configured successfully.')
    } catch (err: any) {
      setMfaError(err?.response?.data?.error || err?.message || 'Failed to verify authenticator setup')
    } finally {
      setMfaBusy(false)
    }
  }

  const onCloseAuthenticatorSetup = () => {
    setShowAuthenticatorSetup(false)
    setAuthenticatorCode('')
  }

  const onCopyAuthenticatorSecret = async () => {
    const value = String(authenticatorSecret || '').trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setMfaMessage('Secret key copied.')
      setMfaError('')
    } catch {
      setMfaError('Failed to copy secret key.')
    }
  }

  const onAuthenticatorDigitChange = (index: number, value: string) => {
    const digit = String(value || '').replace(/\D/g, '').slice(-1)
    const next = authenticatorCode.padEnd(6, ' ').split('')
    next[index] = digit || ' '
    const merged = next.join('').replace(/\s+/g, '')
    setAuthenticatorCode(merged)
    if (digit && index < 5) authCodeRefs.current[index + 1]?.focus()
  }

  const onAuthenticatorDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !String(authenticatorCode[index] || '').trim() && index > 0) {
      authCodeRefs.current[index - 1]?.focus()
    }
  }

  const onAuthenticatorPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    e.preventDefault()
    setAuthenticatorCode(pasted)
    const target = Math.min(5, pasted.length)
    authCodeRefs.current[target]?.focus()
  }

  const onResetAuthenticatorFromSetup = async () => {
    setMfaError('')
    setMfaMessage('')
    setMfaBusy(true)
    try {
      await resetAuthenticatorApp()
      const data = await setupAuthenticatorApp()
      setAuthenticatorConfigured(false)
      setAuthenticatorSecret(String(data?.manualEntryKey || ''))
      setAuthenticatorOtpUrl(String(data?.otpauthUrl || ''))
      setAuthenticatorCode('')
      setShowAuthenticatorSetup(true)
      setMfaMessage('Authenticator key reset. Scan the new QR code and verify.')
    } catch (err: any) {
      setMfaError(err?.response?.data?.error || err?.message || 'Failed to reset authenticator key')
    } finally {
      setMfaBusy(false)
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
              <button className={tab === 'two-factor-authentication' ? 'active' : ''} onClick={() => setTab('two-factor-authentication')}>Two-Factor Authentication</button>
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
            {tab === 'two-factor-authentication' && (
              <div className="account-security-card">
                <h3>Two-Factor Authentication</h3>
                {mfaError ? <div className="account-security-alert error">{mfaError}</div> : null}
                {mfaMessage ? <div className="account-security-alert success">{mfaMessage}</div> : null}
                <div className="account-security-info-list">
                  <div className="account-security-table" role="table" aria-label="Two-Factor Authentication">
                    <div className="account-security-table-row" role="row">
                      <div className="account-security-table-cell account-security-table-label" role="cell">Current Status</div>
                      <div className="account-security-table-cell" role="cell">
                        <span className="account-security-table-value">{mfaEnabled ? 'Enabled' : 'Disabled'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="account-security-inline-actions">
                  <button
                    type="button"
                    onClick={() => onToggleMfa(!mfaEnabled)}
                    disabled={mfaBusy}
                  >
                    {mfaBusy ? 'Updating...' : (mfaEnabled ? 'Disable 2FA' : 'Enable 2FA')}
                  </button>
                </div>
                <div className="account-security-info-list" style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 8px 0' }}>Authenticator App</h4>
                  <div className="account-security-table">
                    <div className="account-security-table-row">
                      <div className="account-security-table-cell account-security-table-label">Status</div>
                      <div className="account-security-table-cell">{authenticatorConfigured ? 'Configured' : 'Not configured'}</div>
                    </div>
                  </div>
                  <div className="account-security-inline-actions" style={{ marginTop: 10 }}>
                    <button type="button" onClick={onSetupAuthenticator} disabled={mfaBusy}>
                      {authenticatorConfigured ? 'Reconfigure Authenticator App' : 'Configure Authenticator App'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      {showAuthenticatorSetup && authenticatorSecret ? (
        <div className="account-security-auth-modal-overlay" role="dialog" aria-modal="true" aria-label="Setup Authenticator App">
          <div className="account-security-auth-modal">
            <div className="account-security-auth-modal-header">
              <div>
                <h4>Setup Authenticator App</h4>
                <p>Each time you log in, in addition to your password, you'll use an authenticator app to generate a one-time code.</p>
              </div>
              <div className="account-security-auth-modal-header-actions">
                {authenticatorConfigured ? (
                  <button type="button" className="account-security-auth-reset-btn" onClick={onResetAuthenticatorFromSetup} disabled={mfaBusy}>
                    {mfaBusy ? 'Resetting...' : 'Reset Authenticator Key'}
                  </button>
                ) : null}
                <button type="button" className="account-security-auth-modal-close" onClick={onCloseAuthenticatorSetup} aria-label="Close">
                  x
                </button>
              </div>
            </div>

            <div className="account-security-auth-step">
              <div className="account-security-auth-step-badge">Step 1</div>
              <h5>Scan QR code</h5>
              <p>Scan the QR code below or manually enter the secret key into your authenticator app.</p>
              <div className="account-security-auth-qr-wrap">
                {authenticatorOtpUrl ? (
                  <img
                    className="account-security-auth-qr"
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(authenticatorOtpUrl)}`}
                    alt="Authenticator QR"
                  />
                ) : null}
                <div className="account-security-auth-manual">
                  <div className="account-security-auth-manual-title">Can't scan QR code?</div>
                  <div className="account-security-auth-manual-sub">Enter this secret instead:</div>
                  <div className="account-security-auth-secret">{authenticatorSecret}</div>
                  <button type="button" onClick={onCopyAuthenticatorSecret}>Copy code</button>
                </div>
              </div>
            </div>

            <div className="account-security-auth-step">
              <div className="account-security-auth-step-badge">Step 2</div>
              <h5>Get verification code</h5>
              <p>Enter the 6-digit code you see in your authenticator app.</p>
              <div className="account-security-auth-otp-label">Enter verification code</div>
              <div className="account-security-auth-otp-row">
                {Array.from({ length: 6 }).map((_, index) => (
                  <input
                    key={index}
                    ref={(el) => { authCodeRefs.current[index] = el }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={authenticatorCode[index] || ''}
                    onChange={(e) => onAuthenticatorDigitChange(index, e.target.value)}
                    onKeyDown={(e) => onAuthenticatorDigitKeyDown(index, e)}
                    onPaste={onAuthenticatorPaste}
                    aria-label={`Verification digit ${index + 1}`}
                  />
                ))}
              </div>
            </div>

            <div className="account-security-auth-modal-actions">
              <button type="button" onClick={onCloseAuthenticatorSetup}>Cancel</button>
              <button type="button" onClick={onVerifyAuthenticator} disabled={mfaBusy}>
                {mfaBusy ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

