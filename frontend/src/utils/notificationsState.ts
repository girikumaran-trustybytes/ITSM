export type NotificationState = {
  readIds: number[]
  deletedIds: number[]
  clearedAt?: number
}

export function getNotificationStateKey(user: any) {
  return `itsm.notifications.state.${String(user?.id || 'anon')}`
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
      readIds: Array.isArray(parsed?.readIds) ? parsed.readIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)) : [],
      deletedIds: Array.isArray(parsed?.deletedIds) ? parsed.deletedIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)) : [],
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
