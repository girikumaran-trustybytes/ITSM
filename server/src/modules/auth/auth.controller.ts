import { Request, Response } from 'express'
import * as authService from './auth.service'
import { acceptInvitationToken } from '../users/invitations.service'

function isDbError(err: any): boolean {
  const name = err?.constructor?.name ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  const code = err?.code ?? ''
  return (
    name.includes('Postgres') ||
    msg.includes('database') ||
    msg.includes('postgres') ||
    msg.includes('db connection') ||
    msg.includes('sasl') ||
    msg.includes('scram') ||
    msg.includes('connect enetunreach') ||
    msg.includes('connect ehostunreach') ||
    msg.includes('network is unreachable') ||
    msg.includes('self-signed certificate in certificate chain') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
    code === 'XX000' ||
    code === '57P01' || // admin shutdown
    code === '57P03' || // cannot connect now
    code === '53300' || // too many connections
    code === 'DB_CONFIG_MISSING'
  )
}

function isInvalidCredentialsError(err: any): boolean {
  const status = Number(err?.status || err?.statusCode || 0)
  if (status === 401) return true
  const message = String(err?.message || '').trim().toLowerCase()
  return message === 'invalid credentials'
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return fallback
}

const AUTH_DB_RETRY_ATTEMPTS = Math.max(0, Number(process.env.AUTH_DB_RETRY_ATTEMPTS || 2))
const AUTH_DB_RETRY_DELAY_MS = Math.max(200, Number(process.env.AUTH_DB_RETRY_DELAY_MS || 350))
// Keep login resilient under transient DB pool/latency spikes.
// Set AUTH_DB_ATTEMPT_TIMEOUT_MS to a positive value to re-enable a hard per-attempt timeout.
const AUTH_DB_ATTEMPT_TIMEOUT_MS = Math.max(0, Number(process.env.AUTH_DB_ATTEMPT_TIMEOUT_MS || 0))

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      const timeoutError: any = new Error(`DB operation timed out after ${timeoutMs}ms`)
      timeoutError.code = 'ETIMEDOUT'
      reject(timeoutError)
    }, timeoutMs)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function maskEmailForLog(value: unknown) {
  const email = String(value || '').trim().toLowerCase()
  const [local, domain] = email.split('@')
  if (!local || !domain) return email || null
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`
}

function logAuthDbUnavailable(scope: string, err: any, extra: Record<string, unknown> = {}) {
  console.error('auth_db_unavailable', {
    scope,
    code: err?.code || null,
    message: err?.message || null,
    name: err?.constructor?.name || null,
    timeoutMs: AUTH_DB_ATTEMPT_TIMEOUT_MS || null,
    retries: AUTH_DB_RETRY_ATTEMPTS,
    ...extra,
  })
}

async function withDbRetry<T>(runner: () => Promise<T>) {
  let lastError: any = null
  for (let attempt = 0; attempt <= AUTH_DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      if (AUTH_DB_ATTEMPT_TIMEOUT_MS > 0) {
        return await withTimeout(runner(), AUTH_DB_ATTEMPT_TIMEOUT_MS)
      }
      return await runner()
    } catch (err: any) {
      lastError = err
      if (!isDbError(err) || attempt >= AUTH_DB_RETRY_ATTEMPTS) break
      await wait(AUTH_DB_RETRY_DELAY_MS * (attempt + 1))
    }
  }
  throw lastError
}

export async function login(req: Request, res: Response) {
  const { email, password, trustedDeviceToken, rememberMe } = req.body || {}
  try {
    const result = await withDbRetry(() =>
      authService.login(email, password, trustedDeviceToken, toBool(rememberMe, false))
    )
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      logAuthDbUnavailable('login', err, { email: maskEmailForLog(email) })
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    if (isInvalidCredentialsError(err)) {
      res.status(401).json({ error: 'Invalid credentials' })
      return
    }
    console.error('auth_login_unexpected_error', {
      code: err?.code || null,
      message: err?.message || null,
      name: err?.constructor?.name || null,
      email: maskEmailForLog(email),
    })
    res.status(err?.status || 500).json({ error: err?.message || 'Unable to login' })
  }
}

export async function loginWithGoogle(req: Request, res: Response) {
  const { idToken, trustedDeviceToken, rememberMe } = req.body || {}
  try {
    const result = await withDbRetry(() =>
      authService.loginWithGoogle(idToken, trustedDeviceToken, toBool(rememberMe, false))
    )
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      logAuthDbUnavailable('login_with_google', err)
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: 'Google login failed' })
  }
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = req.body
  try {
    const result = await authService.forgotPassword(email)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 400).json({ error: err.message || 'Unable to process request' })
  }
}

export async function resetPassword(req: Request, res: Response) {
  const { token, password } = req.body
  try {
    const result = await authService.resetPassword(token, password)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(400).json({ error: err.message || 'Unable to reset password' })
  }
}

export async function acceptInvite(req: Request, res: Response) {
  const { token, password, name } = req.body || {}
  try {
    const result = await acceptInvitationToken(String(token || ''), String(password || ''), String(name || '') || null, { ipAddress: req.ip })
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 400).json({ error: err.message || 'Unable to accept invitation' })
  }
}

export async function verifyMfa(req: Request, res: Response) {
  const { challengeToken, code, dontAskAgain, trustedDeviceLabel, rememberMe } = req.body || {}
  try {
    const result = await authService.verifyMfa(
      challengeToken,
      code,
      Boolean(dontAskAgain),
      String(trustedDeviceLabel || 'browser'),
      toBool(rememberMe, false)
    )
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Invalid 2FA code' })
  }
}

export async function requestMfaChallenge(req: Request, res: Response) {
  const { challengeToken, method } = req.body || {}
  try {
    const normalizedMethod = String(method || '').trim().toLowerCase() === 'authenticator' ? 'authenticator' : 'email'
    const result = await authService.requestMfaChallenge(String(challengeToken || ''), normalizedMethod)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(400).json({ error: err.message || 'Unable to create 2FA challenge' })
  }
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body
  try {
    const result = await authService.refresh(refreshToken)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Unauthorized' })
  }
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = req.body || {}
  const userId = Number((req as any)?.user?.id || 0)
  try {
    const result = await authService.changePassword(userId, String(currentPassword || ''), String(newPassword || ''))
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(400).json({ error: err.message || 'Unable to change password' })
  }
}

export async function getMfaPolicy(_req: Request, res: Response) {
  try {
    const data = await authService.getMfaPolicy()
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to load 2FA policy' })
  }
}

export async function updateMfaPolicy(req: Request, res: Response) {
  try {
    const data = await authService.updateMfaPolicy(req.body || {})
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to update 2FA policy' })
  }
}

export async function getMyMfaSettings(req: Request, res: Response) {
  try {
    const userId = Number((req as any)?.user?.id || 0)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const data = await authService.getUserMfaState(userId)
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to load 2FA settings' })
  }
}

export async function updateMyMfaSettings(req: Request, res: Response) {
  try {
    const userId = Number((req as any)?.user?.id || 0)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const enabled = Boolean((req.body || {}).enabled)
    const data = await authService.setUserMfaEnabled(userId, enabled)
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to update 2FA settings' })
  }
}

export async function setupAuthenticator(req: Request, res: Response) {
  try {
    const userId = Number((req as any)?.user?.id || 0)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const data = await authService.setupAuthenticator(userId)
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to setup authenticator app' })
  }
}

export async function verifyAuthenticatorSetup(req: Request, res: Response) {
  try {
    const userId = Number((req as any)?.user?.id || 0)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const code = String((req.body || {}).code || '')
    const data = await authService.verifyAuthenticatorSetup(userId, code)
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 400).json({ error: err.message || 'Unable to verify authenticator app setup' })
  }
}

export async function resetAuthenticator(req: Request, res: Response) {
  try {
    const userId = Number((req as any)?.user?.id || 0)
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })
    const data = await authService.resetAuthenticator(userId)
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to reset authenticator app' })
  }
}

export async function updateUserMfaSettings(req: Request, res: Response) {
  try {
    const userId = Number(req.params?.id || 0)
    if (!userId) return res.status(400).json({ error: 'Invalid user id' })
    const enabled = Boolean((req.body || {}).enabled)
    const data = await authService.setUserMfaEnabled(userId, enabled)
    res.json(data)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(err.status || 500).json({ error: err.message || 'Unable to update user 2FA settings' })
  }
}

export async function googleConfig(_req: Request, res: Response) {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim()
  const hostedDomain = String(process.env.GOOGLE_HOSTED_DOMAIN || '').trim()
  res.json({
    enabled: Boolean(clientId),
    clientId: clientId || null,
    hostedDomain: hostedDomain || null,
  })
}

export async function warmup(_req: Request, res: Response) {
  try {
    await withDbRetry(() => authService.warmupAuthDb())
    res.json({ ok: true })
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(500).json({ error: err?.message || 'Warmup failed' })
  }
}

function normalizeSsoProvider(value: string): authService.SsoProvider | null {
  const provider = String(value || '').trim().toLowerCase()
  if (provider === 'google' || provider === 'zoho' || provider === 'outlook') return provider
  return null
}

export async function ssoConfig(_req: Request, res: Response) {
  try {
    return res.json(authService.getSsoConfig())
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Unable to load SSO config' })
  }
}

export async function ssoStart(req: Request, res: Response) {
  const provider = normalizeSsoProvider(String(req.params?.provider || ''))
  if (!provider) return res.status(400).json({ error: 'Invalid SSO provider' })
  const rememberMeRaw = String(req.query?.rememberMe || '1').trim().toLowerCase()
  const rememberMe = ['1', 'true', 'yes', 'on'].includes(rememberMeRaw)
  try {
    const url = authService.getSsoStartUrl(provider, rememberMe)
    return res.redirect(url)
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Unable to start SSO login' })
  }
}

export async function ssoCallback(req: Request, res: Response) {
  const provider = normalizeSsoProvider(String(req.params?.provider || ''))
  if (!provider) return res.status(400).send('Invalid SSO provider')
  const code = String(req.query?.code || '').trim()
  const state = String(req.query?.state || '').trim()
  const error = String(req.query?.error || '').trim()
  const errorDescription = String(req.query?.error_description || '').trim()
  const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')

  if (error) {
    const message = errorDescription || error
    return res.redirect(`${frontendBase}/login?ssoError=${encodeURIComponent(message)}`)
  }
  if (!code || !state) {
    return res.redirect(`${frontendBase}/login?ssoError=${encodeURIComponent('Missing SSO callback parameters')}`)
  }

  try {
    const { rememberMe, auth } = await authService.completeSsoCallback(provider, code, state)
    if (auth?.mfaRequired && auth?.challengeToken) {
      const methods = Array.isArray(auth?.availableMethods)
        ? auth.availableMethods.filter((m: any) => m === 'email' || m === 'authenticator')
        : []
      const params = new URLSearchParams({
        mode: 'twofa',
        challengeToken: String(auth.challengeToken || ''),
        ...(methods.length ? { methods: methods.join(',') } : {}),
        ...(auth?.maskedEmail ? { maskedEmail: String(auth.maskedEmail) } : {}),
        ...(auth?.defaultMethod ? { defaultMethod: String(auth.defaultMethod) } : {}),
        ...(auth?.user?.name ? { twoFaUser: String(auth.user.name) } : {}),
        ...(auth?.mfaCodePreview ? { twoFaCodePreview: String(auth.mfaCodePreview) } : {}),
      })
      return res.redirect(`${frontendBase}/login?${params.toString()}`)
    }

    const params = new URLSearchParams({
      ssoSuccess: '1',
      rememberMe: rememberMe ? '1' : '0',
      accessToken: String(auth?.accessToken || ''),
      refreshToken: String(auth?.refreshToken || ''),
    })
    return res.redirect(`${frontendBase}/login?${params.toString()}`)
  } catch (err: any) {
    const message = err.message || 'SSO login failed'
    return res.redirect(`${frontendBase}/login?ssoError=${encodeURIComponent(message)}`)
  }
}

