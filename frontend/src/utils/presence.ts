export type PresenceStatus = 'Available' | 'Do not disturb' | 'Set as away'

export const PRESENCE_STORAGE_KEY = 'itsm.presenceStatus'
export const PRESENCE_CHANGED_EVENT = 'itsm-presence-changed'

export const presenceStatuses: Array<{ value: PresenceStatus; color: string; note: string; style: 'solid' | 'ring' }> = [
  { value: 'Available', color: '#16a34a', note: 'Based on chat activity', style: 'solid' },
  { value: 'Do not disturb', color: '#dc2626', note: 'Mute chat notifications', style: 'solid' },
  { value: 'Set as away', color: '#4b5563', note: 'Show as away', style: 'ring' },
]

export function normalizePresenceStatus(raw: string | null | undefined): PresenceStatus {
  if (raw === 'Available' || raw === 'Do not disturb' || raw === 'Set as away') return raw
  if (raw === 'Automatic') return 'Available'
  if (raw === 'Away') return 'Set as away'
  if (raw === 'Do Not Disturb' || raw === 'Busy') return 'Do not disturb'
  return 'Available'
}

export function getStoredPresenceStatus(): PresenceStatus {
  if (typeof window === 'undefined') return 'Available'
  return normalizePresenceStatus(window.localStorage.getItem(PRESENCE_STORAGE_KEY))
}

export function setStoredPresenceStatus(value: PresenceStatus) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PRESENCE_STORAGE_KEY, value)
  window.dispatchEvent(new CustomEvent(PRESENCE_CHANGED_EVENT, { detail: { value } }))
}

export function toPresenceClass(value: PresenceStatus): 'available' | 'away' | 'dnd' | 'offline' {
  if (value === 'Do not disturb') return 'dnd'
  if (value === 'Set as away') return 'away'
  return 'available'
}
