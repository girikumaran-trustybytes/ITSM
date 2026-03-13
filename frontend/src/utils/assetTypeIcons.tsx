import React from 'react'

export type AssetTypeIconSize = 'sm' | 'md' | 'lg'

const sizeMap: Record<AssetTypeIconSize, number> = {
  sm: 14,
  md: 22,
  lg: 30,
}

type IconInput = {
  label?: string
  icon?: string | null
  size?: AssetTypeIconSize | number
}

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase()

const resolveSize = (size?: AssetTypeIconSize | number) => {
  if (typeof size === 'number') return size
  if (size && sizeMap[size]) return sizeMap[size]
  return sizeMap.md
}

const iconKeyMatches = (key: string, ...tests: string[]) => {
  if (!key) return false
  return tests.some((test) => key.includes(test))
}

const IconServer = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="4" width="16" height="6" rx="1.5" />
    <rect x="4" y="14" width="16" height="6" rx="1.5" />
    <circle cx="8" cy="7" r="0.8" fill="currentColor" />
    <circle cx="8" cy="17" r="0.8" fill="currentColor" />
  </svg>
)

const IconLaptop = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="5" width="14" height="10" rx="1.5" />
    <path d="M3 19h18" />
  </svg>
)

const IconMobile = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="8" y="3" width="8" height="18" rx="2" />
    <circle cx="12" cy="17.5" r="0.8" fill="currentColor" />
  </svg>
)

const IconMonitor = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="4" y="5" width="16" height="11" rx="1.5" />
    <path d="M10 19h4" />
  </svg>
)

const IconPrinter = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="7" y="3" width="10" height="5" rx="1" />
    <rect x="5" y="9" width="14" height="8" rx="1.5" />
    <rect x="8" y="14" width="8" height="6" rx="1" />
  </svg>
)

const IconNetwork = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="6" cy="18" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <circle cx="12" cy="6" r="2.5" />
    <path d="M7.8 16l3-6" />
    <path d="M16.2 16l-3-6" />
    <path d="M8.5 18h7" />
  </svg>
)

const IconCloud = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M7 18h9a4 4 0 0 0 0-8 6 6 0 0 0-11-1 4 4 0 0 0 2 9z" />
  </svg>
)

const IconStorage = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <ellipse cx="12" cy="6" rx="7" ry="3" />
    <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
    <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
  </svg>
)

const IconSecurity = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />
    <path d="M9.5 12l2 2 3.5-3.5" />
  </svg>
)

const IconDocument = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M7 3h7l4 4v14H7z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6" />
  </svg>
)

const IconService = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="3.5" />
    <path d="M19.4 15a7.8 7.8 0 0 0 .1-6l-2.2.4a6 6 0 0 0-1.1-1.9l1.2-1.9a8.1 8.1 0 0 0-5-2l-.5 2.1a6.5 6.5 0 0 0-2.2.3l-1.3-1.7a8.1 8.1 0 0 0-3.7 3.6l1.7 1.2a6.4 6.4 0 0 0-.4 2.2L3.6 12a8.1 8.1 0 0 0 2 5l1.9-1.2a6.2 6.2 0 0 0 1.9 1.1l-.4 2.2a8.1 8.1 0 0 0 6 .1l-.4-2.2a6 6 0 0 0 1.9-1.1l2.1 1.3a8.1 8.1 0 0 0 1.8-3.6z" />
  </svg>
)

const IconBox = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <path d="M9 9h6M9 13h6" />
  </svg>
)

export const renderAssetTypeIcon = ({ label, icon, size }: IconInput) => {
  const sizeValue = resolveSize(size)
  const iconKey = normalize(icon)
  const labelKey = normalize(label)
  const key = iconKey || labelKey

  if (iconKeyMatches(key, 'server', 'database', 'vm', 'datacenter')) return <IconServer size={sizeValue} />
  if (iconKeyMatches(key, 'laptop', 'desktop', 'computer', 'workstation', 'hardware')) return <IconLaptop size={sizeValue} />
  if (iconKeyMatches(key, 'mobile', 'tablet', 'phone')) return <IconMobile size={sizeValue} />
  if (iconKeyMatches(key, 'monitor', 'display')) return <IconMonitor size={sizeValue} />
  if (iconKeyMatches(key, 'printer', 'scanner')) return <IconPrinter size={sizeValue} />
  if (iconKeyMatches(key, 'network', 'router', 'switch', 'firewall', 'access')) return <IconNetwork size={sizeValue} />
  if (iconKeyMatches(key, 'cloud', 'aws', 'azure', 'gcp', 'saas')) return <IconCloud size={sizeValue} />
  if (iconKeyMatches(key, 'storage', 'disk', 'backup', 'volume')) return <IconStorage size={sizeValue} />
  if (iconKeyMatches(key, 'security', 'key', 'vault', 'certificate')) return <IconSecurity size={sizeValue} />
  if (iconKeyMatches(key, 'document', 'file', 'contract')) return <IconDocument size={sizeValue} />
  if (iconKeyMatches(key, 'service', 'application', 'software', 'api')) return <IconService size={sizeValue} />

  return <IconBox size={sizeValue} />
}

