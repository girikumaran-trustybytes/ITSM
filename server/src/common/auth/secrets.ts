const BLOCKED_DEFAULT_SECRETS = new Set([
  'access_secret',
  'refresh_secret',
  'secret',
  'changeme',
  'change-me',
  'default',
])

function normalizeSecret(value: string) {
  return String(value || '').trim()
}

export function getRequiredSecret(envName: string): string {
  const secret = normalizeSecret(process.env[envName] || '')
  if (!secret) {
    throw new Error(`${envName} is required and must be configured`)
  }

  if (BLOCKED_DEFAULT_SECRETS.has(secret.toLowerCase())) {
    throw new Error(`${envName} uses an insecure default value`)
  }

  return secret
}
