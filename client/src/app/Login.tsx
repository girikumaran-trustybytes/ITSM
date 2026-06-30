import React, { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { acceptInvite, getCurrentUser, getLastRoute, getSsoConfig, login, prewarmAuthEndpoints, requestTwoFaChallenge, requestPasswordReset, resetPassword, storeAuthTokens, verifyTwoFa } from '../services/auth.service'
import { buildApiUrl } from '../services/api'
import { useAuth } from '../contexts/AuthContext'
import { getDefaultItsmRoute } from '../security/policy'

type Mode = 'login' | 'forgot' | 'reset' | 'twofa' | 'mfa' | 'activate'
type SsoProvider = 'google' | 'zoho' | 'outlook'
type SsoProviderConfig = { provider: SsoProvider; enabled: boolean; label: string; loginUrl?: string }
type TwoFaMethod = 'email' | 'authenticator'
const REMEMBER_ME_STORAGE_KEY = 'rememberMe'
const REMEMBERED_EMAIL_STORAGE_KEY = 'rememberedEmail'
const LOGO_ASSET_VERSION = '20260401b'
const GENERIC_SERVICE_MESSAGE = 'Service temporarily unavailable. Please try again later.'

const INTERNAL_ERROR_SIGNATURES = [
  'connect enetunreach',
  'connect ehostunreach',
  'network is unreachable',
  'timeout of',
  'econnaborted',
  'econnrefused',
  'etimedout',
  'enotfound',
  'db connection',
  'postgres',
  'database',
  'sasl',
  'scram',
  'sqlstate',
  'password authentication failed',
  'local (::0)',
  ':5432',
]

function toSafeAuthError(input: unknown, fallback: string) {
  const normalize = (value: unknown, depth = 0): string => {
    if (depth > 4 || value === null || value === undefined) return ''
    if (typeof value === 'string') return value.trim()
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (value instanceof Error) return String(value.message || '').trim()
    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = normalize(item, depth + 1)
        if (nested) return nested
      }
      return ''
    }
    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      const preferredKeys = ['error', 'message', 'detail', 'details', 'reason', 'title']
      for (const key of preferredKeys) {
        const nested = normalize(record[key], depth + 1)
        if (nested) return nested
      }
      return ''
    }
    return ''
  }

  const message = normalize(input)
  if (!message) return fallback
  const lower = message.toLowerCase()
  if (INTERNAL_ERROR_SIGNATURES.some((signature) => lower.includes(signature))) {
    return GENERIC_SERVICE_MESSAGE
  }
  return message
}

function extractAuthError(err: any, fallback: string) {
  return toSafeAuthError(
    err?.response?.data?.error ??
    err?.response?.data?.message ??
    err?.response?.data ??
    err?.message ??
    err,
    fallback
  )
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { refreshUser } = useAuth()
  const [loading, setLoading] = useState(false)
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
    if (mode !== 'login') return
    void prewarmAuthEndpoints()
  }, [mode])

  useEffect(() => {
    if (mode !== 'login') return
    let timeoutId: number | undefined
    let idleId: number | undefined
    const prefetchAppChunks = () => {
      void import('../components/Dashboard')
      void import('../modules/tickets/components/TicketsView')
      void import('../modules/assets/components/AssetsView')
      void import('../modules/users/components/UsersView')
      void import('../modules/suppliers/components/SuppliersView')
    }
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(prefetchAppChunks, { timeout: 1200 })
      return () => {
        if (idleId !== undefined && 'cancelIdleCallback' in window) (window as any).cancelIdleCallback(idleId)
      }
    }
    timeoutId = window.setTimeout(prefetchAppChunks, 400)
    return () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [mode])

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
    if (ssoError) setError(toSafeAuthError(ssoError, 'SSO login failed'))

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
      setError(extractAuthError(e, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  function onSsoLogin(provider: SsoProvider) {
    if (loading) return
    persistRememberChoice(rememberMe, email)
    const remember = rememberMe ? '1' : '0'
    window.location.href = buildApiUrl(`/auth/sso/${provider}/start?rememberMe=${remember}`)
  }

  function onSsoPrimaryLogin() {
    if (loading) return
    const priority: SsoProvider[] = ['zoho', 'outlook', 'google']
    const provider = priority.find((candidate) =>
      ssoProviders.some((item) => item.enabled && item.provider === candidate)
    )
    if (!provider) {
      setError('SSO login is not configured by admin.')
      return
    }
    setError('')
    setInfo('')
    onSsoLogin(provider)
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
      setError(extractAuthError(e, 'Unable to send reset link'))
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
      setError(extractAuthError(e, 'Unable to reset password'))
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
      setError(extractAuthError(e, 'Invalid verification code'))
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
      setError(extractAuthError(e, 'Unable to start 2FA challenge'))
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
      setError(extractAuthError(e, 'Unable to activate account'))
    } finally {
      setLoading(false)
    }
  }

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
        {mode === 'login' ? (
          <div className="login-template-head">
            <div className="login-template-icon-wrap">
              <img src={`/techdesk-icon.svg?v=${LOGO_ASSET_VERSION}`} alt="Support Tech Desk" className="login-template-icon" />
            </div>
            <div className="login-template-title">Welcome Back!</div>
            <div className="login-template-subtitle">Please enter your login details.</div>
          </div>
        ) : (
          <>
            <div className="login-brand">
              <img src={`/techdesk-logo.png?v=${LOGO_ASSET_VERSION}`} alt="Support Tech Desk" className="login-brand-logo" />
            </div>
            {mode !== 'forgot' && mode !== 'reset' && (
              <div className="login-title">
                {mode === 'mfa' || mode === 'twofa' ? 'TWO-FACTOR AUTHENTICATION' : 'LOG IN'}
              </div>
            )}
          </>
        )}
        {mode !== 'forgot' && mode !== 'reset' && mode !== 'mfa' && mode !== 'twofa' && info ? <div className="login-alert login-alert-success">{info}</div> : null}
        {mode !== 'forgot' && error ? <div className="login-alert login-alert-error">{error}</div> : null}

        {mode === 'login' && (
          <form onSubmit={onPasswordLogin} className={`login-form${loading ? ' login-form-loading' : ''}`} aria-busy={loading}>
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
              <button type="button" className="login-link-btn login-forgot-inline" onClick={() => switchMode('forgot')}>Forgot Password?</button>
            </div>
            <button disabled={loading} type="submit" className="login-submit-btn login-submit-primary" aria-busy={loading}>
              {loading ? (
                <span className="login-btn-loading">
                  <span className="login-btn-spinner" aria-hidden="true" />
                  <span>Signing in...</span>
                </span>
              ) : 'Log in'}
            </button>
            <button
              type="button"
              className="login-submit-btn login-sso-btn"
              onClick={onSsoPrimaryLogin}
              disabled={loading}
            >
              Login with SSO
            </button>
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



