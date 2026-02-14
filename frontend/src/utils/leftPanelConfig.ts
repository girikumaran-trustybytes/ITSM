export type QueueRule = {
  id: string
  label: string
  field: string
  value: string
}

export type LeftPanelConfig = {
  ticketsMyLists: QueueRule[]
  users: QueueRule[]
  assets: QueueRule[]
  suppliers: QueueRule[]
}

const STORAGE_KEY = 'itsm_left_panel_config_v1'

const defaultConfig: LeftPanelConfig = {
  ticketsMyLists: [
    { id: 't-all', label: 'All Tickets', field: 'status', value: 'all' },
    { id: 't-open', label: 'Open Tickets', field: 'status', value: 'open' },
    { id: 't-sla-hold', label: 'SLA Hold', field: 'sla', value: 'hold' },
  ],
  users: [
    { id: 'u-active', label: 'Active', field: 'status', value: 'active' },
    { id: 'u-inactive', label: 'Inactive', field: 'status', value: 'inactive' },
    { id: 'u-onsite', label: 'Onsite', field: 'workMode', value: 'onsite' },
    { id: 'u-remote', label: 'Remote', field: 'workMode', value: 'remote' },
  ],
  assets: [
    { id: 'a-owned', label: 'Owned', field: 'assigned', value: 'assigned' },
    { id: 'a-unassigned', label: 'Unassigned', field: 'assigned', value: 'unassigned' },
    { id: 'a-inuse', label: 'In Use', field: 'status', value: 'in use' },
    { id: 'a-available', label: 'Available', field: 'status', value: 'available' },
    { id: 'a-retired', label: 'Retired', field: 'status', value: 'retired' },
  ],
  suppliers: [],
}

function normalizeTicketMyLists(rules: QueueRule[]): QueueRule[] {
  if (!Array.isArray(rules) || rules.length === 0) return defaultConfig.ticketsMyLists
  const legacyIds = ['t-open', 't-closed', 't-sla']
  const incomingIds = rules.map((r) => String(r?.id || ''))
  const isLegacyOnly = incomingIds.length === legacyIds.length && legacyIds.every((id) => incomingIds.includes(id))
  if (isLegacyOnly) return defaultConfig.ticketsMyLists
  return rules
}

function normalizeAssetRules(rules: QueueRule[]): QueueRule[] {
  if (!Array.isArray(rules) || rules.length === 0) return defaultConfig.assets
  const sanitized = rules
    .filter((rule) => {
      const label = String(rule?.label || '').toLowerCase()
      return !label.includes('my list') && !label.includes('bookmark') && label !== 'all assets'
    })
    .map((rule) => {
      const label = String(rule?.label || '')
      if (label.toLowerCase().includes('stock location')) {
        return {
          id: 'a-owned',
          label: 'Assets by Ownership',
          field: 'assigned',
          value: 'assigned',
        }
      }
      return rule
    })
  if (sanitized.length === 0) return defaultConfig.assets
  return sanitized
}

function safeParse(raw: string | null): LeftPanelConfig {
  if (!raw) return defaultConfig
  try {
    const parsed = JSON.parse(raw)
    return {
      ticketsMyLists: normalizeTicketMyLists(Array.isArray(parsed?.ticketsMyLists) ? parsed.ticketsMyLists : defaultConfig.ticketsMyLists),
      users: Array.isArray(parsed?.users) ? parsed.users : defaultConfig.users,
      assets: normalizeAssetRules(Array.isArray(parsed?.assets) ? parsed.assets : defaultConfig.assets),
      suppliers: Array.isArray(parsed?.suppliers) ? parsed.suppliers : defaultConfig.suppliers,
    }
  } catch {
    return defaultConfig
  }
}

export function loadLeftPanelConfig(): LeftPanelConfig {
  if (typeof window === 'undefined') return defaultConfig
  return safeParse(window.localStorage.getItem(STORAGE_KEY))
}

export function saveLeftPanelConfig(next: LeftPanelConfig) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent('left-panel-config-updated'))
}

export function resetLeftPanelConfig() {
  saveLeftPanelConfig(defaultConfig)
}
