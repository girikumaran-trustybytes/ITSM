import { Request, Response } from 'express'
import * as authService from './auth.service'

function isDbError(err: any): boolean {
  const name = err?.constructor?.name ?? ''
  const msg = (err?.message ?? '').toLowerCase()
  const code = err?.code ?? ''
  return (
    name.includes('Postgres') ||
    msg.includes('database') ||
    msg.includes('postgres') ||
    msg.includes('db connection') ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === '57P01' || // admin shutdown
    code === '57P03' || // cannot connect now
    code === '53300' // too many connections
  )
}

export async function login(req: Request, res: Response) {
  const { email, password, trustedDeviceToken } = req.body || {}
  try {
    const result = await authService.login(email, password, trustedDeviceToken)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Invalid credentials' })
  }
}

export async function loginWithGoogle(req: Request, res: Response) {
  const { idToken, trustedDeviceToken } = req.body || {}
  try {
    const result = await authService.loginWithGoogle(idToken, trustedDeviceToken)
    res.json(result)
  } catch (err: any) {
    if (isDbError(err)) {
      res.status(503).json({ error: 'Service temporarily unavailable. Please try again later.' })
      return
    }
    res.status(401).json({ error: err.message || 'Google login failed' })
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

export async function verifyMfa(req: Request, res: Response) {
  const { challengeToken, code, dontAskAgain, trustedDeviceLabel } = req.body || {}
  try {
    const result = await authService.verifyMfa(challengeToken, code, Boolean(dontAskAgain), String(trustedDeviceLabel || 'browser'))
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
  const frontendBase = String(process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '')

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

