export type NotificationState = {
  readIds: number[]
  deletedIds: number[]
  clearedAt?: number
}

function normalizeIds(input: any): number[] {
  if (!Array.isArray(input)) return []
  return Array.from(
    new Set(
      input
        .map((v: any) => Number(v))
        .filter((v: number) => Number.isFinite(v) && v > 0)
    )
  ).slice(0, 5000)
}

function getUserStateIdentity(user: any) {
  const id = user?.id != null ? String(user.id).trim() : ''
  if (id) return id
  const email = user?.email != null ? String(user.email).trim().toLowerCase() : ''
  if (email) return `email:${email}`
  return 'anon'
}

export function getNotificationStateKey(user: any) {
  return `itsm.notifications.state.${getUserStateIdentity(user)}`
}

function getAnonNotificationStateKey() {
  return 'itsm.notifications.state.anon'
}

export function loadNotificationState(user: any): NotificationState {
  try {
    const primaryKey = getNotificationStateKey(user)
    const hasUserId = Boolean(user?.id)
    const raw = window.localStorage.getItem(primaryKey)
      || (hasUserId ? window.localStorage.getItem(getAnonNotificationStateKey()) : null)
    if (!raw) return { readIds: [], deletedIds: [], clearedAt: undefined }
    const parsed = JSON.parse(raw)
    const clearedAt = Number(parsed?.clearedAt)
    return {
      readIds: normalizeIds(parsed?.readIds),
      deletedIds: normalizeIds(parsed?.deletedIds),
      clearedAt: Number.isFinite(clearedAt) && clearedAt > 0 ? clearedAt : undefined,
    }
  } catch {
    return { readIds: [], deletedIds: [], clearedAt: undefined }
  }
}

export function saveNotificationState(user: any, state: NotificationState) {
  try {
    const payload = JSON.stringify(state)
    window.localStorage.setItem(getNotificationStateKey(user), payload)
    // Keep anon key in sync so state does not reset when auth hydration toggles user object.
    window.localStorage.setItem(getAnonNotificationStateKey(), payload)
  } catch {
    // ignore storage write failures
  }
}
