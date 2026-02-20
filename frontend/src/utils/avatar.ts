const AVATAR_MAP_KEY = 'itsm.user.avatar.map.v1'
export const AVATAR_CHANGED_EVENT = 'itsm-avatar-changed'

function safeReadAvatarMap(): Record<string, string> {
  try {
    const raw = localStorage.getItem(AVATAR_MAP_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function safeWriteAvatarMap(next: Record<string, string>) {
  try {
    localStorage.setItem(AVATAR_MAP_KEY, JSON.stringify(next))
  } catch {
    // ignore storage errors
  }
}

function normalizeNameKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function sanitizeAvatarUrl(value: unknown): string {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()

  // Guard against oversized inline payloads causing UI issues.
  if (lower.startsWith('data:') && raw.length > 120_000) return ''
  // Only allow common safe schemes for avatar rendering.
  if (
    lower.startsWith('http://') ||
    lower.startsWith('https://') ||
    lower.startsWith('blob:') ||
    lower.startsWith('data:image/')
  ) {
    return raw
  }
  return ''
}

export function setUserAvatarOverride(user: any, avatarUrl: string) {
  const idKey = String(user?.id || '').trim()
  const emailKey = String(user?.email || '').trim().toLowerCase()
  const nameKey = normalizeNameKey(user?.name || user?.fullName || '')
  const map = safeReadAvatarMap()
  if (!avatarUrl) {
    if (idKey) delete map[`id:${idKey}`]
    if (emailKey) delete map[`email:${emailKey}`]
    if (nameKey) delete map[`name:${nameKey}`]
    safeWriteAvatarMap(map)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { id: idKey || undefined, email: emailKey || undefined, name: nameKey || undefined, avatarUrl: '' } }))
    }
    return
  }
  const safeAvatarUrl = sanitizeAvatarUrl(avatarUrl)
  if (!safeAvatarUrl) {
    if (idKey) delete map[`id:${idKey}`]
    if (emailKey) delete map[`email:${emailKey}`]
    if (nameKey) delete map[`name:${nameKey}`]
    safeWriteAvatarMap(map)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { id: idKey || undefined, email: emailKey || undefined, name: nameKey || undefined, avatarUrl: '' } }))
    }
    return
  }
  if (idKey) map[`id:${idKey}`] = safeAvatarUrl
  if (emailKey) map[`email:${emailKey}`] = safeAvatarUrl
  if (nameKey) map[`name:${nameKey}`] = safeAvatarUrl
  safeWriteAvatarMap(map)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AVATAR_CHANGED_EVENT, { detail: { id: idKey || undefined, email: emailKey || undefined, name: nameKey || undefined, avatarUrl: safeAvatarUrl } }))
  }
}

export function getUserInitials(user: any, fallback = 'U'): string {
  const name = String(user?.name || '').trim()
  const email = String(user?.email || '').trim()
  const source = name || email || fallback
  const parts = source.split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  }

  const compact = source.replace(/[^a-zA-Z0-9]/g, '')
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase()
  if (compact.length === 1) return compact.toUpperCase()
  return fallback.toUpperCase()
}

export function getUserAvatarUrl(user: any): string {
  try {
    const idKey = String(user?.id || '').trim()
    const emailKey = String(user?.email || '').trim().toLowerCase()
    const nameKey = normalizeNameKey(user?.name || user?.fullName || '')
    const map = safeReadAvatarMap()
    if (idKey && map[`id:${idKey}`]) return sanitizeAvatarUrl(map[`id:${idKey}`])
    if (emailKey && map[`email:${emailKey}`]) return sanitizeAvatarUrl(map[`email:${emailKey}`])
    if (nameKey && map[`name:${nameKey}`]) return sanitizeAvatarUrl(map[`name:${nameKey}`])
  } catch {
    // ignore localStorage access issues
  }

  const candidates = [
    user?.avatarUrl,
    user?.profilePic,
    user?.avatar,
    user?.photoUrl,
    user?.image,
    user?.picture,
  ]

  for (const value of candidates) {
    const text = sanitizeAvatarUrl(value)
    if (text) return text
  }
  return ''
}
