import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptInvite, getCurrentUser, getGoogleConfig, getLastRoute, getSsoConfig, login, loginWithGoogle, requestTwoFaChallenge, requestPasswordReset, resetPassword, storeAuthTokens, verifyTwoFa } from '../services/auth.service'
import { buildApiUrl } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getDefaultItsmRoute } from '../security/policy'

declare global {
  interface Window {
    google?: any
  }
}

type Mode = 'login' | 'forgot' | 'reset' | 'twofa' | 'mfa' | 'activate'
type SsoProvider = 'google' | 'zoho' | 'outlook'
type SsoProviderConfig = { provider: SsoProvider; enabled: boolean; label: string; loginUrl?: string }
type TwoFaMethod = 'email' | 'authenticator'
const REMEMBER_ME_STORAGE_KEY = 'rememberMe'
const REMEMBERED_EMAIL_STORAGE_KEY = 'rememberedEmail'

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
  const [resetEmail, setResetEmail] = useState('')
  const [resetPasswordValue, setResetPasswordValue] = useState('')
  const [confirmPasswordValue, setConfirmPasswordValue] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const [mfaChallengeToken, setMfaChallengeToken] = useState('')
  const [mfaPreToken, setMfaPreToken] = useState('')
  const [mfaMethods, setMfaMethods] = useState<TwoFaMethod[]>([])
  const [mfaSelectedMethod, setMfaSelectedMethod] = useState<TwoFaMethod>('email')
  const [mfaStep, setMfaStep] = useState<'select' | 'verify'>('select')
  const [twoFaChallengeMethod, setTwoFaChallengeMethod] = useState<TwoFaMethod | ''>('')
  const [mfaMaskedEmail, setMfaMaskedEmail] = useState('')
  const [mfaDontAskAgain, setMfaDontAskAgain] = useState(false)
  const [mfaUserName, setMfaUserName] = useState('User')
  const [activationName, setActivationName] = useState('')
  const [activationPassword, setActivationPassword] = useState('')
  const [activationConfirmPassword, setActivationConfirmPassword] = useState('')

  const mode = useMemo<Mode>(() => {
    if (location.pathname.toLowerCase() === '/auth/account/confirmemail') return 'activate'
    if (location.pathname === '/reset-password') return 'reset'
    const value = searchParams.get('mode')
    if (value === 'forgot' || value === 'reset' || value === 'twofa' || value === 'mfa') return value
    return 'login'
  }, [location.pathname, searchParams])
  const resetToken = searchParams.get('token') || ''
  const resetEmailParam = searchParams.get('email') || ''
  const activationToken = searchParams.get('token') || ''
  const activationEmail = searchParams.get('email') || ''
  const loginRoute = location.pathname === '/portal/login' ? '/portal/login' : '/login'

  const getRoleBasedPostLoginRoute = (authPayload?: any) => {
    const payloadUser = authPayload?.user || authPayload || {}
    const tokenUser = (getCurrentUser() || {}) as { role?: unknown; roles?: unknown; permissions?: unknown }
    return getDefaultItsmRoute({
      role: payloadUser?.role || tokenUser?.role,
      roles: payloadUser?.roles || tokenUser?.roles,
      permissions: payloadUser?.permissions || tokenUser?.permissions,
    })
  }

  const getPostLoginRoute = (authPayload?: any) => {
    const rememberedRoute = String(getLastRoute() || '').trim()
    if (
      rememberedRoute &&
      rememberedRoute.startsWith('/') &&
      rememberedRoute !== '/' &&
      rememberedRoute !== '/login' &&
      !rememberedRoute.startsWith('/reset-password') &&
      !rememberedRoute.startsWith('/auth/Account/ConfirmEmail')
    ) {
      return rememberedRoute
    }
    return getRoleBasedPostLoginRoute(authPayload)
  }

  useEffect(() => {
    if (mode !== 'login') return
    const current = getCurrentUser()
    if (!current) return
    navigate(getPostLoginRoute(current), { replace: true })
  }, [mode, navigate])

  useEffect(() => {
    try {
      const savedRemember = localStorage.getItem(REMEMBER_ME_STORAGE_KEY) === '1'
      const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_STORAGE_KEY) || ''
      if (savedRemember) {
        setRememberMe(true)
        if (savedEmail) setEmail(savedEmail)
      }
    } catch {
      // ignore storage access issues
    }
  }, [])

  useEffect(() => {
    if (mode !== 'reset') return
    if (resetEmailParam) {
      setResetEmail(resetEmailParam)
      return
    }
    if (forgotEmail.trim()) setResetEmail(forgotEmail.trim())
  }, [mode, resetEmailParam, forgotEmail])

  const persistRememberChoice = (checked: boolean, emailValue = '') => {
    try {
      if (checked) {
        localStorage.setItem(REMEMBER_ME_STORAGE_KEY, '1')
        localStorage.setItem(REMEMBERED_EMAIL_STORAGE_KEY, emailValue.trim())
      } else {
        localStorage.removeItem(REMEMBER_ME_STORAGE_KEY)
        localStorage.removeItem(REMEMBERED_EMAIL_STORAGE_KEY)
      }
    } catch {
      // ignore storage access issues
    }
  }
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
      navigate(getPostLoginRoute(), { replace: true })
      return
    }

    const challengeToken = String(searchParams.get('challengeToken') || '').trim()
    const mfaPreview = String(searchParams.get('twoFaCodePreview') || searchParams.get('mfaCodePreview') || '').trim()
    const methodsRaw = String(searchParams.get('methods') || '').trim()
    const maskedEmail = String(searchParams.get('maskedEmail') || '').trim()
    const defaultMethodRaw = String(searchParams.get('defaultMethod') || '').trim().toLowerCase()
    const mfaUserRaw = String(searchParams.get('twoFaUser') || searchParams.get('mfaUser') || '').trim()
    if (challengeToken) {
      setMfaPreToken(challengeToken)
      setMfaChallengeToken('')
      const methods: TwoFaMethod[] = methodsRaw
        ? methodsRaw
          .split(',')
          .map((v) => v.trim().toLowerCase())
          .filter((v): v is TwoFaMethod => v === 'email' || v === 'authenticator')
        : ['email']
      setMfaMethods(methods.length ? methods : ['email'])
      const defaultMethod: TwoFaMethod = defaultMethodRaw === 'authenticator' ? 'authenticator' : 'email'
      setMfaSelectedMethod(methods.includes(defaultMethod) ? defaultMethod : (methods[0] || 'email'))
      setMfaMaskedEmail(maskedEmail)
      if (mfaUserRaw) setMfaUserName(mfaUserRaw)
      setMfaStep('select')
      if (mfaPreview) setInfo(`2FA code (dev preview): ${mfaPreview}`)
    }
  }, [navigate, refreshUser, searchParams])

  useEffect(() => {
    const inTwoFaMode = mode === 'mfa' || mode === 'twofa'
    if (!inTwoFaMode) return
    const hasChallengeInUrl = Boolean(String(searchParams.get('challengeToken') || '').trim())
    const hasActiveChallenge = Boolean(String(mfaPreToken || mfaChallengeToken || '').trim())
    if (hasChallengeInUrl || hasActiveChallenge) return
    navigate(loginRoute, { replace: true })
  }, [mode, mfaPreToken, mfaChallengeToken, searchParams, loginRoute, navigate])

  async function finishAuth(data: any) {
    if (data?.mfaRequired && data?.challengeToken) {
      setMfaPreToken(String(data.challengeToken || ''))
      setMfaChallengeToken('')
      const methods: TwoFaMethod[] = Array.isArray(data?.availableMethods)
        ? data.availableMethods.filter((v: any): v is TwoFaMethod => v === 'email' || v === 'authenticator')
        : ['email']
      setMfaMethods(methods.length ? methods : ['email'])
      setMfaSelectedMethod((methods[0] === 'authenticator' ? 'authenticator' : 'email'))
      setMfaStep('select')
      setMfaMaskedEmail(String(data?.maskedEmail || ''))
      setMfaUserName(String(data?.user?.name || data?.user?.email || 'User'))
      setMfaCode('')
      setMfaDontAskAgain(false)
      setSearchParams({ mode: 'twofa' })
      setInfo('')
      return
    }
    refreshUser()
    navigate(getPostLoginRoute(data), { replace: true })
  }

  async function onPasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    try {
      setLoading(true)
      const data = await login(email, password, rememberMe)
      persistRememberChoice(rememberMe, email)
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
      persistRememberChoice(rememberMe, email)
      window.google.accounts.id.prompt()
    } catch (e: any) {
      setError(e?.message || 'Google login failed')
      setLoading(false)
    }
  }

  function onSsoLogin(provider: SsoProvider) {
    if (loading) return
    persistRememberChoice(rememberMe, email)
    const remember = rememberMe ? '1' : '0'
    window.location.href = buildApiUrl(`/auth/sso/${provider}/start?rememberMe=${remember}`)
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
    if (!String(resetEmail || '').trim()) {
      setError('Email is required.')
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
      setInfo('Your password has been reset.')
      setResetEmail('')
      setResetPasswordValue('')
      setConfirmPasswordValue('')
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Unable to reset password')
    } finally {
      setLoading(false)
    }
  }

  async function onTwoFaVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!mfaChallengeToken) {
      setError('Start verification first.')
      return
    }
    if (!mfaCode.trim()) {
      setError('Enter the 6-digit verification code.')
      return
    }
    try {
      setLoading(true)
      const data = await verifyTwoFa(mfaChallengeToken, mfaCode, rememberMe, mfaDontAskAgain, navigator?.userAgent || 'browser')
      await finishAuth(data)
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  async function onStartTwoFaChallenge() {
    setError('')
    setInfo('')
    if (!mfaPreToken) {
      setError('2FA challenge is missing. Please login again.')
      return
    }
    if (mfaSelectedMethod === 'authenticator' && !mfaMethods.includes('authenticator')) {
      setError('Authenticator app is not configured for this account.')
      return
    }
    try {
      setLoading(true)
      const challenge = await requestTwoFaChallenge(mfaPreToken, mfaSelectedMethod)
      const challengeToken = String(challenge?.challengeToken || '')
      if (!challengeToken) {
        setError('Unable to create 2FA challenge. Please try again.')
        return
      }
      setMfaChallengeToken(challengeToken)
      setTwoFaChallengeMethod(mfaSelectedMethod)
      setMfaStep('verify')
      setMfaCode('')
      if (mfaSelectedMethod === 'email') {
        setInfo(`A verification code has been sent to ${String(challenge?.destination || mfaMaskedEmail || 'your email')}.`)
      } else {
        setInfo('Please enter the code from your Authenticator App.')
      }
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Unable to start 2FA challenge')
    } finally {
      setLoading(false)
    }
  }

  async function onAcceptInvite(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    if (!activationToken) {
      setError('Missing invitation token.')
      return
    }
    if (activationPassword.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (activationPassword !== activationConfirmPassword) {
      setError('Passwords do not match.')
      return
    }
    try {
      setLoading(true)
      await acceptInvite(activationToken, activationPassword, activationName.trim() || undefined)
      setActivationPassword('')
      setActivationConfirmPassword('')
      setInfo('Account activated successfully. Continue to login.')
      navigate('/login', { replace: true })
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message || 'Unable to activate account')
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
      navigate(loginRoute)
    } else if (next === 'forgot') {
      navigate(`${loginRoute}?mode=forgot`)
    } else if (next === 'mfa' || next === 'twofa') {
      navigate(`${loginRoute}?mode=twofa`)
    } else {
      navigate(`/reset-password${resetToken ? `?token=${encodeURIComponent(resetToken)}` : ''}`)
    }
    if (next !== 'mfa' && next !== 'twofa') {
      setMfaCode('')
      setMfaPreToken('')
      setMfaChallengeToken('')
      setMfaMethods([])
      setMfaStep('select')
      setMfaDontAskAgain(false)
    }
    setError('')
    setInfo('')
  }

  return (
    <div className="login-page">
      <div className={`login-card${mode === 'activate' ? ' login-card-activate' : ''}`}>
        {mode === 'activate' && (
          <div className="invite-activation-wrap">
            <form onSubmit={onAcceptInvite} className="invite-activation-form">
              <div className="login-title" style={{ marginBottom: 0 }}>Activate Account</div>
              <p className="invite-activation-help">Set your account password to complete activation, then log in.</p>
              {info ? <div className="login-alert login-alert-success">{info}</div> : null}
              {error ? <div className="login-alert login-alert-error">{error}</div> : null}
              <label className="invite-activation-label">
                Work Email
                <input className="invite-activation-input" value={activationEmail} readOnly />
              </label>
              <div className="invite-activation-grid">
                <label className="invite-activation-label">
                  Name
                  <input
                    className="invite-activation-input"
                    value={activationName}
                    onChange={(e) => setActivationName(e.target.value)}
                    placeholder="Your name"
                  />
                </label>
                <label className="invite-activation-label">
                  Password
                  <input
                    className="invite-activation-input"
                    type="password"
                    value={activationPassword}
                    onChange={(e) => setActivationPassword(e.target.value)}
                    placeholder="Minimum 8 characters"
                  />
                </label>
              </div>
              <label className="invite-activation-label">
                Confirm Password
                <input
                  className="invite-activation-input"
                  type="password"
                  value={activationConfirmPassword}
                  onChange={(e) => setActivationConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                />
              </label>
              <button disabled={loading} type="submit" className="invite-activation-submit">
                {loading ? 'Activating...' : 'Activate & Continue'}
              </button>
            </form>
          </div>
        )}
        {mode !== 'activate' && (
          <>
        {mode !== 'forgot' && mode !== 'reset' && (
          <div className="login-title">
            {mode === 'mfa' || mode === 'twofa' ? 'TWO-FACTOR AUTHENTICATION' : 'LOG IN'}
          </div>
        )}
        {mode !== 'forgot' && mode !== 'reset' && mode !== 'mfa' && mode !== 'twofa' && info ? <div className="login-alert login-alert-success">{info}</div> : null}
        {mode !== 'forgot' && error ? <div className="login-alert login-alert-error">{error}</div> : null}

        {mode === 'login' && (
          <form onSubmit={onPasswordLogin} className="login-form">
            <button
              type="button"
              className="login-google-primary login-google-match"
              onClick={onGoogleLogin}
              disabled={loading || !googleClientId}
            >
              <span className="login-google-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.8-6-6.2s2.7-6.2 6-6.2c1.9 0 3.2.8 3.9 1.5l2.7-2.7C16.9 2.7 14.7 1.8 12 1.8 6.9 1.8 2.8 6 2.8 11.1S6.9 20.4 12 20.4c6.9 0 9.2-4.8 9.2-7.3 0-.5-.1-.9-.1-1.3H12z"/>
                  <path fill="#34A853" d="M2.8 11.1c0 1.6.6 3.1 1.7 4.2l3-2.3c-.4-.6-.7-1.2-.7-1.9s.2-1.3.7-1.9l-3-2.3c-1.1 1.1-1.7 2.6-1.7 4.2z"/>
                  <path fill="#4A90E2" d="M12 20.4c2.7 0 4.9-.9 6.5-2.5l-3.1-2.4c-.8.5-2 .9-3.4.9-2.5 0-4.6-1.7-5.3-4l-3 2.3c1.4 3.2 4.7 5.7 8.3 5.7z"/>
                  <path fill="#FBBC05" d="M7.7 12.4c-.2-.4-.3-.9-.3-1.3s.1-.9.3-1.3l-3-2.3c-.6 1.1-.9 2.3-.9 3.6s.3 2.5.9 3.6l3-2.3z"/>
                </svg>
              </span>
              <span>Continue With Google</span>
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
            <input
              className="login-input"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                const value = e.target.value
                setEmail(value)
                if (rememberMe) persistRememberChoice(true, value)
              }}
              placeholder="Email"
            />
            <input className="login-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            <div className="login-remember-row">
              <label className="login-remember">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setRememberMe(checked)
                    persistRememberChoice(checked, email)
                  }}
                />
                <span>Remember me</span>
              </label>
              <button type="button" className="login-link-btn login-forgot-inline" onClick={() => switchMode('forgot')}>Forgotten Password?</button>
            </div>
            <button disabled={loading} type="submit" className="login-submit-btn login-submit-green">Log in</button>
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
                <div>Please check your email. Instructions regarding resetting your password have been sent to you.</div>
                <button type="button" className="login-link-btn forgot-success-link" onClick={() => switchMode('login')}>
                  Click here to return to the sign-in screen.
                </button>
              </div>
            ) : null}
                        {!info && (
              <>
                <div className="forgot-input-wrap">
                  <span className="forgot-mail-icon">👤</span>
                  <input className="forgot-input" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Email Address" />
                </div>
                <button disabled={loading} type="submit" className="forgot-submit-btn">Submit</button>
              </>
            )}
          </form>
        )}

        {mode === 'reset' && (
          <form onSubmit={onResetPassword} className="reset-form">
            {info ? (
              <div className="reset-success-view">
                <div className="reset-success-title">Reset Password</div>
                <div className="reset-success-text">Your password has been reset.</div>
                <button type="button" className="login-link-btn reset-success-link" onClick={() => switchMode('login')}>
                  Click here to return to the sign-in screen.
                </button>
              </div>
            ) : (
              <>
                <div className="reset-title">Reset Password</div>
                <div className="reset-help">Please enter your email address and a new password.</div>
                <label className="reset-label">
                  Email Address
                  <input
                    className="reset-input"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="Email Address"
                  />
                </label>
                <label className="reset-label">
                  New Password
                  <input
                    className="reset-input"
                    type="password"
                    value={resetPasswordValue}
                    onChange={(e) => setResetPasswordValue(e.target.value)}
                    placeholder="Please enter your new password here"
                  />
                </label>
                <label className="reset-label">
                  Re-enter New Password
                  <input
                    className="reset-input"
                    type="password"
                    value={confirmPasswordValue}
                    onChange={(e) => setConfirmPasswordValue(e.target.value)}
                    placeholder="Please re-enter your new password here"
                  />
                </label>
                <button disabled={loading} type="submit" className="forgot-submit-btn">{loading ? 'Submitting...' : 'Submit'}</button>
              </>
            )}
          </form>
        )}

        {(mode === 'mfa' || mode === 'twofa') && (
          <form onSubmit={onTwoFaVerify} className="login-form login-twofa-form">
            {mfaStep === 'select' ? (
              <div className="login-twofa-panel">
                <div className="login-twofa-subtitle">Please verify your identity to continue</div>
                <div className="login-twofa-methods">
                  {mfaMethods.includes('authenticator') ? (
                    <button
                      type="button"
                      className={`login-twofa-method-card ${mfaSelectedMethod === 'authenticator' ? 'active' : ''}`}
                      onClick={() => {
                        setMfaSelectedMethod('authenticator')
                        setMfaChallengeToken('')
                        setTwoFaChallengeMethod('')
                      }}
                    >
                      <span className="login-twofa-method-radio" aria-hidden="true" />
                      <span>
                        <strong>Authenticator App</strong>
                        <small>Use your authenticator app</small>
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className={`login-twofa-method-card ${mfaSelectedMethod === 'email' ? 'active' : ''}`}
                    onClick={() => {
                      setMfaSelectedMethod('email')
                      setMfaChallengeToken('')
                      setTwoFaChallengeMethod('')
                    }}
                  >
                    <span className="login-twofa-method-radio" aria-hidden="true" />
                    <span>
                      <strong>Email Code</strong>
                      <small>Receive a code via email to {mfaMaskedEmail || 'your email'}</small>
                    </span>
                  </button>
                </div>
                <button disabled={loading} type="button" className="login-submit-btn login-twofa-submit" onClick={onStartTwoFaChallenge}>
                  {loading ? 'Starting...' : 'Continue'}
                </button>
              </div>
            ) : (
              <div className="login-twofa-panel">
                <div className="login-twofa-subtitle">
                  {twoFaChallengeMethod === 'email'
                    ? `A verification code has been sent to ${mfaMaskedEmail || 'your email'}.`
                    : 'Please enter the code from your Authenticator App.'}
                </div>
                <label className="login-twofa-code-label">
                  Enter 6-digit code
                  <input
                    className="login-input login-twofa-code"
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="0 0 0 0 0 0"
                  />
                </label>
                <button disabled={loading} type="submit" className="login-submit-btn login-twofa-submit">
                  {loading ? 'Verifying...' : 'Verify and Continue'}
                </button>
                <button
                  type="button"
                  className="login-link-btn login-twofa-back"
                  onClick={() => {
                    setMfaStep('select')
                    setMfaCode('')
                    setMfaChallengeToken('')
                    setTwoFaChallengeMethod('')
                    setInfo('')
                    setError('')
                  }}
                >
                  Change method
                </button>
              </div>
            )}
            <button type="button" className="login-link-btn login-twofa-back" onClick={() => switchMode('login')}>Back</button>
          </form>
        )}
          </>
        )}
      </div>
    </div>
  )
}



