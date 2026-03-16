import jwt from 'jsonwebtoken'

type MailOauthProvider = 'gmail' | 'outlook' | 'zoho'

type OauthTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'access_secret'
const BACKEND_PUBLIC_URL = String(process.env.BACKEND_PUBLIC_URL || 'http://localhost:5000').trim().replace(/\/+$/, '')

function env(keys: string[]): string {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim()
    if (value) return value
  }
  return ''
}

function getProviderConfig(provider: MailOauthProvider) {
  if (provider === 'gmail') {
    const clientId = env(['MAIL_GOOGLE_CLIENT_ID', 'VITE_MAIL_GOOGLE_CLIENT_ID'])
    const clientSecret = env(['MAIL_GOOGLE_CLIENT_SECRET', 'VITE_MAIL_GOOGLE_CLIENT_SECRET'])
    const redirectUri = env(['MAIL_GOOGLE_REDIRECT_URI', 'VITE_MAIL_GOOGLE_REDIRECT_URI']) || `${BACKEND_PUBLIC_URL}/api/mail/oauth/gmail/callback`
    const scope = env(['MAIL_GOOGLE_SCOPES', 'VITE_MAIL_GOOGLE_SCOPES']) || 'https://mail.google.com/'
    return {
      clientId,
      clientSecret,
      redirectUri,
      scope,
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    }
  }
  if (provider === 'zoho') {
    const clientId = env(['MAIL_ZOHO_CLIENT_ID', 'VITE_MAIL_ZOHO_CLIENT_ID'])
    const clientSecret = env(['MAIL_ZOHO_CLIENT_SECRET', 'VITE_MAIL_ZOHO_CLIENT_SECRET'])
    const redirectUri = env(['MAIL_ZOHO_REDIRECT_URI', 'VITE_MAIL_ZOHO_REDIRECT_URI']) || `${BACKEND_PUBLIC_URL}/api/mail/oauth/zoho/callback`
    const scope = env(['MAIL_ZOHO_SCOPES', 'VITE_MAIL_ZOHO_SCOPES']) || 'ZohoMail.accounts.READ,ZohoMail.messages.ALL'
    const accountsBase = env(['MAIL_ZOHO_ACCOUNTS_BASE', 'VITE_MAIL_ZOHO_ACCOUNTS_BASE']) || 'https://accounts.zoho.com'
    return {
      clientId,
      clientSecret,
      redirectUri,
      scope,
      authUrl: `${accountsBase.replace(/\/+$/, '')}/oauth/v2/auth`,
      tokenUrl: `${accountsBase.replace(/\/+$/, '')}/oauth/v2/token`,
      extraAuthParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    }
  }
  const tenant = env(['MAIL_OUTLOOK_TENANT', 'VITE_MAIL_OUTLOOK_TENANT']) || 'common'
  const clientId = env(['MAIL_OUTLOOK_CLIENT_ID', 'VITE_MAIL_OUTLOOK_CLIENT_ID'])
  const clientSecret = env(['MAIL_OUTLOOK_CLIENT_SECRET', 'VITE_MAIL_OUTLOOK_CLIENT_SECRET'])
  const redirectUri = env(['MAIL_OUTLOOK_REDIRECT_URI', 'VITE_MAIL_OUTLOOK_REDIRECT_URI']) || `${BACKEND_PUBLIC_URL}/api/mail/oauth/outlook/callback`
  const scope = env(['MAIL_OUTLOOK_SCOPES', 'VITE_MAIL_OUTLOOK_SCOPES'])
    || 'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access'
  return {
    clientId,
    clientSecret,
    redirectUri,
    scope,
    authUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    extraAuthParams: {
      response_mode: 'query',
    },
  }
}

export function buildMailOauthState(payload: { provider: MailOauthProvider; mailboxId: string }) {
  return (jwt as any).sign(
    { type: 'mail-oauth', provider: payload.provider, mailboxId: payload.mailboxId },
    ACCESS_SECRET as any,
    { expiresIn: '10m' }
  )
}

export function verifyMailOauthState(state: string): { provider: MailOauthProvider; mailboxId: string } {
  const payload = (jwt as any).verify(state, ACCESS_SECRET)
  if (!payload || payload.type !== 'mail-oauth') throw new Error('Invalid OAuth state')
  return { provider: payload.provider as MailOauthProvider, mailboxId: String(payload.mailboxId || '') }
}

export function buildMailOauthUrl(provider: MailOauthProvider, state: string, loginHint?: string) {
  const cfg = getProviderConfig(provider)
  if (!cfg.clientId || !cfg.redirectUri) return ''
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: 'code',
    scope: cfg.scope,
    state,
  })
  if (loginHint) params.set('login_hint', loginHint)
  if (cfg.extraAuthParams) {
    Object.entries(cfg.extraAuthParams).forEach(([key, value]) => params.set(key, String(value)))
  }
  return `${cfg.authUrl}?${params.toString()}`
}

export async function exchangeMailOauthCode(provider: MailOauthProvider, code: string): Promise<OauthTokenResponse> {
  const cfg = getProviderConfig(provider)
  if (!cfg.clientId || !cfg.clientSecret || !cfg.redirectUri) {
    throw new Error('OAuth client credentials are missing')
  }
  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: 'authorization_code',
  })
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `OAuth token exchange failed (${res.status})`)
  }
  return res.json() as Promise<OauthTokenResponse>
}

export async function refreshMailAccessToken(provider: MailOauthProvider, refreshToken: string): Promise<OauthTokenResponse> {
  const cfg = getProviderConfig(provider)
  if (!cfg.clientId || !cfg.clientSecret) throw new Error('OAuth client credentials are missing')
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
  })
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `OAuth refresh failed (${res.status})`)
  }
  return res.json() as Promise<OauthTokenResponse>
}
