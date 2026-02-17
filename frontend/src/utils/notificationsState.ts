export type NotificationState = {
  readIds: number[]
  deletedIds: number[]
}

export function getNotificationStateKey(user: any) {
  return `itsm.notifications.state.${String(user?.id || 'anon')}`
}

export function loadNotificationState(user: any): NotificationState {
  try {
    const raw = window.localStorage.getItem(getNotificationStateKey(user))
    if (!raw) return { readIds: [], deletedIds: [] }
    const parsed = JSON.parse(raw)
    return {
      readIds: Array.isArray(parsed?.readIds) ? parsed.readIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)) : [],
      deletedIds: Array.isArray(parsed?.deletedIds) ? parsed.deletedIds.map((v: any) => Number(v)).filter((v: number) => Number.isFinite(v)) : [],
    }
  } catch {
    return { readIds: [], deletedIds: [] }
  }
}

export function saveNotificationState(user: any, state: NotificationState) {
  try {
    window.localStorage.setItem(getNotificationStateKey(user), JSON.stringify(state))
  } catch {
    // ignore storage write failures
  }
}
