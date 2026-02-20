import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getGoogleConfig, getSsoConfig, login, loginWithGoogle, requestPasswordReset, resetPassword, storeAuthTokens, verifyMfa } from '../services/auth.service'
import { useAuth } from '../contexts/AuthContext'

declare global {
  interface Window {
    google?: any
  }
}

type Mode = 'login' | 'forgot' | 'reset' | 'mfa'
type SsoProvider = 'google' | 'zoho' | 'outlook'
type SsoProviderConfig = { provider: SsoProvider; enabled: boolean; label: string; loginUrl?: string }

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)
  const [googleReady, setGoogleReady] = useState(false)
  const [googleClientId, setGoogleClientId] = useState<string>((import.meta as any).env?.VITE_GOOGLE_CLIENT_ID || '')
  const [googleHostedDomain, setGoogleHostedDomain] = useState<string>((import.meta as any).env?.VITE_GOOGLE_HOSTED_DOMAIN || '')
  const [ssoProviders, setSsoProviders] = useState<SsoProviderConfig[]>([])
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaChallengeToken, setMfaChallengeToken] = useState('')

  const mode = useMemo<Mode>(() => {
    if (location.pathname === '/reset-password') return 'reset'
    const value = searchParams.get('mode')
    if (value === 'forgot' || value === 'reset' || value === 'mfa') return value
    return 'login'
  }, [location.pathname, searchParams])
  const resetToken = searchParams.get('token') || ''
  useEffect(() => {
    let cancelled = false
    if (googleClientId) return
    getGoogleConfig()
      .then((cfg) => {
        if (cancelled) return
        const cid = String(cfg?.clientId || '').trim()
        if (cid) setGoogleClientId(cid)
        const hd = String(cfg?.hostedDomain || '').trim()
        if (hd) setGoogleHostedDomain(hd)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [googleClientId])

  useEffect(() => {
    let cancelled = false
    getSsoConfig()
      .then((cfg) => {
        if (cancelled) return
        const providers = Array.isArray(cfg?.providers) ? cfg.providers : []
        setSsoProviders(providers.filter((p: any) => p && typeof p.provider === 'string'))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const ssoError = String(searchParams.get('ssoError') || '').trim()
    if (ssoError) setError(ssoError)

    const ssoSuccess = String(searchParams.get('ssoSuccess') || '').trim() === '1'
    const accessToken = String(searchParams.get('accessToken') || '').trim()
    const refreshToken = String(searchParams.get('refreshToken') || '').trim()
    if (ssoSuccess && accessToken && refreshToken) {
      const remember = String(searchParams.get('rememberMe') || '1').trim() !== '0'
      storeAuthTokens(accessToken, refreshToken, remember)
      refreshUser()
      navigate('/dashboard', { replace: true })
      return
    }

    const challengeToken = String(searchParams.get('challengeToken') || '').trim()
    const mfaPreview = String(searchParams.get('mfaCodePreview') || '').trim()
    if (challengeToken) {
      setMfaChallengeToken(challengeToken)
      if (mfaPreview) setInfo(`MFA code (dev preview): ${mfaPreview}`)
    }
  }, [navigate, refreshUser, searchParams])

  async function finishAuth(data: any) {
    if (data?.mfaRequired && data?.challengeToken) {
      setMfaChallengeToken(data.challengeToken)
      setSearchParams({ mode: 'mfa' })
      if (data?.mfaCodePreview) {
        setInfo(`MFA code (dev preview): ${data.mfaCodePreview}`)
      } else {
        setInfo('Verification code sent to your email.')
      }
      return
    }
    refreshUser()
    navigate('/dashboard')
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    try {
      setLoading(true)
      const data = await login(email, password, rememberMe)
      await finishAuth(data)
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  async function onGoogleLogin() {
    setError('')
    setInfo('')
    if (!googleReady || !window.google) {
      setError(googleClientId ? 'Google sign-in is not ready yet.' : 'Google login is not configured by admin.')
      return
    }
    try {
      setLoading(true)
      window.google.accounts.id.prompt()
    } catch (e: any) {
      setError(e?.message || 'Google login failed')
      setLoading(false)
    }
  }

  function onSsoLogin(provider: SsoProvider) {
    if (loading) return
    const remember = rememberMe ? '1' : '0'
    window.location.href = `/api/auth/sso/${provider}/start?rememberMe=${remember}`
  }

  async function onForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!forgotEmail.trim()) {
      setError('Email is required.')
      return
    }
    try {
      setLoading(true)
      const result = await requestPasswordReset(forgotEmail)
      if (result?.resetUrlPreview) {
        setInfo(`Recovery link (dev preview): ${result.resetUrlPreview}`)
      } else {
        setInfo('Recovery link sent. Please check your email to set a new password.')
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Unable to send reset link')
    } finally {
      setLoading(false)
    }
  }

  async function onResetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!resetToken) {
      setError('Missing reset token.')
      return
    }
    if (resetPasswordValue.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (resetPasswordValue !== confirmPasswordValue) {
      setError('Passwords do not match.')
      return
    }
    try {
      setLoading(true)
      await resetPassword(resetToken, resetPasswordValue)
      setInfo('Your password has been changed.')
      setResetPasswordValue('')
      setConfirmPasswordValue('')
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  async function onMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    try {
      setLoading(true)
      const data = await verifyMfa(mfaChallengeToken, mfaCode, rememberMe)
      await finishAuth(data)
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!googleClientId || mode !== 'login') return
    if (typeof window === 'undefined') return

    let cancelled = false
    const onCredential = async (response: any) => {
      if (!response?.credential) return
      setError('')
      setInfo('')
      try {
        setLoading(true)
        const data = await loginWithGoogle(response.credential, rememberMe)
        await finishAuth(data)
      } catch (e: any) {
        setError(e?.response?.data?.error || e.message || 'Google login failed')
      } finally {
        setLoading(false)
      }
    }

    const ensureGoogleScript = () =>
      new Promise<void>((resolve, reject) => {
        const existing = document.querySelector('script[data-google-gsi="1"]') as HTMLScriptElement | null
        if (existing) {
          resolve()
          return
        }
        const script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.defer = true
        script.dataset.googleGsi = '1'
        script.onload = () => resolve()
        script.onerror = () => reject(new Error('Failed to load Google script'))
        document.head.appendChild(script)
      })

    ensureGoogleScript()
      .then(() => {
        if (cancelled || !window.google) return
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          hd: googleHostedDomain || undefined,
          callback: onCredential,
        })
        setGoogleReady(true)
      })
      .catch((err: any) => {
        setError(err?.message || 'Google login setup failed')
      })

    return () => {
      cancelled = true
    }
  }, [googleClientId, googleHostedDomain, mode, rememberMe])

  const switchMode = (next: Mode) => {
    if (next === 'login') {
      navigate('/login')
    } else if (next === 'forgot') {
      navigate('/login?mode=forgot')
    } else if (next === 'mfa') {
      navigate('/login?mode=mfa')
    } else {
      navigate(`/reset-password${resetToken ? `?token=${encodeURIComponent(resetToken)}` : ''}`)
    }
    setError('')
    setInfo('')
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {mode !== 'forgot' && (
          <div className="login-title">
            {mode === 'reset' ? 'SET NEW PASSWORD' : mode === 'mfa' ? 'MFA VERIFICATION' : 'LOG IN'}
          </div>
        )}
        {mode !== 'forgot' && info ? <div className="login-alert login-alert-success">{info}</div> : null}
        {mode !== 'forgot' && error ? <div className="login-alert login-alert-error">{error}</div> : null}

        {mode === 'login' && (
          <form onSubmit={onPasswordLogin} className="login-form">
            <button
              type="button"
              className="login-google-primary"
              onClick={onGoogleLogin}
              disabled={loading || !googleClientId}
            >
              <span className="login-google-icon">G</span>
              <span>Log in with Google</span>
            </button>
            {ssoProviders.some((p) => p.provider === 'zoho' && p.enabled) ? (
              <button type="button" className="login-google-primary" onClick={() => onSsoLogin('zoho')} disabled={loading}>
                <span className="login-google-icon">Z</span>
                <span>Log in with Zoho</span>
              </button>
            ) : null}
            {ssoProviders.some((p) => p.provider === 'outlook' && p.enabled) ? (
              <button type="button" className="login-google-primary" onClick={() => onSsoLogin('outlook')} disabled={loading}>
                <span className="login-google-icon">O</span>
                <span>Log in with Outlook</span>
              </button>
            ) : null}
            <div className="login-or">Or</div>
            <input className="login-input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input className="login-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <div className="login-remember-row">
              <label className="login-remember">
                <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                <span>Remember me</span>
              </label>
              <button type="button" className="login-link-btn login-forgot-inline" onClick={() => switchMode('forgot')}>Forgotten Password?</button>
            </div>
            <button disabled={loading} type="submit" className="login-submit-btn login-submit-green">Log in</button>
            <button type="button" className="login-link-btn" onClick={() => navigate('/portal/login')}>Log in End User Portal</button>
          </form>
        )}

        {mode === 'forgot' && (
          <form onSubmit={onForgotPassword} className="forgot-form">
            <div className="forgot-header">
              <div className="forgot-title">Forgotten Password</div>
              <button type="button" className="forgot-close-btn" onClick={() => switchMode('login')} aria-label="Close">x</button>
            </div>
            <div className="forgot-help">To reset your password, please enter the Email Address for your account below.</div>
            <div className="forgot-divider" />
            {error ? <div className="login-alert login-alert-error">{error}</div> : null}
            {info ? (
              <div className="forgot-success">
                <div><strong>Email sent!</strong> Check your spam/junk folder!</div>
                <button type="button" className="login-link-btn forgot-success-link" onClick={() => switchMode('login')}>Login</button>
              </div>
            ) : null}
            <div className="forgot-input-wrap">
              <span className="forgot-mail-icon">👤</span>
              <input className="forgot-input" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Email Address" />
            </div>
            <button disabled={loading} type="submit" className="forgot-submit-btn">Submit</button>
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={onResetPassword} className="login-form">
            <input className="login-input" type="password" value={resetPasswordValue} onChange={(e) => setResetPasswordValue(e.target.value)} placeholder="New Password" />
            <input className="login-input" type="password" value={confirmPasswordValue} onChange={(e) => setConfirmPasswordValue(e.target.value)} placeholder="Confirm Password" />
            <button disabled={loading} type="submit" className="login-submit-btn">Update Password</button>
            <button type="button" className="login-link-btn" onClick={() => switchMode('login')}>Back to login</button>
            {info ? <button type="button" className="login-link-btn" onClick={() => switchMode('login')}>Login</button> : null}
          </form>
        )}

        {mode === 'mfa' && (
          <form onSubmit={onMfaVerify} className="login-form">
            <input className="login-input" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="Verification Code" />
            <button disabled={loading} type="submit" className="login-submit-btn">Verify</button>
            <button type="button" className="login-link-btn" onClick={() => switchMode('login')}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  )
}

