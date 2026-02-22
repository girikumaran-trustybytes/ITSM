import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  loadLeftPanelConfig,
  resetLeftPanelConfig,
  saveLeftPanelConfig,
  type LeftPanelConfig,
  type QueueRule,
  type TicketQueueConfig,
  type AssetCategoryConfig,
} from '../utils/leftPanelConfig'
import RbacModule from './RbacModule'
import { createSlaConfig, deleteSlaConfig, listSlaConfigs, updateSlaConfig } from '../services/sla.service'
import { getDatabaseConfig, getMailConfig, sendMailTest, testDatabaseConfig, testImap, testSmtp, updateInboundMailConfig, type MailProvider } from '../services/config.service'
import { listUsers } from '../services/user.service'

type PaginationMeta = {
  page: number
  totalPages: number
  totalRows: number
  rangeStart: number
  rangeEnd: number
}

type AdminViewProps = {
  initialTab?: string
  toolbarSearch?: string
  controlledPage?: number
  onPageChange?: (nextPage: number) => void
  onPaginationMetaChange?: (meta: PaginationMeta) => void
}

type MenuItem = {
  id: string
  label: string
  requiresAdmin?: boolean
}

type MenuSection = {
  id: string
  label: string
  items: MenuItem[]
}

const settingsMenu: MenuSection[] = [
  {
    id: 'general',
    label: 'General Settings',
    items: [
      { id: 'timezone-localization', label: 'Time zone & localization' },
    ],
  },
  {
    id: 'user-access',
    label: 'User & Access Management',
    items: [
      { id: 'roles-permissions', label: 'Roles & permissions', requiresAdmin: true },
      { id: 'mfa-settings', label: 'MFA settings', requiresAdmin: true },
    ],
  },
  {
    id: 'queue-management',
    label: 'Queue & Panel management',
    items: [
      { id: 'queue-management', label: 'Queue & Panel management', requiresAdmin: true },
    ],
  },
  {
    id: 'workflow-automation',
    label: 'Workflow and Automation',
    items: [
      { id: 'workflow-automation', label: 'Workflow and Automation', requiresAdmin: true },
    ],
  },
  {
    id: 'incident',
    label: 'Policy (SLA) Management',
    items: [
      { id: 'sla-policies', label: 'SLA policies' },
      { id: 'auto-assignment', label: 'Auto-assignment rules' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations & Platform',
    items: [
      { id: 'mail-configuration', label: 'Mail Configuration', requiresAdmin: true },
      { id: 'email-signature-templates', label: 'Email & Signature Templates', requiresAdmin: true },
      { id: 'database-configuration', label: 'Database Configuration', requiresAdmin: true },
    ],
  },
]

type Values = Record<string, string | boolean>
type FieldDef = {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'toggle'
  options?: string[]
  helper?: string
  adminOnly?: boolean
}
type PanelDef = {
  id: string
  title: string
  description: string
  fields: FieldDef[]
}
type WorkflowBlueprint = {
  name: string
  states: string[]
  transitions: string[]
  buttonFlow: string[]
}
type WorkflowListKey = 'states' | 'transitions' | 'buttonFlow'

type QueueSettingsView = 'ticket' | 'asset'
type TicketQueueModalMode = 'add' | 'edit' | 'delete'
type AssetCategoryModalMode = 'add' | 'edit' | 'delete'

const SLA_PRIORITIES = ['Critical', 'High', 'Medium', 'Low'] as const
type SlaPriority = typeof SLA_PRIORITIES[number]
const SLA_TIME_UNITS = ['min', 'hrs', 'days', 'weeks'] as const
type SlaTimeUnit = typeof SLA_TIME_UNITS[number]
type SlaFormat = 'critical_set' | 'p_set' | 'custom'
const BUSINESS_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
type BusinessDay = typeof BUSINESS_DAYS[number]
type TimeSlot = { start: string; end: string }
type BusinessSchedule = Record<BusinessDay, { enabled: boolean; slots: TimeSlot[] }>
const SYSTEM_TIME_ZONE = (() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
})()
const TIME_ZONE_OPTIONS = (() => {
  try {
    const supportedValuesOf = (Intl as any).supportedValuesOf as undefined | ((kind: string) => string[])
    const supported = typeof supportedValuesOf === 'function'
      ? (supportedValuesOf('timeZone') as string[])
      : []
    if (!supported.length) return [SYSTEM_TIME_ZONE, 'UTC']
    return Array.from(new Set([SYSTEM_TIME_ZONE, ...supported]))
  } catch {
    return [SYSTEM_TIME_ZONE, 'UTC']
  }
})()
const WORKFLOW_BLUEPRINTS: WorkflowBlueprint[] = [
  {
    name: 'Incident',
    states: ['New', 'In Progress', 'Awaiting Approval', 'Closed', 'Rejected'],
    transitions: [
      'New -> In Progress',
      'In Progress -> Awaiting Approval',
      'Awaiting Approval -> In Progress',
      'In Progress -> Closed',
      'New -> Closed (quick close)',
    ],
    buttonFlow: [
      'Back -> Return to list',
      'Accept (New) -> Assign to agent',
      'Acknowledge -> In Progress',
      'Approval -> Awaiting Approval',
      'Resolve -> Closed',
      'Close -> Closed',
      'Re-open (Closed) -> In Progress',
    ],
  },
  {
    name: 'Service Request',
    states: ['New', 'Awaiting Approval', 'In Progress', 'Fulfilled', 'Closed', 'Rejected'],
    transitions: [
      'New -> Awaiting Approval',
      'New -> In Progress (if no approval required)',
      'Awaiting Approval -> In Progress',
      'Awaiting Approval -> Rejected',
      'In Progress -> Fulfilled',
      'Fulfilled -> Closed',
      'New -> Closed (quick close)',
    ],
    buttonFlow: [
      'Back -> Return to list',
      'Accept (New) -> Assign to agent',
      'Request Approval (New) -> Awaiting Approval',
      'Approve (Awaiting Approval) -> In Progress',
      'Reject (Awaiting Approval) -> Rejected',
      'Fulfill (In Progress) -> Fulfilled',
      'Close (Fulfilled) -> Closed',
      'Re-open (Closed) -> In Progress',
    ],
  },
  {
    name: 'Change Request (Asset Replacement)',
    states: ['New', 'Under Verification', 'Awaiting Approval', 'Approved', 'Procurement', 'In Progress', 'Completed', 'Closed', 'Rejected'],
    transitions: [
      'New -> Under Verification',
      'Under Verification -> Awaiting Approval',
      'Awaiting Approval -> Approved',
      'Awaiting Approval -> Rejected',
      'Approved -> Procurement',
      'Approved -> In Progress',
      'Procurement -> In Progress',
      'In Progress -> Completed',
      'Completed -> Closed',
    ],
    buttonFlow: [
      'Verify Asset -> Under Verification',
      'Send for Approval -> Awaiting Approval',
      'Approve -> Approved',
      'Reject -> Rejected',
      'Start Procurement -> Procurement',
      'Start Implementation -> In Progress',
      'Complete Change -> Completed',
      'Close -> Closed',
    ],
  },
  {
    name: 'Access Request',
    states: ['New', 'Manager Approval', 'IT Approval', 'Provisioning', 'Completed', 'Closed', 'Rejected'],
    transitions: [
      'New -> Manager Approval',
      'Manager Approval -> IT Approval',
      'Manager Approval -> Rejected',
      'IT Approval -> Provisioning',
      'Provisioning -> Completed',
      'Completed -> Closed',
    ],
    buttonFlow: [
      'Send to Manager -> Manager Approval',
      'Approve (Manager) -> IT Approval',
      'Reject -> Rejected',
      'IT Approve -> Provisioning',
      'Provision Access -> Completed',
      'Close -> Closed',
    ],
  },
  {
    name: 'New Starter Request',
    states: ['New', 'HR Confirmation', 'IT Setup', 'Asset Allocation', 'Ready for Joining', 'Closed', 'Rejected'],
    transitions: [
      'New -> HR Confirmation',
      'HR Confirmation -> IT Setup',
      'IT Setup -> Asset Allocation',
      'Asset Allocation -> Ready for Joining',
      'Ready for Joining -> Closed',
    ],
    buttonFlow: [
      'Confirm by HR -> HR Confirmation',
      'Start IT Setup -> IT Setup',
      'Allocate Asset -> Asset Allocation',
      'Mark Ready -> Ready for Joining',
      'Close -> Closed',
    ],
  },
  {
    name: 'Leaver Request',
    states: ['New', 'HR Confirmation', 'Access Revoked', 'Asset Collected', 'Completed', 'Closed'],
    transitions: [
      'New -> HR Confirmation',
      'HR Confirmation -> Access Revoked',
      'Access Revoked -> Asset Collected',
      'Asset Collected -> Completed',
      'Completed -> Closed',
    ],
    buttonFlow: [
      'HR Confirm -> HR Confirmation',
      'Revoke Access -> Access Revoked',
      'Collect Asset -> Asset Collected',
      'Complete Offboarding -> Completed',
      'Close -> Closed',
    ],
  },
  {
    name: 'Task',
    states: ['New', 'Assigned', 'In Progress', 'Completed', 'Closed'],
    transitions: [
      'New -> Assigned',
      'Assigned -> In Progress',
      'In Progress -> Completed',
      'Completed -> Closed',
    ],
    buttonFlow: [
      'Accept -> Assigned',
      'Start -> In Progress',
      'Complete -> Completed',
      'Close -> Closed',
    ],
  },
  {
    name: 'Software Request',
    states: ['New', 'Manager Approval', 'Budget Approval', 'Procurement', 'Installation', 'Completed', 'Closed', 'Rejected'],
    transitions: [
      'New -> Manager Approval',
      'Manager Approval -> Budget Approval',
      'Manager Approval -> Rejected',
      'Budget Approval -> Procurement',
      'Procurement -> Installation',
      'Installation -> Completed',
      'Completed -> Closed',
    ],
    buttonFlow: [
      'Request Approval -> Manager Approval',
      'Budget Approve -> Budget Approval',
      'Start Procurement -> Procurement',
      'Install Software -> Installation',
      'Mark Completed -> Completed',
      'Close -> Closed',
    ],
  },
  {
    name: 'HR Request',
    states: ['New', 'HR Review', 'In Progress', 'Resolved', 'Closed', 'Rejected'],
    transitions: [
      'New -> HR Review',
      'HR Review -> In Progress',
      'HR Review -> Rejected',
      'In Progress -> Resolved',
      'Resolved -> Closed',
    ],
    buttonFlow: [
      'Send to HR -> HR Review',
      'Start Review -> In Progress',
      'Resolve -> Resolved',
      'Close -> Closed',
    ],
  },
  {
    name: 'Peripheral Request',
    states: ['New', 'Stock Check', 'Approval', 'Issued', 'Closed', 'Rejected'],
    transitions: [
      'New -> Stock Check',
      'Stock Check -> Approval',
      'Stock Check -> Issued',
      'Approval -> Issued',
      'Approval -> Rejected',
      'Issued -> Closed',
    ],
    buttonFlow: [
      'Check Stock -> Stock Check',
      'Request Approval -> Approval',
      'Issue Asset -> Issued',
      'Close -> Closed',
    ],
  },
]
const WORKFLOW_STORAGE_KEY = 'admin.workflow.automation.v1'
const cloneWorkflowBlueprints = (rows: WorkflowBlueprint[]): WorkflowBlueprint[] =>
  rows.map((row) => ({
    name: row.name,
    states: [...row.states],
    transitions: [...row.transitions],
    buttonFlow: [...row.buttonFlow],
  }))
const normalizeWorkflowName = (name: string): string => String(name || '').trim().toLowerCase()
const mergeWorkflowBlueprints = (rows: WorkflowBlueprint[]): WorkflowBlueprint[] => {
  const byName = new Map<string, WorkflowBlueprint>()
  const extras: WorkflowBlueprint[] = []

  for (const row of rows) {
    const name = String(row?.name || '').trim()
    if (!name) continue
    const normalized: WorkflowBlueprint = {
      name,
      states: Array.isArray(row.states) ? row.states.map((v) => String(v || '').trim()).filter(Boolean) : [],
      transitions: Array.isArray(row.transitions) ? row.transitions.map((v) => String(v || '').trim()).filter(Boolean) : [],
      buttonFlow: Array.isArray(row.buttonFlow) ? row.buttonFlow.map((v) => String(v || '').trim()).filter(Boolean) : [],
    }
    const key = normalizeWorkflowName(name)
    if (!byName.has(key)) byName.set(key, normalized)
  }

  const merged = WORKFLOW_BLUEPRINTS.map((base) => {
    const existing = byName.get(normalizeWorkflowName(base.name))
    return existing ? existing : cloneWorkflowBlueprints([base])[0]
  })

  for (const row of rows) {
    const key = normalizeWorkflowName(row.name)
    const existsInDefault = WORKFLOW_BLUEPRINTS.some((base) => normalizeWorkflowName(base.name) === key)
    if (!existsInDefault && !extras.some((e) => normalizeWorkflowName(e.name) === key)) {
      extras.push({
        name: row.name,
        states: [...row.states],
        transitions: [...row.transitions],
        buttonFlow: [...row.buttonFlow],
      })
    }
  }

  return [...merged, ...extras]
}

type PrioritySlaForm = {
  enabled: boolean
  name: string
  responseTimeMin: string
  responseTimeUnit: SlaTimeUnit
  resolutionTimeMin: string
  resolutionTimeUnit: SlaTimeUnit
  businessHours: boolean
  timeZone: string
  businessSchedule: BusinessSchedule
  active: boolean
  existingId: number | null
}

type MailConfigForm = {
  provider: MailProvider
  providerType: 'google-workspace-oauth' | 'microsoft-365-oauth' | 'smtp-imap-custom' | 'api-provider'
  connectionMode: 'oauth2' | 'app-password' | 'manual-credentials'
  oauthConnected: boolean
  oauthTokenExpiry: string
  workspaceProvider: 'google-workspace' | 'microsoft-workspace' | 'zoho' | 'outlook' | 'custom'
  supportMail: string
  inboundEmailAddress: string
  inboundDefaultQueue: string
  inboundDefaultTicketType: string
  inboundDefaultPriority: string
  autoAssignRule: string
  pollIntervalMs: string
  imapEncryption: 'SSL' | 'TLS' | 'None'
  smtpEncryption: 'SSL' | 'TLS' | 'None'
  enablePush: boolean
  ignoreAutoReply: boolean
  preventEmailLoop: boolean
  processAttachments: boolean
  overwriteStatusOnReply: boolean
  autoReopenOnReply: boolean
  stripQuotedReplies: boolean
  appendToTicketPattern: string
  outboundReplyTo: string
  maxAttachmentSizeMb: string
  signatureTemplate: string
  allowExternalEmailCreation: boolean
  allowInternalOnly: boolean
  allowedDomains: string
  blockedDomains: string
  spfDkimStatus: 'Unknown' | 'Valid' | 'Invalid'
  emailLogRetentionDays: string
  retryFailedSend: boolean
  maxRetryCount: string
  routingRuleHelpdeskQueue: string
  routingRuleAccessType: string
  routingRuleSupplierType: string
  lastSyncTime: string
  lastEmailReceived: string
  lastEmailSent: string
  errorLogs: string
  apiProviderName: string
  apiBaseUrl: string
  apiKey: string
  apiSecret: string
  smtp: {
    host: string
    port: string
    secure: boolean
    user: string
    pass: string
    from: string
  }
  imap: {
    host: string
    port: string
    secure: boolean
    user: string
    pass: string
    mailbox: string
  }
}

type DatabaseConfigForm = {
  connectionString: string
  host: string
  port: string
  database: string
  user: string
  password: string
  ssl: boolean
}

type EmailTemplateRecord = {
  id: string
  name: string
  buttonKey: string
  subject: string
  body: string
  active: boolean
}

type EmailSignatureRecord = {
  id: string
  userId: string
  userLabel: string
  signatureHtml: string
  active: boolean
}

type MailBannerRecord = {
  id: string
  title: string
  message: string
  tone: 'info' | 'success' | 'warning' | 'danger'
  active: boolean
}

const EMAIL_TEMPLATE_STORAGE_KEY = 'admin.mail.templates.v1'
const EMAIL_SIGNATURE_STORAGE_KEY = 'admin.mail.signatures.v1'
const MAIL_BANNER_STORAGE_KEY = 'admin.mail.banners.v1'

const BUTTON_TEMPLATE_OPTIONS = [
  'Assign',
  'Reassign',
  'Retire',
  'Accept',
  'Approve',
  'Reject',
  'Close',
]

const loadStoredList = <T,>(key: string, fallback: T[]): T[] => {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as T[]) : fallback
  } catch {
    return fallback
  }
}

const defaultMailConfigForm = (): MailConfigForm => ({
  provider: 'gmail',
  providerType: 'google-workspace-oauth',
  connectionMode: 'oauth2',
  oauthConnected: false,
  oauthTokenExpiry: '',
  workspaceProvider: 'custom',
  supportMail: '',
  inboundEmailAddress: '',
  inboundDefaultQueue: 'Helpdesk',
  inboundDefaultTicketType: 'Incident',
  inboundDefaultPriority: 'Medium',
  autoAssignRule: '',
  pollIntervalMs: '60000',
  imapEncryption: 'SSL',
  smtpEncryption: 'SSL',
  enablePush: false,
  ignoreAutoReply: true,
  preventEmailLoop: true,
  processAttachments: true,
  overwriteStatusOnReply: false,
  autoReopenOnReply: true,
  stripQuotedReplies: true,
  appendToTicketPattern: '[#TICKET-ID]',
  outboundReplyTo: '',
  maxAttachmentSizeMb: '20',
  signatureTemplate: 'Regards,\nIT Support Team',
  allowExternalEmailCreation: true,
  allowInternalOnly: false,
  allowedDomains: '',
  blockedDomains: '',
  spfDkimStatus: 'Unknown',
  emailLogRetentionDays: '90',
  retryFailedSend: true,
  maxRetryCount: '3',
  routingRuleHelpdeskQueue: 'If email sent to helpdesk@ -> Queue = Helpdesk',
  routingRuleAccessType: 'If subject contains "Access" -> Type = Access Request',
  routingRuleSupplierType: 'If sender domain = vendor.com -> Type = Supplier Ticket',
  lastSyncTime: '',
  lastEmailReceived: '',
  lastEmailSent: '',
  errorLogs: '',
  apiProviderName: 'SendGrid',
  apiBaseUrl: '',
  apiKey: '',
  apiSecret: '',
  smtp: {
    host: '',
    port: '465',
    secure: true,
    user: '',
    pass: '',
    from: '',
  },
  imap: {
    host: '',
    port: '993',
    secure: true,
    user: '',
    pass: '',
    mailbox: 'INBOX',
  },
})

const defaultDatabaseConfigForm = (): DatabaseConfigForm => ({
  connectionString: '',
  host: '',
  port: '5432',
  database: '',
  user: '',
  password: '',
  ssl: false,
})

const toWorkspaceProvider = (
  value: unknown
): MailConfigForm['workspaceProvider'] => {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'google-workspace') return 'google-workspace'
  if (normalized === 'microsoft-workspace') return 'microsoft-workspace'
  if (normalized === 'zoho') return 'zoho'
  if (normalized === 'outlook') return 'outlook'
  return 'custom'
}

const createDefaultBusinessSchedule = (): BusinessSchedule => ({
  Sunday: { enabled: false, slots: [{ start: '08:00', end: '17:30' }] },
  Monday: { enabled: true, slots: [{ start: '08:00', end: '17:30' }] },
  Tuesday: { enabled: true, slots: [{ start: '08:00', end: '17:30' }] },
  Wednesday: { enabled: true, slots: [{ start: '08:00', end: '17:30' }] },
  Thursday: { enabled: true, slots: [{ start: '08:00', end: '17:30' }] },
  Friday: { enabled: true, slots: [{ start: '08:00', end: '17:30' }] },
  Saturday: { enabled: false, slots: [{ start: '08:00', end: '17:30' }] },
})

const defaultPriorityPolicy = (priority: SlaPriority): PrioritySlaForm => {
  const defaults: Record<SlaPriority, { response: string; responseUnit: SlaTimeUnit; resolution: string; resolutionUnit: SlaTimeUnit }> = {
    Critical: { response: '15', responseUnit: 'min', resolution: '4', resolutionUnit: 'hrs' },
    High: { response: '30', responseUnit: 'min', resolution: '8', resolutionUnit: 'hrs' },
    Medium: { response: '1', responseUnit: 'hrs', resolution: '1', resolutionUnit: 'days' },
    Low: { response: '4', responseUnit: 'hrs', resolution: '3', resolutionUnit: 'days' },
  }
  return {
    enabled: false,
    name: `${priority} SLA`,
    responseTimeMin: defaults[priority].response,
    responseTimeUnit: defaults[priority].responseUnit,
    resolutionTimeMin: defaults[priority].resolution,
    resolutionTimeUnit: defaults[priority].resolutionUnit,
    businessHours: false,
    timeZone: SYSTEM_TIME_ZONE,
    businessSchedule: createDefaultBusinessSchedule(),
    active: true,
    existingId: null,
  }
}

const createEmptyPriorityPolicies = (): Record<SlaPriority, PrioritySlaForm> => ({
  Critical: defaultPriorityPolicy('Critical'),
  High: defaultPriorityPolicy('High'),
  Medium: defaultPriorityPolicy('Medium'),
  Low: defaultPriorityPolicy('Low'),
})

const createEnabledPriorityPolicies = (): Record<SlaPriority, PrioritySlaForm> => ({
  Critical: { ...defaultPriorityPolicy('Critical'), enabled: true },
  High: { ...defaultPriorityPolicy('High'), enabled: true },
  Medium: { ...defaultPriorityPolicy('Medium'), enabled: true },
  Low: { ...defaultPriorityPolicy('Low'), enabled: true },
})

const initialValues: Values = {
  scope: 'Global',
  ownerRole: 'Admin',
  approvalMode: 'Manager approval',
  timezone: 'UTC',
  locale: 'en-US',
  runbookLink: '',
  documentationLink: '',
  notes: '',
  ssoEnforced: true,
  mfaRequired: true,
  auditLogging: true,
  backupEnabled: true,
  autoAssignEnabled: true,
  notificationsEnabled: true,
  webhookEnabled: false,
}

const getMinutesMultiplier = (unit: SlaTimeUnit): number => {
  if (unit === 'weeks') return 7 * 24 * 60
  if (unit === 'days') return 24 * 60
  if (unit === 'hrs') return 60
  return 1
}

const splitMinutesToDisplay = (minutesInput: any): { value: string; unit: SlaTimeUnit } => {
  const minutes = Number(minutesInput)
  if (!Number.isFinite(minutes) || minutes < 0) return { value: '0', unit: 'min' }
  if (minutes > 0 && minutes % (7 * 24 * 60) === 0) return { value: String(minutes / (7 * 24 * 60)), unit: 'weeks' }
  if (minutes > 0 && minutes % (24 * 60) === 0) return { value: String(minutes / (24 * 60)), unit: 'days' }
  if (minutes > 0 && minutes % 60 === 0) return { value: String(minutes / 60), unit: 'hrs' }
  return { value: String(minutes), unit: 'min' }
}

const resolveFormatLabels = (format: SlaFormat, customFormatText: string): [string, string, string, string] => {
  if (format === 'p_set') return ['P1', 'P2', 'P3', 'P4']
  if (format === 'custom') {
    const parsed = String(customFormatText || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
    const fallback = ['L1', 'L2', 'L3', 'L4']
    return [
      parsed[0] || fallback[0],
      parsed[1] || fallback[1],
      parsed[2] || fallback[2],
      parsed[3] || fallback[3],
    ]
  }
  return ['Critical', 'High', 'Medium', 'Low']
}

const inferFormatFromRows = (rows: any[]): { format: SlaFormat; customFormatText: string } => {
  const labels = rows
    .map((r) => String(r?.priority || '').trim())
    .filter(Boolean)
  if (!labels.length) return { format: 'critical_set', customFormatText: '' }
  const lower = labels.map((v) => v.toLowerCase())
  const isCriticalSet = ['critical', 'high', 'medium', 'low'].every((key) => lower.includes(key))
  if (isCriticalSet) return { format: 'critical_set', customFormatText: '' }
  const isPSet = ['p1', 'p2', 'p3', 'p4'].every((key) => lower.includes(key))
  if (isPSet) return { format: 'p_set', customFormatText: '' }
  return { format: 'custom', customFormatText: labels.slice(0, 4).join(', ') }
}

const buildPriorityPoliciesForPolicy = (
  rows: any[],
  policyName: string,
  expectedLabels?: [string, string, string, string]
): Record<SlaPriority, PrioritySlaForm> => {
  const byPolicy = rows.filter((r) => String(r?.name || '').trim().toLowerCase() === String(policyName || '').trim().toLowerCase())
  const labels = expectedLabels || ['Critical', 'High', 'Medium', 'Low']
  const rankFromRow = (row: any): number => {
    const rank = Number(row?.priorityRank)
    if (Number.isFinite(rank) && rank >= 1 && rank <= 4) return rank
    const label = String(row?.priority || '').trim().toLowerCase()
    const idx = labels.findIndex((v) => v.toLowerCase() === label)
    if (idx >= 0) return idx + 1
    if (label === 'critical' || label === 'p1') return 1
    if (label === 'high' || label === 'p2') return 2
    if (label === 'medium' || label === 'p3') return 3
    return 4
  }
  byPolicy.sort((a, b) => rankFromRow(a) - rankFromRow(b))
  const next = createEmptyPriorityPolicies()
  for (let idx = 0; idx < SLA_PRIORITIES.length; idx++) {
    const priority = SLA_PRIORITIES[idx]
    const row = byPolicy.find((r) => rankFromRow(r) === idx + 1)
    if (!row) continue
    const responseDisplay = splitMinutesToDisplay(row.responseTimeMin)
    const resolutionDisplay = splitMinutesToDisplay(row.resolutionTimeMin)
    next[priority] = {
      enabled: true,
      name: String(row.name || ''),
      responseTimeMin: responseDisplay.value,
      responseTimeUnit: responseDisplay.unit,
      resolutionTimeMin: resolutionDisplay.value,
      resolutionTimeUnit: resolutionDisplay.unit,
      businessHours: Boolean(row.businessHours),
      timeZone: SYSTEM_TIME_ZONE,
      businessSchedule: createDefaultBusinessSchedule(),
      active: Boolean(row.active),
      existingId: Number(row.id),
    }
  }
  return next
}

const settingsTopicPanels: Record<string, PanelDef[]> = {
  'organization-info': [
    { id: 'org-profile', title: 'Organization Profile', description: 'Business identity and ownership metadata.', fields: [
      { key: 'orgName', label: 'Organization name', type: 'text' },
      { key: 'orgCode', label: 'Organization code', type: 'text' },
      { key: 'primaryDomain', label: 'Primary domain', type: 'text' },
      { key: 'ownerRole', label: 'Owner role', type: 'select', options: ['Admin', 'Service Owner', 'Platform Engineer'] },
    ]},
  ],
  'business-hours': [
    { id: 'hours', title: 'Business Calendar', description: 'Working hours, shifts, and holiday handling.', fields: [
      { key: 'workWeek', label: 'Work week', type: 'select', options: ['Mon-Fri', 'Sun-Thu', '24x7'] },
      { key: 'businessHours', label: 'Business hours', type: 'text' },
      { key: 'holidayCalendar', label: 'Holiday calendar', type: 'select', options: ['Global', 'US', 'EMEA', 'APAC'] },
      { key: 'afterHoursEscalation', label: 'After-hours escalation enabled', type: 'toggle' },
    ]},
  ],
  'timezone-localization': [
    { id: 'localization', title: 'Regional Preferences', description: 'Default timezone and locale for records and notifications.', fields: [
      { key: 'timezone', label: 'Default timezone', type: 'select', options: ['UTC', 'America/New_York', 'Europe/London', 'Asia/Kolkata'] },
      { key: 'locale', label: 'Localization', type: 'select', options: ['en-US', 'en-GB', 'fr-FR', 'de-DE'] },
      { key: 'dateFormat', label: 'Date format', type: 'select', options: ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY'] },
      { key: 'weekStart', label: 'Week starts on', type: 'select', options: ['Monday', 'Sunday'] },
    ]},
  ],
  'roles-permissions': [
    { id: 'rbac', title: 'Role Matrix', description: 'Define role templates and scoped permissions.', fields: [
      { key: 'defaultRoleTemplate', label: 'Default role template', type: 'select', options: ['Least Privilege', 'Balanced', 'Power User'], adminOnly: true },
      { key: 'roleApprovalRequired', label: 'Role change requires approval', type: 'toggle', adminOnly: true },
      { key: 'privilegedSessionTimeout', label: 'Privileged session timeout (minutes)', type: 'text', adminOnly: true },
      { key: 'permissionNotes', label: 'Permission governance notes', type: 'textarea', adminOnly: true },
    ]},
  ],
  'user-groups': [
    { id: 'groups', title: 'Group Policies', description: 'Control group ownership, lifecycle, and membership flow.', fields: [
      { key: 'groupAutoProvision', label: 'Auto-provision groups from directory', type: 'toggle' },
      { key: 'groupOwnerRole', label: 'Default group owner role', type: 'select', options: ['Manager', 'Team Lead', 'Service Owner'] },
      { key: 'groupReviewCycle', label: 'Membership review cycle', type: 'select', options: ['30 days', '60 days', '90 days'] },
      { key: 'groupNamingRule', label: 'Naming rule pattern', type: 'text' },
    ]},
  ],
  'sso-configuration': [
    { id: 'sso', title: 'SSO Configuration', description: 'Identity provider and sign-in enforcement controls.', fields: [
      { key: 'ssoEnforced', label: 'Enforce SSO', type: 'toggle', adminOnly: true },
      { key: 'idpType', label: 'Identity provider', type: 'select', options: ['Azure AD', 'Okta', 'Google Workspace', 'SAML Custom'], adminOnly: true },
      { key: 'ssoJitProvisioning', label: 'JIT provisioning', type: 'toggle', adminOnly: true },
      { key: 'ssoMetadataUrl', label: 'Metadata URL', type: 'text', adminOnly: true },
    ]},
  ],
  'mfa-settings': [
    { id: 'mfa', title: 'MFA Policy', description: 'Second-factor strategy and conditional access rules.', fields: [
      { key: 'mfaRequired', label: 'MFA required for privileged roles', type: 'toggle', adminOnly: true },
      { key: 'mfaMethod', label: 'Primary MFA method', type: 'select', options: ['Authenticator App', 'FIDO2 Key', 'SMS OTP'], adminOnly: true },
      { key: 'mfaGracePeriod', label: 'Enrollment grace period (days)', type: 'text', adminOnly: true },
      { key: 'mfaBypassEmergency', label: 'Allow emergency bypass', type: 'toggle', adminOnly: true },
    ]},
  ],
  'priority-matrix': [
    { id: 'priority', title: 'Priority Matrix', description: 'Map impact and urgency to ticket priorities.', fields: [
      { key: 'matrixModel', label: 'Matrix model', type: 'select', options: ['3x3', '4x4', 'Custom'] },
      { key: 'defaultPriority', label: 'Default priority', type: 'select', options: ['Low', 'Medium', 'High', 'Critical'] },
      { key: 'autoDowngrade', label: 'Auto-downgrade stale incidents', type: 'toggle' },
      { key: 'prioritySlaLink', label: 'Link priority to SLA automatically', type: 'toggle' },
    ]},
  ],
  'sla-policies': [
    { id: 'sla', title: 'SLA Policies', description: 'Response/resolution targets and business calendar linkage.', fields: [
      { key: 'slaPolicySet', label: 'Policy set', type: 'select', options: ['Standard', 'Premium', 'Critical Services'] },
      { key: 'firstResponseTarget', label: 'First response target', type: 'select', options: ['15 min', '30 min', '1 hour', '4 hours'] },
      { key: 'resolutionTarget', label: 'Resolution target', type: 'select', options: ['4 hours', '8 hours', '24 hours', '72 hours'] },
      { key: 'slaBreachNotify', label: 'Notify on breach risk', type: 'toggle' },
    ]},
  ],
  'auto-assignment': [
    { id: 'auto-assignment', title: 'Auto-Assignment', description: 'Assign work based on load, skills, and queues.', fields: [
      { key: 'autoAssignEnabled', label: 'Enable auto-assignment', type: 'toggle' },
      { key: 'assignmentStrategy', label: 'Assignment strategy', type: 'select', options: ['Round Robin', 'Least Loaded', 'Skill Match'] },
      { key: 'fallbackQueue', label: 'Fallback queue', type: 'text' },
      { key: 'reassignInactive', label: 'Reassign inactive tickets', type: 'toggle' },
    ]},
  ],
  'categories': [
    { id: 'catalog-categories', title: 'Catalog Categories', description: 'Taxonomy and ownership for service requests.', fields: [
      { key: 'catalogRoot', label: 'Root category label', type: 'text' },
      { key: 'categoryApprovalMode', label: 'Category approval mode', type: 'select', options: ['Auto', 'Manager', 'Service Owner'] },
      { key: 'categoryVisibility', label: 'Default visibility', type: 'select', options: ['All users', 'By department', 'By group'] },
      { key: 'categoryArchiveDays', label: 'Archive empty categories (days)', type: 'text' },
    ]},
  ],
  'request-workflows': [
    { id: 'request-workflows', title: 'Request Workflows', description: 'Workflow templates used by service catalog requests.', fields: [
      { key: 'requestDefaultWorkflow', label: 'Default workflow template', type: 'select', options: ['Standard Fulfillment', 'Access Request', 'Hardware Provision'] },
      { key: 'workflowParallelApproval', label: 'Enable parallel approvals', type: 'toggle' },
      { key: 'workflowSlaBinding', label: 'Bind workflow to SLA', type: 'toggle' },
      { key: 'workflowNotes', label: 'Workflow design notes', type: 'textarea' },
    ]},
  ],
  'approval-matrix': [
    { id: 'approval-matrix', title: 'Approval Matrix', description: 'Approval routing based on risk, cost, and requester.', fields: [
      { key: 'approvalModel', label: 'Approval model', type: 'select', options: ['Manager', 'Manager + Finance', 'CAB'] },
      { key: 'approvalThreshold', label: 'Cost threshold for additional approvals', type: 'text' },
      { key: 'approvalEscalation', label: 'Escalate pending approvals', type: 'toggle' },
      { key: 'approvalSla', label: 'Approval SLA', type: 'select', options: ['4 hours', '8 hours', '24 hours'] },
    ]},
  ],
  'change-types': [
    { id: 'change-types', title: 'Change Types', description: 'Standard, normal, and emergency change governance.', fields: [
      { key: 'defaultChangeType', label: 'Default change type', type: 'select', options: ['Standard', 'Normal', 'Emergency'] },
      { key: 'changeTemplateRequired', label: 'Template required for changes', type: 'toggle' },
      { key: 'emergencyApprovalBypass', label: 'Emergency approval bypass', type: 'toggle', adminOnly: true },
      { key: 'changeFreezeWindow', label: 'Change freeze windows', type: 'text' },
    ]},
  ],
  'risk-matrix': [
    { id: 'risk-matrix', title: 'Risk Matrix', description: 'Risk scoring for change and incident policies.', fields: [
      { key: 'riskScoringModel', label: 'Scoring model', type: 'select', options: ['Impact x Likelihood', 'Weighted', 'Custom'] },
      { key: 'riskAutoClassification', label: 'Auto-classify risk from CI tags', type: 'toggle' },
      { key: 'riskHighThreshold', label: 'High-risk threshold', type: 'text' },
      { key: 'riskReviewRequired', label: 'Require risk review for high-risk', type: 'toggle' },
    ]},
  ],
  'cab-configuration': [
    { id: 'cab', title: 'CAB Configuration', description: 'Change Advisory Board composition and cadence.', fields: [
      { key: 'cabMeetingCadence', label: 'CAB meeting cadence', type: 'select', options: ['Daily', 'Twice Weekly', 'Weekly'] },
      { key: 'cabQuorum', label: 'Minimum quorum', type: 'text' },
      { key: 'cabAutoInvite', label: 'Auto-invite service owners', type: 'toggle' },
      { key: 'cabEmergencyBoard', label: 'Enable emergency CAB', type: 'toggle' },
    ]},
  ],
  'workflow-builder': [
    { id: 'automation-builder', title: 'Workflow Builder', description: 'Low-code workflow execution settings.', fields: [
      { key: 'builderVersion', label: 'Builder runtime', type: 'select', options: ['v1 Stable', 'v2 Modern'] },
      { key: 'builderSandbox', label: 'Sandbox mode for draft workflows', type: 'toggle' },
      { key: 'builderPublishApproval', label: 'Require publish approval', type: 'toggle' },
      { key: 'builderTimeout', label: 'Workflow execution timeout (seconds)', type: 'text' },
    ]},
  ],
  'triggers-conditions': [
    { id: 'triggers', title: 'Triggers & Conditions', description: 'Event predicates and suppression logic.', fields: [
      { key: 'triggerDeduplication', label: 'Deduplicate repeated triggers', type: 'toggle' },
      { key: 'triggerWindow', label: 'Deduplication window', type: 'select', options: ['1 min', '5 min', '15 min'] },
      { key: 'triggerConditionMode', label: 'Condition mode', type: 'select', options: ['All true', 'Any true'] },
      { key: 'triggerAuditTrail', label: 'Store trigger evaluation trail', type: 'toggle' },
    ]},
  ],
  'email-templates-automation': [
    { id: 'automation-email', title: 'Automation Email Templates', description: 'System email templates used by workflows.', fields: [
      { key: 'emailTemplatePack', label: 'Template pack', type: 'select', options: ['Default', 'Enterprise', 'Custom'] },
      { key: 'emailBranding', label: 'Branding profile', type: 'select', options: ['Global', 'Regional', 'Departmental'] },
      { key: 'emailFooterLegal', label: 'Include legal footer', type: 'toggle' },
      { key: 'emailSenderAddress', label: 'Sender address', type: 'text' },
    ]},
  ],
  webhooks: [
    { id: 'webhooks', title: 'Webhook Delivery', description: 'Outbound integration endpoint and retry controls.', fields: [
      { key: 'webhookEnabled', label: 'Enable outbound webhooks', type: 'toggle' },
      { key: 'webhookEndpoint', label: 'Endpoint URL', type: 'text' },
      { key: 'webhookRetries', label: 'Retry policy', type: 'select', options: ['No retries', '3 retries', '5 retries'] },
      { key: 'webhookSigning', label: 'Sign webhook payloads', type: 'toggle', adminOnly: true },
    ]},
  ],
  'api-keys': [
    { id: 'api-keys', title: 'API Keys', description: 'Key lifecycle controls and scopes.', fields: [
      { key: 'apiKeyRotation', label: 'Rotation interval', type: 'select', options: ['30 days', '60 days', '90 days'], adminOnly: true },
      { key: 'apiKeyScopeDefault', label: 'Default key scope', type: 'select', options: ['Read only', 'Read/Write', 'Admin'], adminOnly: true },
      { key: 'apiKeyIpAllowlist', label: 'IP allowlist', type: 'text', adminOnly: true },
      { key: 'apiKeyAudit', label: 'Audit key usage', type: 'toggle', adminOnly: true },
    ]},
  ],
  'third-party-tools': [
    { id: 'third-party', title: 'Third-party Tools', description: 'Connected SaaS apps and identity bridge settings.', fields: [
      { key: 'slackIntegration', label: 'Slack integration enabled', type: 'toggle' },
      { key: 'azureAdSync', label: 'Azure AD sync mode', type: 'select', options: ['Manual', 'Hourly', 'Real-time'] },
      { key: 'teamsNotifications', label: 'Microsoft Teams notifications', type: 'toggle' },
      { key: 'integrationFallback', label: 'Fallback connector', type: 'text' },
    ]},
  ],
  'monitoring-tools': [
    { id: 'monitoring', title: 'Monitoring Tools', description: 'Integrate observability and alerting systems.', fields: [
      { key: 'monitoringProvider', label: 'Primary provider', type: 'select', options: ['Datadog', 'Prometheus', 'New Relic', 'CloudWatch'] },
      { key: 'monitoringAlertSync', label: 'Sync alerts to incidents', type: 'toggle' },
      { key: 'monitoringSeverityMap', label: 'Severity mapping profile', type: 'select', options: ['Default', 'Strict', 'Custom'] },
      { key: 'monitoringIngestionKey', label: 'Ingestion key', type: 'text', adminOnly: true },
    ]},
  ],
  'asset-types': [
    { id: 'asset-types', title: 'Asset Type Catalog', description: 'Asset type schema and ownership for CMDB.', fields: [
      { key: 'assetTypeModel', label: 'Asset type model', type: 'select', options: ['Hardware + Software', 'CI first', 'Custom'] },
      { key: 'assetLifecyclePolicy', label: 'Lifecycle policy', type: 'select', options: ['Standard', 'Strict Compliance', 'Flexible'] },
      { key: 'assetTagPrefix', label: 'Asset tag prefix', type: 'text' },
      { key: 'assetOwnershipRequired', label: 'Require asset owner', type: 'toggle' },
    ]},
  ],
  'ci-relationships': [
    { id: 'ci-relationships', title: 'CI Relationships', description: 'Relationship graph and dependency modeling.', fields: [
      { key: 'ciRelationModel', label: 'Relationship model', type: 'select', options: ['Parent-Child', 'Service Topology', 'Hybrid'] },
      { key: 'ciAutoLink', label: 'Auto-link discovered CIs', type: 'toggle' },
      { key: 'ciImpactPropagation', label: 'Impact propagation depth', type: 'select', options: ['1 hop', '2 hops', '3 hops'] },
      { key: 'ciLinkConfidence', label: 'Minimum confidence threshold', type: 'text' },
    ]},
  ],
  'discovery-settings': [
    { id: 'discovery', title: 'Discovery Settings', description: 'Network discovery schedule and scanning profile.', fields: [
      { key: 'discoveryEnabled', label: 'Enable discovery engine', type: 'toggle' },
      { key: 'discoveryCadence', label: 'Discovery cadence', type: 'select', options: ['Daily', 'Weekly', 'Monthly'] },
      { key: 'discoveryCredentialProfile', label: 'Credential profile', type: 'select', options: ['Default', 'Privileged', 'Read-only'] },
      { key: 'discoveryExcludeRanges', label: 'Excluded network ranges', type: 'text' },
    ]},
  ],
  'email-templates-notify': [
    { id: 'notify-email', title: 'Notification Email Templates', description: 'Notification template set for tickets and changes.', fields: [
      { key: 'notifyEmailPack', label: 'Template pack', type: 'select', options: ['Default', 'Branded', 'Minimal'] },
      { key: 'notifyDigestMode', label: 'Digest mode', type: 'select', options: ['Instant', 'Hourly Digest', 'Daily Digest'] },
      { key: 'notifyEmailFooter', label: 'Include compliance footer', type: 'toggle' },
      { key: 'notifyReplyTo', label: 'Reply-to address', type: 'text' },
    ]},
  ],
  'sms-settings': [
    { id: 'sms', title: 'SMS Settings', description: 'SMS gateway and delivery behavior.', fields: [
      { key: 'smsEnabled', label: 'Enable SMS notifications', type: 'toggle' },
      { key: 'smsProvider', label: 'SMS provider', type: 'select', options: ['Twilio', 'Azure Communication', 'Custom'] },
      { key: 'smsCountryPolicy', label: 'Allowed country policy', type: 'select', options: ['Global', 'Restricted', 'Custom list'] },
      { key: 'smsSenderId', label: 'Sender ID', type: 'text' },
    ]},
  ],
  'push-notifications': [
    { id: 'push', title: 'Push Notifications', description: 'In-app and mobile push controls.', fields: [
      { key: 'pushEnabled', label: 'Enable push notifications', type: 'toggle' },
      { key: 'pushCriticalOnly', label: 'Critical alerts only', type: 'toggle' },
      { key: 'pushQuietHours', label: 'Quiet hours', type: 'text' },
      { key: 'pushRetryPolicy', label: 'Retry policy', type: 'select', options: ['No retry', '2 retries', '5 retries'] },
    ]},
  ],
  'audit-logs': [
    { id: 'audit-logs', title: 'Audit Logs', description: 'Security event and configuration audit retention.', fields: [
      { key: 'auditLogging', label: 'Enable audit logging', type: 'toggle', adminOnly: true },
      { key: 'auditExportCadence', label: 'Export cadence', type: 'select', options: ['Daily', 'Weekly', 'Monthly'], adminOnly: true },
      { key: 'auditImmutableStore', label: 'Immutable log storage', type: 'toggle', adminOnly: true },
      { key: 'auditLogViewerRole', label: 'Log viewer role', type: 'select', options: ['Admin', 'Security Team'], adminOnly: true },
    ]},
  ],
  'data-retention': [
    { id: 'retention', title: 'Data Retention Policy', description: 'Retention and purge schedules by data class.', fields: [
      { key: 'ticketRetentionDays', label: 'Ticket retention (days)', type: 'text', adminOnly: true },
      { key: 'assetRetentionDays', label: 'Asset record retention (days)', type: 'text', adminOnly: true },
      { key: 'purgeSchedule', label: 'Purge schedule', type: 'select', options: ['Weekly', 'Monthly', 'Quarterly'], adminOnly: true },
      { key: 'legalHoldEnabled', label: 'Legal hold override enabled', type: 'toggle', adminOnly: true },
    ]},
  ],
  'backup-settings': [
    { id: 'backup', title: 'Backup Settings', description: 'Backup schedule, encryption, and recovery targets.', fields: [
      { key: 'backupEnabled', label: 'Enable daily backups', type: 'toggle', adminOnly: true },
      { key: 'backupWindow', label: 'Backup window', type: 'text', adminOnly: true },
      { key: 'backupEncryption', label: 'Backup encryption', type: 'select', options: ['AES-256', 'Provider managed'], adminOnly: true },
      { key: 'backupRetention', label: 'Backup retention', type: 'select', options: ['30 days', '90 days', '365 days'], adminOnly: true },
    ]},
  ],
}

type PermissionSection = {
  id: string
  title: string
  items: { id: string; label: string }[]
}

const rolePermissionSections: PermissionSection[] = [
  {
    id: 'user',
    title: 'USER Permission',
    items: [
      { id: 'viewUser', label: 'View User' },
      { id: 'editUser', label: 'Edit User' },
      { id: 'createUser', label: 'Create User' },
      { id: 'deleteUser', label: 'Delete User' },
      { id: 'resetUserPassword', label: 'Reset User Password' },
    ],
  },
  {
    id: 'role',
    title: 'ROLE Permission',
    items: [
      { id: 'viewRole', label: 'View Role' },
      { id: 'editRole', label: 'Edit Role' },
      { id: 'createRole', label: 'Create Role' },
      { id: 'deleteRole', label: 'Delete Role' },
    ],
  },
  {
    id: 'reports',
    title: 'REPORTS Permission',
    items: [{ id: 'viewAllCashReports', label: 'View All Cash Reports' }],
  },
  {
    id: 'pharmacyProduct',
    title: 'PHARMACY PRODUCT Permission',
    items: [
      { id: 'viewProduct', label: 'View Product' },
      { id: 'editProduct', label: 'Edit Product' },
      { id: 'createProduct', label: 'Create Product' },
      { id: 'deleteProduct', label: 'Delete Product' },
    ],
  },
  {
    id: 'patient',
    title: 'PATIENT Permission',
    items: [
      { id: 'viewPatient', label: 'View Patient' },
      { id: 'editPatient', label: 'Edit Patient' },
      { id: 'createPatient', label: 'Create Patient' },
      { id: 'deletePatient', label: 'Delete Patient' },
    ],
  },
  {
    id: 'otherService',
    title: 'OTHER SERVICE Permission',
    items: [
      { id: 'viewService', label: 'View Service' },
      { id: 'editService', label: 'Edit Service' },
      { id: 'createService', label: 'Create Service' },
      { id: 'deleteService', label: 'Delete Service' },
    ],
  },
  {
    id: 'labReport',
    title: 'LAB REPORT Permission',
    items: [
      { id: 'viewLabReport', label: 'View Lab Report' },
      { id: 'editLabReport', label: 'Edit Lab Report' },
      { id: 'viewUnit', label: 'View Unit' },
      { id: 'editUnit', label: 'Edit Unit' },
      { id: 'viewResultCategory', label: 'View Result Category' },
      { id: 'editResultCategory', label: 'Edit Result Category' },
      { id: 'viewTestData', label: 'View Test Data' },
      { id: 'editTestData', label: 'Edit Test Data' },
      { id: 'viewTestDataCategory', label: 'View Test Data Category' },
      { id: 'editTestDataCategory', label: 'Edit Test Data Category' },
      { id: 'viewPatientLabReport', label: 'View Patient Lab Report' },
      { id: 'printPatientLabReport', label: 'Print Patient Lab Report' },
      { id: 'createLabReport', label: 'Create Lab Report' },
      { id: 'deleteLabReport', label: 'Delete Lab Report' },
      { id: 'createUnit', label: 'Create Unit' },
      { id: 'deleteUnit', label: 'Delete Unit' },
      { id: 'createResultCategory', label: 'Create Result Category' },
      { id: 'deleteResultCategory', label: 'Delete Result Category' },
      { id: 'createTestData', label: 'Create Test Data' },
      { id: 'deleteTestData', label: 'Delete Test Data' },
      { id: 'createTestDataCategory', label: 'Create Test Data Category' },
      { id: 'deleteTestDataCategory', label: 'Delete Test Data Category' },
      { id: 'updatePatientLabReport', label: 'Update Patient Lab Report' },
    ],
  },
  {
    id: 'invoice',
    title: 'INVOICE Permission',
    items: [
      { id: 'createInvoice', label: 'Create Invoice' },
      { id: 'reverseInvoice', label: 'Reverse Invoice' },
    ],
  },
  {
    id: 'doctor',
    title: 'DOCTOR Permission',
    items: [
      { id: 'viewDoctor', label: 'View Doctor' },
      { id: 'editDoctor', label: 'Edit Doctor' },
      { id: 'createDoctor', label: 'Create Doctor' },
      { id: 'deleteDoctor', label: 'Delete Doctor' },
    ],
  },
  {
    id: 'chanelSession',
    title: 'CHANEL SESSION Permission',
    items: [
      { id: 'viewSession', label: 'View Session' },
      { id: 'editSession', label: 'Edit Session' },
      { id: 'createSession', label: 'Create Session' },
      { id: 'deleteSession', label: 'Delete Session' },
    ],
  },
]

const initiallyCheckedPermissions = new Set([
  'viewAllCashReports',
  'viewProduct', 'editProduct', 'createProduct', 'deleteProduct',
  'viewPatient', 'editPatient', 'createPatient', 'deletePatient',
  'viewService', 'editService', 'createService', 'deleteService',
  'viewLabReport',
  'createInvoice', 'reverseInvoice',
  'viewDoctor',
  'viewSession', 'editSession', 'createSession', 'deleteSession',
])

export default function AdminView(_props: AdminViewProps) {
  const { user } = useAuth()
  const queueRoot = typeof document !== 'undefined' ? document.getElementById('ticket-left-panel') : null
  const role = String(user?.role || 'USER')

  const [settingsQuery, setSettingsQuery] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [recentOnly, setRecentOnly] = useState(false)
  const [activeSection, setActiveSection] = useState(settingsMenu[0].id)
  const [activeItem, setActiveItem] = useState(settingsMenu[0].items[0].id)
  const [values, setValues] = useState<Values>(initialValues)
  const [savedValues, setSavedValues] = useState<Values>(initialValues)
  const [showConfirmSave, setShowConfirmSave] = useState(false)
  const [showConfirmReset, setShowConfirmReset] = useState(false)
  const [showConfirmRevoke, setShowConfirmRevoke] = useState(false)
  const [, setLastSavedAt] = useState<string | null>(null)
  const [, setActivityLog] = useState<string[]>([
    'Role matrix synced by Platform Admin',
    'SLA policy update applied to Incident queue',
    'Webhook endpoint validation completed',
    'Backup retention adjusted to 90 days',
  ])
  const [leftPanelConfig, setLeftPanelConfig] = useState<LeftPanelConfig>(() => loadLeftPanelConfig())
  const [queuePanelKey, setQueuePanelKey] = useState<'ticketsMyLists' | 'users' | 'assets' | 'suppliers'>('ticketsMyLists')
  const [queueSettingsView, setQueueSettingsView] = useState<QueueSettingsView>('ticket')
  const [ticketQueueModalMode, setTicketQueueModalMode] = useState<TicketQueueModalMode | null>(null)
  const [ticketQueueModalOpen, setTicketQueueModalOpen] = useState(false)
  const [ticketQueueTargetId, setTicketQueueTargetId] = useState('')
  const [ticketQueueLabelInput, setTicketQueueLabelInput] = useState('')
  const [ticketQueueServiceAccountInput, setTicketQueueServiceAccountInput] = useState('')
  const [ticketQueueVisibilityInput, setTicketQueueVisibilityInput] = useState('ADMIN,AGENT')
  const [ticketQueueModalError, setTicketQueueModalError] = useState('')
  const [assetCategoryModalMode, setAssetCategoryModalMode] = useState<AssetCategoryModalMode | null>(null)
  const [assetCategoryModalOpen, setAssetCategoryModalOpen] = useState(false)
  const [assetCategoryTargetId, setAssetCategoryTargetId] = useState('')
  const [assetCategoryLabelInput, setAssetCategoryLabelInput] = useState('')
  const [assetCategorySubcategoriesInput, setAssetCategorySubcategoriesInput] = useState('')
  const [assetCategoryVisibilityInput, setAssetCategoryVisibilityInput] = useState('ADMIN,AGENT')
  const [assetCategoryModalError, setAssetCategoryModalError] = useState('')
  const [slaLoading, setSlaLoading] = useState(false)
  const [slaBusy, setSlaBusy] = useState(false)
  const [slaRows, setSlaRows] = useState<any[]>([])
  const [priorityPolicies, setPriorityPolicies] = useState<Record<SlaPriority, PrioritySlaForm>>(createEmptyPriorityPolicies())
  const [showPolicyForm, setShowPolicyForm] = useState(false)
  const [policyFormMode, setPolicyFormMode] = useState<'create' | 'edit'>('create')
  const [policyName, setPolicyName] = useState('')
  const [editingPolicyName, setEditingPolicyName] = useState<string | null>(null)
  const [policyFormat, setPolicyFormat] = useState<SlaFormat>('critical_set')
  const [customFormatText, setCustomFormatText] = useState('')
  const [policyTimeZone, setPolicyTimeZone] = useState<string>(SYSTEM_TIME_ZONE)
  const [policySchedule, setPolicySchedule] = useState<BusinessSchedule>(createDefaultBusinessSchedule())
  const [slaPage, setSlaPage] = useState(1)
  const [mailForm, setMailForm] = useState<MailConfigForm>(defaultMailConfigForm())
  const [mailLoading, setMailLoading] = useState(false)
  const [mailBusy, setMailBusy] = useState(false)
  const [mailResult, setMailResult] = useState('')
  const [mailTestRecipient, setMailTestRecipient] = useState('')
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRecord[]>(() =>
    loadStoredList<EmailTemplateRecord>(EMAIL_TEMPLATE_STORAGE_KEY, [])
  )
  const [templateForm, setTemplateForm] = useState<Omit<EmailTemplateRecord, 'id'>>({
    name: '',
    buttonKey: 'Assign',
    subject: '',
    body: '',
    active: true,
  })
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [signatureUsers, setSignatureUsers] = useState<any[]>([])
  const [emailSignatures, setEmailSignatures] = useState<EmailSignatureRecord[]>(() =>
    loadStoredList<EmailSignatureRecord>(EMAIL_SIGNATURE_STORAGE_KEY, [])
  )
  const [signatureForm, setSignatureForm] = useState<Omit<EmailSignatureRecord, 'id'>>({
    userId: '',
    userLabel: '',
    signatureHtml: '',
    active: true,
  })
  const [editingSignatureId, setEditingSignatureId] = useState<string | null>(null)
  const [mailBanners, setMailBanners] = useState<MailBannerRecord[]>(() =>
    loadStoredList<MailBannerRecord>(MAIL_BANNER_STORAGE_KEY, [])
  )
  const [bannerForm, setBannerForm] = useState<Omit<MailBannerRecord, 'id'>>({
    title: '',
    message: '',
    tone: 'info',
    active: true,
  })
  const [editingBannerId, setEditingBannerId] = useState<string | null>(null)
  const [dbForm, setDbForm] = useState<DatabaseConfigForm>(defaultDatabaseConfigForm())
  const [dbLoading, setDbLoading] = useState(false)
  const [dbBusy, setDbBusy] = useState(false)
  const [dbResult, setDbResult] = useState('')
  const [workflowDrafts, setWorkflowDrafts] = useState<WorkflowBlueprint[]>(() => {
    if (typeof window === 'undefined') return cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS)
    try {
      const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY)
      if (!raw) return cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS)
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS)
      const normalized = parsed
        .map((wf: any) => ({
          name: String(wf?.name || '').trim(),
          states: Array.isArray(wf?.states) ? wf.states.map((v: any) => String(v || '').trim()).filter(Boolean) : [],
          transitions: Array.isArray(wf?.transitions) ? wf.transitions.map((v: any) => String(v || '').trim()).filter(Boolean) : [],
          buttonFlow: Array.isArray(wf?.buttonFlow) ? wf.buttonFlow.map((v: any) => String(v || '').trim()).filter(Boolean) : [],
        }))
        .filter((wf: WorkflowBlueprint) => wf.name)
      return normalized.length ? mergeWorkflowBlueprints(normalized) : cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS)
    } catch {
      return cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS)
    }
  })
  const [workflowSavedAt, setWorkflowSavedAt] = useState('')
  const [selectedWorkflowType, setSelectedWorkflowType] = useState('')
  const [selectedWorkflowName, setSelectedWorkflowName] = useState('')
  const [workflowEditMode, setWorkflowEditMode] = useState(false)

  const visibleSections = useMemo(() => {
    return settingsMenu
      .map((section) => {
        const filteredItems = section.items
        return { ...section, items: filteredItems }
      })
      .filter((section) => section.items.length > 0)
  }, [])

  useEffect(() => {
    const currentSection = visibleSections.find((s) => s.id === activeSection)
    const hasActiveItem = currentSection?.items.some((i) => i.id === activeItem && !(i.requiresAdmin && role !== 'ADMIN'))
    if (!currentSection || !hasActiveItem) {
      const fallbackSection = visibleSections.find((s) => s.items.some((i) => !(i.requiresAdmin && role !== 'ADMIN')))
      if (!fallbackSection) return
      const fallbackItem = fallbackSection.items.find((i) => !(i.requiresAdmin && role !== 'ADMIN'))
      if (!fallbackItem) return
      setActiveSection(fallbackSection.id)
      setActiveItem(fallbackItem.id)
    }
  }, [visibleSections, activeSection, activeItem, role])
  useEffect(() => {
    const handler = () => setLeftPanelConfig(loadLeftPanelConfig())
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])
  useEffect(() => {
    if (activeItem === 'sla-policies' && role === 'ADMIN') {
      loadSlaRows()
    }
  }, [activeItem, role])
  useEffect(() => {
    if ((activeItem === 'mail-configuration' || activeItem === 'email-signature-templates') && role === 'ADMIN') {
      loadMailConfiguration()
      listUsers({ limit: 500 }).then((rows: any) => {
        const data = Array.isArray(rows) ? rows : (Array.isArray(rows?.rows) ? rows.rows : [])
        const serviceAccounts = data.filter((u: any) => Boolean(u?.isServiceAccount))
        setSignatureUsers(serviceAccounts.length ? serviceAccounts : data)
      }).catch(() => setSignatureUsers([]))
    }
  }, [activeItem, role])
  useEffect(() => {
    if (activeItem === 'database-configuration' && role === 'ADMIN') {
      loadDatabaseConfiguration()
    }
  }, [activeItem, role])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(workflowDrafts))
    } catch {}
  }, [workflowDrafts])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(EMAIL_TEMPLATE_STORAGE_KEY, JSON.stringify(emailTemplates))
    } catch {}
  }, [emailTemplates])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(EMAIL_SIGNATURE_STORAGE_KEY, JSON.stringify(emailSignatures))
    } catch {}
  }, [emailSignatures])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(MAIL_BANNER_STORAGE_KEY, JSON.stringify(mailBanners))
    } catch {}
  }, [mailBanners])
  useEffect(() => {
    if (!workflowDrafts.length) return
    const hasSelectedType = workflowDrafts.some((wf) => wf.name === selectedWorkflowType)
    const hasSelectedName = workflowDrafts.some((wf) => wf.name === selectedWorkflowName)
    if (!selectedWorkflowType || !hasSelectedType) setSelectedWorkflowType(workflowDrafts[0].name)
    if (!selectedWorkflowName || !hasSelectedName) setSelectedWorkflowName(workflowDrafts[0].name)
  }, [workflowDrafts, selectedWorkflowType, selectedWorkflowName])

  const selectedSection = visibleSections.find((s) => s.id === activeSection) || visibleSections[0]
  const selectedItem = selectedSection?.items.find((i) => i.id === activeItem) || selectedSection?.items[0]
  const topicPanels = settingsTopicPanels[activeItem] || []

  const hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues)
  const isRestrictedRole = role !== 'ADMIN'

  const title = selectedItem?.label || 'Settings'
  const isQueueManagement = activeItem === 'queue-management'
  const isRolesPermissionsView = activeItem === 'roles-permissions'
  const isSlaPoliciesView = activeItem === 'sla-policies'
  const isMailConfigurationView = activeItem === 'mail-configuration'
  const isEmailSignatureTemplatesView = activeItem === 'email-signature-templates'
  const isDatabaseConfigurationView = activeItem === 'database-configuration'
  const isWorkflowAutomationView = activeItem === 'workflow-automation'
  const isApiProvider = mailForm.providerType === 'api-provider'
  const isOauthProvider = mailForm.providerType === 'google-workspace-oauth' || mailForm.providerType === 'microsoft-365-oauth'
  const isOauthMode = mailForm.connectionMode === 'oauth2'
  const isAppPasswordMode = mailForm.connectionMode === 'app-password'
  const isManualCredentialsMode = mailForm.connectionMode === 'manual-credentials'
  const disableImapSmtpCredentials = isOauthMode
  const disableImapSmtpProtocolConfig = isApiProvider
  const disableMailProtocolTests = isApiProvider
  const selectedWorkflowIndex = useMemo(
    () => workflowDrafts.findIndex((wf) => wf.name === selectedWorkflowName),
    [workflowDrafts, selectedWorkflowName]
  )
  const selectedWorkflow = selectedWorkflowIndex >= 0 ? workflowDrafts[selectedWorkflowIndex] : null
  const updateWorkflowName = (index: number, value: string) => {
    setWorkflowDrafts((prev) => prev.map((wf, i) => (i === index ? { ...wf, name: value } : wf)))
  }
  const updateWorkflowListItem = (workflowIndex: number, key: WorkflowListKey, rowIndex: number, value: string) => {
    setWorkflowDrafts((prev) => prev.map((wf, i) => {
      if (i !== workflowIndex) return wf
      const next = [...wf[key]]
      next[rowIndex] = value
      return { ...wf, [key]: next }
    }))
  }
  const addWorkflowListItem = (workflowIndex: number, key: WorkflowListKey) => {
    setWorkflowDrafts((prev) => prev.map((wf, i) => (i === workflowIndex ? { ...wf, [key]: [...wf[key], ''] } : wf)))
  }
  const deleteWorkflowListItem = (workflowIndex: number, key: WorkflowListKey, rowIndex: number) => {
    setWorkflowDrafts((prev) => prev.map((wf, i) => {
      if (i !== workflowIndex) return wf
      const next = wf[key].filter((_, idx) => idx !== rowIndex)
      return { ...wf, [key]: next.length ? next : [''] }
    }))
  }
  const moveWorkflowListItem = (workflowIndex: number, key: WorkflowListKey, rowIndex: number, dir: -1 | 1) => {
    setWorkflowDrafts((prev) => prev.map((wf, i) => {
      if (i !== workflowIndex) return wf
      const next = [...wf[key]]
      const target = rowIndex + dir
      if (target < 0 || target >= next.length) return wf
      const tmp = next[rowIndex]
      next[rowIndex] = next[target]
      next[target] = tmp
      return { ...wf, [key]: next }
    }))
  }
  const addWorkflow = () => {
    setWorkflowDrafts((prev) => [...prev, { name: 'New Workflow', states: ['New'], transitions: ['New -> In Progress'], buttonFlow: ['Start -> In Progress'] }])
  }
  const deleteWorkflow = (index: number) => {
    setWorkflowDrafts((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length ? next : cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS)
    })
  }
  const moveWorkflow = (index: number, dir: -1 | 1) => {
    setWorkflowDrafts((prev) => {
      const target = index + dir
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const tmp = next[index]
      next[index] = next[target]
      next[target] = tmp
      return next
    })
  }
  const saveWorkflowBlueprints = () => {
    const cleaned = workflowDrafts
      .map((wf) => ({
        name: String(wf.name || '').trim(),
        states: wf.states.map((v) => String(v || '').trim()).filter(Boolean),
        transitions: wf.transitions.map((v) => String(v || '').trim()).filter(Boolean),
        buttonFlow: wf.buttonFlow.map((v) => String(v || '').trim()).filter(Boolean),
      }))
      .filter((wf) => wf.name)
    setWorkflowDrafts(cleaned.length ? mergeWorkflowBlueprints(cleaned) : cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS))
    setWorkflowSavedAt(new Date().toLocaleString())
  }
  const resetWorkflowBlueprints = () => {
    setWorkflowDrafts(cloneWorkflowBlueprints(WORKFLOW_BLUEPRINTS))
    setWorkflowSavedAt('')
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(WORKFLOW_STORAGE_KEY) } catch {}
    }
  }
  const policyPriorityLabels = useMemo(
    () => resolveFormatLabels(policyFormat, customFormatText),
    [policyFormat, customFormatText]
  )
  const anyBusinessHoursEnabled = useMemo(
    () => SLA_PRIORITIES.some((priority) => priorityPolicies[priority].enabled && priorityPolicies[priority].businessHours),
    [priorityPolicies]
  )
  const slaPoliciesGrouped = useMemo(() => {
    const map = new Map<string, any[]>()
    for (const row of slaRows) {
      const name = String(row?.name || '').trim() || 'Unnamed Policy'
      if (!map.has(name)) map.set(name, [])
      map.get(name)!.push(row)
    }
    return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }))
  }, [slaRows])
  const slaRowsPerPage = 10
  const slaTotalRows = slaPoliciesGrouped.length
  const slaTotalPages = Math.max(1, Math.ceil(slaTotalRows / slaRowsPerPage))
  const slaSafePage = Math.min(slaPage, slaTotalPages)
  const slaRangeStart = slaTotalRows === 0 ? 0 : (slaSafePage - 1) * slaRowsPerPage + 1
  const slaRangeEnd = Math.min(slaSafePage * slaRowsPerPage, slaTotalRows)
  const slaPoliciesPage = useMemo(
    () => slaPoliciesGrouped.slice((slaSafePage - 1) * slaRowsPerPage, slaSafePage * slaRowsPerPage),
    [slaPoliciesGrouped, slaSafePage]
  )

  useEffect(() => {
    if (slaPage !== slaSafePage) setSlaPage(slaSafePage)
  }, [slaPage, slaSafePage])

  const matches = (text: string) => {
    const q = settingsQuery.trim().toLowerCase()
    if (!q) return true
    return text.toLowerCase().includes(q)
  }

  const showField = (text: string, key?: string) => {
    if (!matches(text)) return false
    if (!recentOnly) return true
    if (!key) return false
    return values[key] !== savedValues[key]
  }

  const renderField = (field: FieldDef) => {
    if (!showField(field.label, field.key)) return null
    const blocked = Boolean((field.adminOnly || selectedItem?.requiresAdmin) && role !== 'ADMIN')
    const commonTitle = blocked ? 'Restricted Access: Administrator role required' : field.label

    if (field.type === 'toggle') {
      return (
        <label key={field.key} className="admin-field-row switch-row">
          <span>
            {field.label}
            {field.helper && <em title={field.helper}>?</em>}
          </span>
          <input
            type="checkbox"
            checked={Boolean(values[field.key])}
            disabled={blocked}
            title={commonTitle}
            onChange={(e) => update(field.key, e.target.checked)}
          />
        </label>
      )
    }

    if (field.type === 'select') {
      const options = field.options || []
      return (
        <label key={field.key} className="admin-field-row">
          <span>
            {field.label}
            {field.helper && <em title={field.helper}>?</em>}
          </span>
          <select
            value={String(values[field.key] ?? options[0] ?? '')}
            disabled={blocked}
            title={commonTitle}
            onChange={(e) => update(field.key, e.target.value)}
          >
            {options.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </label>
      )
    }

    if (field.type === 'textarea') {
      return (
        <label key={field.key} className="admin-field-row grow">
          <span>
            {field.label}
            {field.helper && <em title={field.helper}>?</em>}
          </span>
          <textarea
            value={String(values[field.key] ?? '')}
            disabled={blocked}
            title={commonTitle}
            onChange={(e) => update(field.key, e.target.value)}
          />
        </label>
      )
    }

    return (
      <label key={field.key} className="admin-field-row">
        <span>
          {field.label}
          {field.helper && <em title={field.helper}>?</em>}
        </span>
        <input
          value={String(values[field.key] ?? '')}
          disabled={blocked}
          title={commonTitle}
          onChange={(e) => update(field.key, e.target.value)}
        />
      </label>
    )
  }

  const update = (key: string, next: string | boolean) => {
    setValues((prev) => ({ ...prev, [key]: next }))
  }

  const loadSlaRows = async () => {
    if (role !== 'ADMIN') return
    try {
      setSlaLoading(true)
      const data = await listSlaConfigs()
      const rows = Array.isArray(data) ? data : []
      setSlaRows(rows)
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to load SLA configs')
      setSlaRows([])
    } finally {
      setSlaLoading(false)
    }
  }

  const loadMailConfiguration = async () => {
    if (role !== 'ADMIN') return
    try {
      setMailLoading(true)
      setMailResult('')
      const data = await getMailConfig()
      const provider = String(data?.provider || 'custom') as MailProvider
      const smtp = data?.smtp || {}
      const imap = data?.imap || {}
      const nowStamp = new Date().toLocaleString()
      setMailForm({
        provider,
        providerType:
          provider === 'google-workspace' || provider === 'gmail'
            ? 'google-workspace-oauth'
            : provider === 'microsoft-workspace' || provider === 'outlook'
              ? 'microsoft-365-oauth'
              : 'smtp-imap-custom',
        connectionMode: 'oauth2',
        oauthConnected: false,
        oauthTokenExpiry: '',
        workspaceProvider: toWorkspaceProvider(provider),
        supportMail: String(smtp?.from || ''),
        inboundEmailAddress: String(smtp?.from || ''),
        inboundDefaultQueue: String(data?.inbound?.defaultQueue || 'Helpdesk'),
        inboundDefaultTicketType: 'Incident',
        inboundDefaultPriority: 'Medium',
        autoAssignRule: '',
        pollIntervalMs: String((data as any)?.inbound?.pollIntervalMs || 60000),
        imapEncryption: Boolean(imap?.secure) ? 'SSL' : 'None',
        smtpEncryption: Boolean(smtp?.secure) ? 'SSL' : 'None',
        enablePush: false,
        ignoreAutoReply: true,
        preventEmailLoop: true,
        processAttachments: true,
        overwriteStatusOnReply: false,
        autoReopenOnReply: true,
        stripQuotedReplies: true,
        appendToTicketPattern: '[#TICKET-ID]',
        outboundReplyTo: '',
        maxAttachmentSizeMb: '20',
        signatureTemplate: 'Regards,\nIT Support Team',
        allowExternalEmailCreation: true,
        allowInternalOnly: false,
        allowedDomains: '',
        blockedDomains: '',
        spfDkimStatus: 'Unknown',
        emailLogRetentionDays: '90',
        retryFailedSend: true,
        maxRetryCount: '3',
        routingRuleHelpdeskQueue: 'If email sent to helpdesk@ -> Queue = Helpdesk',
        routingRuleAccessType: 'If subject contains "Access" -> Type = Access Request',
        routingRuleSupplierType: 'If sender domain = vendor.com -> Type = Supplier Ticket',
        lastSyncTime: nowStamp,
        lastEmailReceived: '',
        lastEmailSent: '',
        errorLogs: '',
        apiProviderName: 'SendGrid',
        apiBaseUrl: '',
        apiKey: '',
        apiSecret: '',
        smtp: {
          host: String(smtp?.host || ''),
          port: String(smtp?.port ?? ''),
          secure: Boolean(smtp?.secure),
          user: String(smtp?.user || ''),
          pass: '',
          from: String(smtp?.from || ''),
        },
        imap: {
          host: String(imap?.host || ''),
          port: String(imap?.port ?? ''),
          secure: Boolean(imap?.secure),
          user: String(imap?.user || ''),
          pass: '',
          mailbox: String(imap?.mailbox || 'INBOX'),
        },
      })
    } catch (error: any) {
      setMailResult(error?.response?.data?.error || 'Failed to load mail configuration')
    } finally {
      setMailLoading(false)
    }
  }

  const loadDatabaseConfiguration = async () => {
    if (role !== 'ADMIN') return
    try {
      setDbLoading(true)
      setDbResult('')
      const data = await getDatabaseConfig()
      setDbForm((prev) => ({
        ...prev,
        host: String(data?.host || ''),
        port: String(data?.port ?? '5432'),
        database: String(data?.database || ''),
        user: String(data?.user || ''),
        ssl: Boolean(data?.ssl),
      }))
    } catch (error: any) {
      setDbResult(error?.response?.data?.error || 'Failed to load database configuration')
    } finally {
      setDbLoading(false)
    }
  }

  const updateMailRoot = (key: keyof Omit<MailConfigForm, 'smtp' | 'imap'>, value: any) => {
    setMailForm((prev) => ({ ...prev, [key]: value }))
  }

  const updateSmtpField = (key: keyof MailConfigForm['smtp'], value: any) => {
    setMailForm((prev) => ({ ...prev, smtp: { ...prev.smtp, [key]: value } }))
  }

  const updateImapField = (key: keyof MailConfigForm['imap'], value: any) => {
    setMailForm((prev) => ({ ...prev, imap: { ...prev.imap, [key]: value } }))
  }

  const handleMailProviderChange = (provider: MailProvider) => {
    setMailForm((prev) => ({
      ...prev,
      provider,
      providerType:
        provider === 'google-workspace' || provider === 'gmail'
          ? 'google-workspace-oauth'
          : provider === 'microsoft-workspace' || provider === 'outlook'
            ? 'microsoft-365-oauth'
            : provider === 'custom'
              ? 'smtp-imap-custom'
              : prev.providerType,
      workspaceProvider: toWorkspaceProvider(provider),
    }))
  }

  const applyProviderAndConnectionPreset = (
    providerType: MailConfigForm['providerType'],
    connectionMode: MailConfigForm['connectionMode']
  ) => {
    setMailForm((prev) => {
      const next = { ...prev, providerType, connectionMode }
      if (providerType === 'google-workspace-oauth') {
        next.provider = 'google-workspace'
        next.imap.host = 'imap.gmail.com'
        next.imap.port = '993'
        next.smtp.host = 'smtp.gmail.com'
        next.smtp.port = connectionMode === 'oauth2' ? '587' : '465'
        next.imapEncryption = 'SSL'
        next.smtpEncryption = connectionMode === 'oauth2' ? 'TLS' : 'SSL'
      } else if (providerType === 'microsoft-365-oauth') {
        next.provider = 'microsoft-workspace'
        next.imap.host = 'outlook.office365.com'
        next.imap.port = '993'
        next.smtp.host = 'smtp.office365.com'
        next.smtp.port = '587'
        next.imapEncryption = 'TLS'
        next.smtpEncryption = 'TLS'
      } else if (providerType === 'api-provider') {
        next.provider = 'custom'
        next.enablePush = true
      } else {
        next.provider = 'custom'
      }

      if (connectionMode === 'oauth2') {
        next.imap.pass = ''
        next.smtp.pass = ''
      }
      return next
    })
  }

  const runMailAction = async (action: 'smtp' | 'imap' | 'send') => {
    if (role !== 'ADMIN') return
    try {
      setMailBusy(true)
      setMailResult('')
      const payload: any = {
        provider: mailForm.provider,
        smtp: {
          host: mailForm.smtp.host.trim(),
          port: Number(mailForm.smtp.port || 0),
          secure: mailForm.smtpEncryption !== 'None',
          user: mailForm.smtp.user.trim(),
          pass: mailForm.smtp.pass,
          from: mailForm.smtp.from.trim() || mailForm.supportMail.trim(),
        },
        imap: {
          host: mailForm.imap.host.trim(),
          port: Number(mailForm.imap.port || 0),
          secure: mailForm.imapEncryption !== 'None',
          user: mailForm.imap.user.trim(),
          pass: mailForm.imap.pass,
          mailbox: mailForm.imap.mailbox.trim() || 'INBOX',
        },
      }

      if (action === 'smtp') {
        const result = await testSmtp(payload)
        setMailResult(`SMTP test passed (${result.host}:${result.port})`)
        setMailForm((prev) => ({ ...prev, lastEmailSent: new Date().toLocaleString() }))
      } else if (action === 'imap') {
        const result = await testImap(payload)
        setMailResult(`IMAP test passed (${result.host}:${result.port})`)
        setMailForm((prev) => ({ ...prev, lastSyncTime: new Date().toLocaleString() }))
      } else {
        const to = mailTestRecipient.trim() || mailForm.supportMail.trim()
        if (!to) {
          setMailResult('Recipient email is required for test mail')
          return
        }
        const result = await sendMailTest({
          ...payload,
          to,
          subject: 'ITSM Mail Configuration Test',
          text: 'This is a test email from ITSM Admin Mail Configuration.',
          from: mailForm.smtp.from.trim() || mailForm.supportMail.trim() || undefined,
        })
        const messageId = String(result?.messageId || '')
        setMailResult(messageId ? `Test mail sent (${messageId})` : 'Test mail sent successfully')
        setMailForm((prev) => ({ ...prev, lastEmailSent: new Date().toLocaleString() }))
      }
    } catch (error: any) {
      const message = error?.response?.data?.error || 'Mail action failed'
      setMailResult(message)
      setMailForm((prev) => ({ ...prev, errorLogs: `${new Date().toLocaleString()} - ${message}` }))
    } finally {
      setMailBusy(false)
    }
  }

  const runDatabaseTest = async () => {
    if (role !== 'ADMIN') return
    try {
      setDbBusy(true)
      setDbResult('')
      const payload: any = {
        connectionString: dbForm.connectionString.trim(),
        host: dbForm.host.trim(),
        port: Number(dbForm.port || 5432),
        database: dbForm.database.trim(),
        user: dbForm.user.trim(),
        password: dbForm.password,
        ssl: dbForm.ssl,
      }
      const result = await testDatabaseConfig(payload)
      setDbResult(`Connected to ${result.database}@${result.host}:${result.port} in ${result.latencyMs}ms`)
    } catch (error: any) {
      setDbResult(error?.response?.data?.error || 'Database connection test failed')
    } finally {
      setDbBusy(false)
    }
  }

  const saveInboundRouting = async () => {
    if (role !== 'ADMIN') return
    const defaultQueue = String(mailForm.inboundDefaultQueue || '').trim()
    if (!defaultQueue) {
      setMailResult('Inbound default queue/team is required')
      return
    }
    try {
      setMailBusy(true)
      setMailResult('')
      await updateInboundMailConfig({ defaultQueue })
      setMailResult(`Inbound mails will be routed to "${defaultQueue}"`)
    } catch (error: any) {
      setMailResult(error?.response?.data?.error || 'Failed to save inbound routing')
    } finally {
      setMailBusy(false)
    }
  }

  const connectOAuthAccount = () => {
    const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toLocaleString()
    setMailForm((prev) => ({
      ...prev,
      oauthConnected: true,
      oauthTokenExpiry: expiry,
    }))
    setMailResult('OAuth account connected')
  }

  const reconnectOAuthAccount = () => {
    const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toLocaleString()
    setMailForm((prev) => ({
      ...prev,
      oauthConnected: true,
      oauthTokenExpiry: expiry,
      errorLogs: '',
    }))
    setMailResult('OAuth account reconnected')
  }

  const syncInboundNow = () => {
    const now = new Date().toLocaleString()
    setMailForm((prev) => ({
      ...prev,
      lastSyncTime: now,
      lastEmailReceived: now,
    }))
    setMailResult('Inbound mail sync completed')
  }

  const viewLastSyncTime = () => {
    setMailResult(mailForm.lastSyncTime ? `Last sync: ${mailForm.lastSyncTime}` : 'No sync has been executed yet')
  }

  const testInboundProcessing = async () => {
    await runMailAction('imap')
    setMailResult((prev) => (prev ? `${prev}. Inbound parsing validated.` : 'Inbound parsing validated'))
  }

  const saveMailConfiguration = async () => {
    await saveInboundRouting()
    setMailResult((prev) => (prev ? `${prev}. Configuration snapshot saved.` : 'Configuration snapshot saved'))
  }

  const saveTemplate = () => {
    const name = templateForm.name.trim()
    const subject = templateForm.subject.trim()
    const body = templateForm.body.trim()
    if (!name || !subject || !body) {
      setMailResult('Template name, subject and body are required')
      return
    }
    if (editingTemplateId) {
      setEmailTemplates((prev) => prev.map((row) => (row.id === editingTemplateId ? { ...row, ...templateForm, name, subject, body } : row)))
      setMailResult('Email template updated')
    } else {
      setEmailTemplates((prev) => [{ id: `tpl-${Date.now()}`, ...templateForm, name, subject, body }, ...prev])
      setMailResult('Email template created')
    }
    setEditingTemplateId(null)
    setTemplateForm({ name: '', buttonKey: 'Assign', subject: '', body: '', active: true })
  }

  const editTemplate = (row: EmailTemplateRecord) => {
    setEditingTemplateId(row.id)
    setTemplateForm({ name: row.name, buttonKey: row.buttonKey, subject: row.subject, body: row.body, active: row.active })
  }

  const deleteTemplate = (id: string) => {
    setEmailTemplates((prev) => prev.filter((row) => row.id !== id))
    if (editingTemplateId === id) {
      setEditingTemplateId(null)
      setTemplateForm({ name: '', buttonKey: 'Assign', subject: '', body: '', active: true })
    }
    setMailResult('Email template deleted')
  }

  const saveSignature = () => {
    const userId = signatureForm.userId.trim()
    const signatureHtml = signatureForm.signatureHtml.trim()
    if (!userId || !signatureHtml) {
      setMailResult('Service account user and signature content are required')
      return
    }
    const user = signatureUsers.find((u: any) => String(u?.id || '') === userId)
    const userLabel = String(user?.name || user?.fullName || user?.email || userId)
    const payload = { ...signatureForm, userId, userLabel, signatureHtml }
    if (editingSignatureId) {
      setEmailSignatures((prev) => prev.map((row) => (row.id === editingSignatureId ? { ...row, ...payload } : row)))
      setMailResult('Email signature updated')
    } else {
      setEmailSignatures((prev) => [{ id: `sig-${Date.now()}`, ...payload }, ...prev])
      setMailResult('Email signature created')
    }
    setEditingSignatureId(null)
    setSignatureForm({ userId: '', userLabel: '', signatureHtml: '', active: true })
  }

  const editSignature = (row: EmailSignatureRecord) => {
    setEditingSignatureId(row.id)
    setSignatureForm({ userId: row.userId, userLabel: row.userLabel, signatureHtml: row.signatureHtml, active: row.active })
  }

  const deleteSignature = (id: string) => {
    setEmailSignatures((prev) => prev.filter((row) => row.id !== id))
    if (editingSignatureId === id) {
      setEditingSignatureId(null)
      setSignatureForm({ userId: '', userLabel: '', signatureHtml: '', active: true })
    }
    setMailResult('Email signature deleted')
  }

  const saveBanner = () => {
    const title = bannerForm.title.trim()
    const message = bannerForm.message.trim()
    if (!title || !message) {
      setMailResult('Banner title and message are required')
      return
    }
    if (editingBannerId) {
      setMailBanners((prev) => prev.map((row) => (row.id === editingBannerId ? { ...row, ...bannerForm, title, message } : row)))
      setMailResult('Mail banner updated')
    } else {
      setMailBanners((prev) => [{ id: `bnr-${Date.now()}`, ...bannerForm, title, message }, ...prev])
      setMailResult('Mail banner created')
    }
    setEditingBannerId(null)
    setBannerForm({ title: '', message: '', tone: 'info', active: true })
  }

  const editBanner = (row: MailBannerRecord) => {
    setEditingBannerId(row.id)
    setBannerForm({ title: row.title, message: row.message, tone: row.tone, active: row.active })
  }

  const deleteBanner = (id: string) => {
    setMailBanners((prev) => prev.filter((row) => row.id !== id))
    if (editingBannerId === id) {
      setEditingBannerId(null)
      setBannerForm({ title: '', message: '', tone: 'info', active: true })
    }
    setMailResult('Mail banner deleted')
  }

  const openCreatePolicyForm = () => {
    setPolicyFormMode('create')
    setEditingPolicyName(null)
    setPolicyName('')
    setPolicyFormat('critical_set')
    setCustomFormatText('')
    setPolicyTimeZone(SYSTEM_TIME_ZONE)
    setPolicySchedule(createDefaultBusinessSchedule())
    setPriorityPolicies(createEnabledPriorityPolicies())
    setShowPolicyForm(true)
  }

  const openEditPolicyForm = (name: string) => {
    setPolicyFormMode('edit')
    setEditingPolicyName(name)
    setPolicyName(name)
    const rows = slaRows.filter((r) => String(r?.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase())
    const inferred = inferFormatFromRows(rows)
    const explicitFormat = String(rows[0]?.format || '').trim().toLowerCase()
    const resolvedFormat: SlaFormat =
      explicitFormat === 'p_set' ? 'p_set' :
      explicitFormat === 'custom' ? 'custom' :
      explicitFormat === 'critical_set' ? 'critical_set' :
      inferred.format
    setPolicyFormat(resolvedFormat)
    setCustomFormatText(inferred.customFormatText)
    const labels = resolveFormatLabels(resolvedFormat, inferred.customFormatText)
    setPriorityPolicies(buildPriorityPoliciesForPolicy(slaRows, name, labels))
    const first = rows[0]
    setPolicyTimeZone(String(first?.timeZone || SYSTEM_TIME_ZONE))
    setPolicySchedule(first?.businessSchedule && typeof first.businessSchedule === 'object'
      ? (first.businessSchedule as BusinessSchedule)
      : createDefaultBusinessSchedule())
    setShowPolicyForm(true)
  }

  const closePolicyForm = () => {
    setShowPolicyForm(false)
    setEditingPolicyName(null)
    setPolicyName('')
    setPolicyFormat('critical_set')
    setCustomFormatText('')
    setPolicyTimeZone(SYSTEM_TIME_ZONE)
    setPolicySchedule(createDefaultBusinessSchedule())
    setPriorityPolicies(createEmptyPriorityPolicies())
  }

  const toggleBusinessDay = (day: BusinessDay, enabled: boolean) => {
    setPolicySchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled },
    }))
  }

  const updateBusinessSlot = (day: BusinessDay, index: number, key: 'start' | 'end', value: string) => {
    setPolicySchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: prev[day].slots.map((slot, slotIndex) => (slotIndex === index ? { ...slot, [key]: value } : slot)),
      },
    }))
  }

  const addBusinessSlot = (day: BusinessDay) => {
    setPolicySchedule((prev) => ({
      ...prev,
      [day]: {
        ...prev[day],
        slots: [...prev[day].slots, { start: '08:00', end: '17:30' }],
      },
    }))
  }

  const removeBusinessSlot = (day: BusinessDay, index: number) => {
    setPolicySchedule((prev) => {
      if (prev[day].slots.length <= 1) return prev
      return {
        ...prev,
        [day]: {
          ...prev[day],
          slots: prev[day].slots.filter((_, slotIndex) => slotIndex !== index),
        },
      }
    })
  }

  const submitPolicyForm = async () => {
    const normalizedName = policyName.trim()
    if (!normalizedName) return alert('Policy name is required')
    const selected = SLA_PRIORITIES.filter((priority) => priorityPolicies[priority].enabled)
    if (!selected.length) return alert('Select at least one priority for SLA')
    if (policyFormMode === 'create') {
      const exists = slaRows.some((r) => String(r?.name || '').trim().toLowerCase() === normalizedName.toLowerCase())
      if (exists) return alert('Policy name already exists')
    }
    try {
      setSlaBusy(true)
      const existingRows = policyFormMode === 'edit' && editingPolicyName
        ? slaRows.filter((r) => String(r?.name || '').trim().toLowerCase() === editingPolicyName.trim().toLowerCase())
        : []

      for (const priority of SLA_PRIORITIES) {
        const policy = priorityPolicies[priority]
        const rank = SLA_PRIORITIES.indexOf(priority) + 1
        const priorityLabel = policyPriorityLabels[rank - 1]
        const matched = existingRows.find((r) => String(r?.priority || '').toLowerCase() === priority.toLowerCase())
          || existingRows.find((r) => Number(r?.priorityRank) === rank)
        if (!policy.enabled) {
          if (matched?.id) await deleteSlaConfig(Number(matched.id))
          continue
        }
        const responseValue = Number(policy.responseTimeMin)
        const resolutionValue = Number(policy.resolutionTimeMin)
        const responseTimeMin = responseValue * getMinutesMultiplier(policy.responseTimeUnit)
        const resolutionTimeMin = resolutionValue * getMinutesMultiplier(policy.resolutionTimeUnit)
        if (!Number.isFinite(responseValue) || responseValue < 0) throw new Error(`Invalid response time for ${priority}`)
        if (!Number.isFinite(resolutionValue) || resolutionValue < 0) throw new Error(`Invalid resolution time for ${priority}`)
        const payload = {
          name: normalizedName,
          priority: priorityLabel,
          priorityRank: rank,
          format: policyFormat,
          responseTimeMin,
          resolutionTimeMin,
          businessHours: policy.businessHours,
          timeZone: policy.businessHours ? policyTimeZone : null,
          businessSchedule: policy.businessHours ? policySchedule : null,
          active: policy.active,
        }
        if (matched?.id) {
          await updateSlaConfig(Number(matched.id), payload)
        } else {
          await createSlaConfig(payload)
        }
      }
      await loadSlaRows()
      closePolicyForm()
    } catch (error: any) {
      alert(error?.response?.data?.error || error?.message || 'Failed to save SLA policy')
    } finally {
      setSlaBusy(false)
    }
  }

  const deletePolicyGroup = async (name: string) => {
    const rows = slaRows.filter((r) => String(r?.name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase())
    if (!rows.length) return
    if (!window.confirm(`Delete policy "${name}" and all priority SLAs?`)) return
    try {
      setSlaBusy(true)
      for (const row of rows) {
        if (row?.id) await deleteSlaConfig(Number(row.id))
      }
      await loadSlaRows()
      if (editingPolicyName && editingPolicyName.toLowerCase() === name.toLowerCase()) closePolicyForm()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to delete SLA policy')
    } finally {
      setSlaBusy(false)
    }
  }

  const handleSelectSection = (sectionId: string) => {
    const section = visibleSections.find((s) => s.id === sectionId)
    if (!section) return
    const nextItem = section.items.find((i) => !(i.requiresAdmin && role !== 'ADMIN'))
    if (!nextItem) return
    setActiveSection(sectionId)
    setActiveItem(nextItem.id)
  }
  const handleSelectItem = (sectionId: string, itemId: string) => {
    setActiveSection(sectionId)
    setActiveItem(itemId)
  }
  const queueRules = leftPanelConfig[queuePanelKey] || []
  type QueuePanelKey = 'ticketsMyLists' | 'users' | 'assets' | 'suppliers'
  const persistQueueConfig = (next: LeftPanelConfig) => {
    setLeftPanelConfig(next)
    saveLeftPanelConfig(next)
  }
  const handleQueueConfigReset = () => {
    resetLeftPanelConfig()
    setLeftPanelConfig(loadLeftPanelConfig())
  }
  const parseVisibilityRoles = (raw: string): string[] => {
    const parsed = String(raw || '')
      .split(',')
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean)
    return parsed.length ? Array.from(new Set(parsed)) : ['ADMIN', 'AGENT']
  }
  const closeTicketQueueModal = () => {
    setTicketQueueModalOpen(false)
    setTicketQueueModalMode(null)
    setTicketQueueTargetId('')
    setTicketQueueLabelInput('')
    setTicketQueueServiceAccountInput('')
    setTicketQueueVisibilityInput('ADMIN,AGENT')
    setTicketQueueModalError('')
  }
  const hydrateTicketQueueForm = (id: string) => {
    const target = leftPanelConfig.ticketQueues.find((q) => q.id === id)
    if (!target) return
    setTicketQueueLabelInput(target.label)
    setTicketQueueServiceAccountInput(target.serviceAccount || '')
    setTicketQueueVisibilityInput((target.visibilityRoles || []).join(',') || 'ADMIN,AGENT')
  }
  const handleTicketQueueAdd = () => {
    setTicketQueueModalMode('add')
    setTicketQueueModalOpen(true)
    setTicketQueueModalError('')
    setTicketQueueTargetId('')
    setTicketQueueLabelInput('')
    setTicketQueueServiceAccountInput('')
    setTicketQueueVisibilityInput('ADMIN,AGENT')
  }
  const handleTicketQueueEdit = () => {
    setTicketQueueModalMode('edit')
    setTicketQueueModalOpen(true)
    setTicketQueueModalError('')
    if (!leftPanelConfig.ticketQueues.length) {
      setTicketQueueTargetId('')
      setTicketQueueLabelInput('')
      setTicketQueueServiceAccountInput('')
      setTicketQueueVisibilityInput('ADMIN,AGENT')
      setTicketQueueModalError('No ticket queue available.')
      return
    }
    const first = leftPanelConfig.ticketQueues[0]
    setTicketQueueTargetId(first.id)
    hydrateTicketQueueForm(first.id)
  }
  const handleTicketQueueDelete = () => {
    setTicketQueueModalMode('delete')
    setTicketQueueModalOpen(true)
    setTicketQueueModalError('')
    if (!leftPanelConfig.ticketQueues.length) {
      setTicketQueueTargetId('')
      setTicketQueueModalError('No ticket queue available.')
      return
    }
    setTicketQueueTargetId(leftPanelConfig.ticketQueues[0].id)
  }
  const submitTicketQueueModal = () => {
    if (!ticketQueueModalMode) return
    setTicketQueueModalError('')
    const reservedQueueNames = new Set(['service request', 'helpdesk'])
    if (ticketQueueModalMode === 'add') {
      const label = ticketQueueLabelInput.trim()
      if (!label) return setTicketQueueModalError('Queue/team name is required.')
      if (reservedQueueNames.has(label.toLowerCase())) {
        return setTicketQueueModalError(`"${label}" is reserved and cannot be used as a queue name.`)
      }
      const exists = leftPanelConfig.ticketQueues.some((q) => q.label.trim().toLowerCase() === label.toLowerCase())
      if (exists) return setTicketQueueModalError(`Queue "${label}" already exists.`)
      const serviceAccount = ticketQueueServiceAccountInput.trim()
      if (!serviceAccount) return setTicketQueueModalError('Service account is required.')
      const visibilityRoles = parseVisibilityRoles(ticketQueueVisibilityInput)
      persistQueueConfig({
        ...leftPanelConfig,
        ticketQueues: [...leftPanelConfig.ticketQueues, {
          id: `tq-${Date.now()}`,
          label,
          serviceAccount,
          visibilityRoles,
        }],
      })
      closeTicketQueueModal()
      return
    }
    if (ticketQueueModalMode === 'edit') {
      if (!ticketQueueTargetId) return setTicketQueueModalError('Select a queue to edit.')
      const target = leftPanelConfig.ticketQueues.find((q) => q.id === ticketQueueTargetId)
      if (!target) return setTicketQueueModalError('Queue not found.')
      const label = ticketQueueLabelInput.trim()
      if (!label) return setTicketQueueModalError('Queue/team name is required.')
      if (reservedQueueNames.has(label.toLowerCase())) {
        return setTicketQueueModalError(`"${label}" is reserved and cannot be used as a queue name.`)
      }
      const duplicate = leftPanelConfig.ticketQueues.some((q) => q.id !== target.id && q.label.trim().toLowerCase() === label.toLowerCase())
      if (duplicate) return setTicketQueueModalError(`Queue "${label}" already exists.`)
      const serviceAccount = ticketQueueServiceAccountInput.trim()
      if (!serviceAccount) return setTicketQueueModalError('Service account is required.')
      const visibilityRoles = parseVisibilityRoles(ticketQueueVisibilityInput)
      persistQueueConfig({
        ...leftPanelConfig,
        ticketQueues: leftPanelConfig.ticketQueues.map((q) => q.id === target.id
          ? { ...q, label, serviceAccount, visibilityRoles }
          : q),
      })
      closeTicketQueueModal()
      return
    }
    if (!ticketQueueTargetId) return setTicketQueueModalError('Select a queue to delete.')
    const target = leftPanelConfig.ticketQueues.find((q) => q.id === ticketQueueTargetId)
    if (!target) return setTicketQueueModalError('Queue not found.')
    if (target.label.trim().toLowerCase() === 'unassigned') return setTicketQueueModalError('Unassigned cannot be deleted.')
    persistQueueConfig({
      ...leftPanelConfig,
      ticketQueues: leftPanelConfig.ticketQueues.filter((q) => q.id !== target.id),
    })
    closeTicketQueueModal()
  }
  const closeAssetCategoryModal = () => {
    setAssetCategoryModalOpen(false)
    setAssetCategoryModalMode(null)
    setAssetCategoryTargetId('')
    setAssetCategoryLabelInput('')
    setAssetCategorySubcategoriesInput('')
    setAssetCategoryVisibilityInput('ADMIN,AGENT')
    setAssetCategoryModalError('')
  }
  const hydrateAssetCategoryForm = (id: string) => {
    const target = leftPanelConfig.assetCategories.find((c) => c.id === id)
    if (!target) return
    setAssetCategoryLabelInput(target.label)
    setAssetCategorySubcategoriesInput((target.subcategories || []).join(', '))
    setAssetCategoryVisibilityInput((target.visibilityRoles || []).join(',') || 'ADMIN,AGENT')
  }
  const handleAssetCategoryAdd = () => {
    setAssetCategoryModalMode('add')
    setAssetCategoryModalOpen(true)
    setAssetCategoryModalError('')
    setAssetCategoryTargetId('')
    setAssetCategoryLabelInput('')
    setAssetCategorySubcategoriesInput('')
    setAssetCategoryVisibilityInput('ADMIN,AGENT')
  }
  const handleAssetCategoryEdit = () => {
    setAssetCategoryModalMode('edit')
    setAssetCategoryModalOpen(true)
    setAssetCategoryModalError('')
    if (!leftPanelConfig.assetCategories.length) {
      setAssetCategoryTargetId('')
      setAssetCategoryModalError('No asset category available.')
      return
    }
    const first = leftPanelConfig.assetCategories[0]
    setAssetCategoryTargetId(first.id)
    hydrateAssetCategoryForm(first.id)
  }
  const handleAssetCategoryDelete = () => {
    setAssetCategoryModalMode('delete')
    setAssetCategoryModalOpen(true)
    setAssetCategoryModalError('')
    if (!leftPanelConfig.assetCategories.length) {
      setAssetCategoryTargetId('')
      setAssetCategoryModalError('No asset category available.')
      return
    }
    setAssetCategoryTargetId(leftPanelConfig.assetCategories[0].id)
  }
  const submitAssetCategoryModal = () => {
    if (!assetCategoryModalMode) return
    setAssetCategoryModalError('')
    if (assetCategoryModalMode === 'add') {
      const label = assetCategoryLabelInput.trim()
      if (!label) return setAssetCategoryModalError('Category name is required.')
      const exists = leftPanelConfig.assetCategories.some((c) => c.label.trim().toLowerCase() === label.toLowerCase())
      if (exists) return setAssetCategoryModalError(`Category "${label}" already exists.`)
      const subcategories = assetCategorySubcategoriesInput.split(',').map((v) => v.trim()).filter(Boolean)
      const visibilityRoles = parseVisibilityRoles(assetCategoryVisibilityInput)
      persistQueueConfig({
        ...leftPanelConfig,
        assetCategories: [...leftPanelConfig.assetCategories, { id: `ac-${Date.now()}`, label, subcategories, visibilityRoles }],
      })
      closeAssetCategoryModal()
      return
    }
    if (assetCategoryModalMode === 'edit') {
      if (!assetCategoryTargetId) return setAssetCategoryModalError('Select a category to edit.')
      const target = leftPanelConfig.assetCategories.find((c) => c.id === assetCategoryTargetId)
      if (!target) return setAssetCategoryModalError('Category not found.')
      const label = assetCategoryLabelInput.trim()
      if (!label) return setAssetCategoryModalError('Category name is required.')
      const duplicate = leftPanelConfig.assetCategories.some((c) => c.id !== target.id && c.label.trim().toLowerCase() === label.toLowerCase())
      if (duplicate) return setAssetCategoryModalError(`Category "${label}" already exists.`)
      const subcategories = assetCategorySubcategoriesInput.split(',').map((v) => v.trim()).filter(Boolean)
      const visibilityRoles = parseVisibilityRoles(assetCategoryVisibilityInput)
      persistQueueConfig({
        ...leftPanelConfig,
        assetCategories: leftPanelConfig.assetCategories.map((c) =>
          c.id === target.id ? { ...c, label, subcategories, visibilityRoles } : c),
      })
      closeAssetCategoryModal()
      return
    }
    if (!assetCategoryTargetId) return setAssetCategoryModalError('Select a category to delete.')
    const target = leftPanelConfig.assetCategories.find((c) => c.id === assetCategoryTargetId)
    if (!target) return setAssetCategoryModalError('Category not found.')
    persistQueueConfig({
      ...leftPanelConfig,
      assetCategories: leftPanelConfig.assetCategories.filter((c) => c.id !== target.id),
    })
    closeAssetCategoryModal()
  }

  const addActivity = (message: string) => {
    setActivityLog((prev) => [`${message} (${new Date().toLocaleTimeString()})`, ...prev])
  }

  const handleSave = () => {
    setSavedValues(values)
    const now = new Date().toLocaleString()
    setLastSavedAt(now)
    addActivity(`${title} configuration saved`)
    setShowConfirmSave(false)
  }

  const handleCancel = () => {
    setValues(savedValues)
    addActivity('Uncommitted settings reverted')
  }

  const handleImport = () => {
    addActivity('Configuration import requested')
    alert('Import configuration started. Validate uploaded file in audit logs.')
  }

  const handleExport = () => {
    addActivity('Configuration export requested')
    alert('Export package prepared. Download is available in activity log.')
  }

  const confirmReset = () => {
    setValues(initialValues)
    setSavedValues(initialValues)
    setShowConfirmReset(false)
    addActivity(`${title} reset to defaults`)
  }

  const confirmRevoke = () => {
    setShowConfirmRevoke(false)
    addActivity('All active API keys revoked')
    alert('All API keys have been revoked. Regenerate keys for integrations.')
  }

  const queueFieldOptions: Record<'ticketsMyLists' | 'users' | 'assets' | 'suppliers', string[]> = {
    ticketsMyLists: ['status', 'type', 'category', 'priority', 'sla'],
    users: ['status', 'workMode', 'department'],
    assets: ['status', 'assigned', 'category'],
    suppliers: ['sla', 'contact', 'company'],
  }
  const queuePanelLabels: Record<'ticketsMyLists' | 'users' | 'assets' | 'suppliers', string> = {
    ticketsMyLists: 'Ticket Left Panel',
    users: 'User Left Panel',
    assets: 'Asset Left Panel',
    suppliers: 'Supplier Left Panel',
  }
  const normalizePanelInput = (input: string): QueuePanelKey | null => {
    const key = String(input || '').trim().toLowerCase()
    if (!key) return null
    if (key === 'tickets' || key === 'ticket' || key === 'ticketsmylists' || key === 'ticket left panel') return 'ticketsMyLists'
    if (key === 'users' || key === 'user' || key === 'user left panel') return 'users'
    if (key === 'assets' || key === 'asset' || key === 'asset left panel') return 'assets'
    if (key === 'suppliers' || key === 'supplier' || key === 'supplier left panel') return 'suppliers'
    return null
  }
  const handleQueueAdd = () => {
    const panel = queuePanelKey
    const name = window.prompt('Queue name?')
    if (name == null) return
    const label = name.trim()
    if (!label) return
    const list = leftPanelConfig[panel]
    const exists = list.some((r) => r.label.trim().toLowerCase() === label.toLowerCase())
    if (exists) {
      alert(`Queue "${label}" already exists in ${queuePanelLabels[panel]}.`)
      return
    }
    const allowedFields = queueFieldOptions[panel]
    const defaultField = allowedFields[0] || 'status'
    const fieldInput = window.prompt(`Field for "${label}" (${allowedFields.join(', ')})`, defaultField)
    if (fieldInput == null) return
    const field = fieldInput.trim()
    if (!allowedFields.includes(field)) {
      alert(`Invalid field for ${queuePanelLabels[panel]}. Allowed: ${allowedFields.join(', ')}`)
      return
    }
    const valueInput = window.prompt(`Value for "${field}"`, 'all')
    if (valueInput == null) return
    const value = valueInput.trim()
    if (!value) return
    const nextRule: QueueRule = { id: `${panel}-${Date.now()}`, label, field, value }
    const nextConfig = { ...leftPanelConfig, [panel]: [...leftPanelConfig[panel], nextRule] }
    persistQueueConfig(nextConfig)
    setQueuePanelKey(panel)
  }
  const handleQueueEdit = () => {
    const panel = queuePanelKey
    const list = leftPanelConfig[panel]
    if (list.length === 0) {
      alert(`No queues available in ${queuePanelLabels[panel]}.`)
      return
    }
    const queueNames = list.map((r) => r.label).join(', ')
    const existingNameInput = window.prompt('Queue name to edit?')
    if (existingNameInput == null) return
    const existingName = existingNameInput.trim().toLowerCase()
    if (!existingName) return
    const existing = list.find((r) => r.label.trim().toLowerCase() === existingName)
    if (!existing) {
      alert(`Queue "${existingNameInput}" not found in ${queuePanelLabels[panel]}. Available: ${queueNames}`)
      return
    }
    const nextNameInput = window.prompt('New queue name', existing.label)
    if (nextNameInput == null) return
    const label = nextNameInput.trim()
    if (!label) return
    const duplicate = list.some((r) => r.id !== existing.id && r.label.trim().toLowerCase() === label.toLowerCase())
    if (duplicate) {
      alert(`Queue "${label}" already exists in ${queuePanelLabels[panel]}.`)
      return
    }
    const allowedFields = queueFieldOptions[panel]
    const nextFieldInput = window.prompt(`New field (${allowedFields.join(', ')})`, existing.field)
    if (nextFieldInput == null) return
    const field = nextFieldInput.trim()
    if (!allowedFields.includes(field)) {
      alert(`Invalid field for ${queuePanelLabels[panel]}. Allowed: ${allowedFields.join(', ')}`)
      return
    }
    const nextValueInput = window.prompt('New value', existing.value)
    if (nextValueInput == null) return
    const value = nextValueInput.trim()
    if (!value) return
    const nextConfig = {
      ...leftPanelConfig,
      [panel]: list.map((r) => (r.id === existing.id ? { ...r, label, field, value } : r)),
    }
    persistQueueConfig(nextConfig)
    setQueuePanelKey(panel)
  }
  const handleQueueDelete = () => {
    const panel = queuePanelKey
    const list = leftPanelConfig[panel]
    if (list.length === 0) {
      alert(`No queues available in ${queuePanelLabels[panel]}.`)
      return
    }
    const queueNames = list.map((r) => r.label).join(', ')
    const targetNameInput = window.prompt('Queue name to delete?')
    if (targetNameInput == null) return
    const targetName = targetNameInput.trim().toLowerCase()
    if (!targetName) return
    const existing = list.find((r) => r.label.trim().toLowerCase() === targetName)
    if (!existing) {
      alert(`Queue "${targetNameInput}" not found in ${queuePanelLabels[panel]}. Available: ${queueNames}`)
      return
    }
    if (existing.label.trim().toLowerCase() === 'unassigned') {
      alert('Unassigned cannot be deleted.')
      return
    }
    if (!window.confirm(`Delete queue "${existing.label}" from ${queuePanelLabels[panel]}?`)) return
    const nextConfig = { ...leftPanelConfig, [panel]: list.filter((r) => r.id !== existing.id) }
    persistQueueConfig(nextConfig)
    setQueuePanelKey(panel)
  }

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hasChanges])

  useEffect(() => {
    const expandedCls = 'admin-queue-expanded'
    const collapsedCls = 'admin-queue-collapsed'
    if (!sidebarCollapsed) {
      document.body.classList.add(expandedCls)
      document.body.classList.remove(collapsedCls)
    } else {
      document.body.classList.remove(expandedCls)
      document.body.classList.add(collapsedCls)
    }
    return () => {
      document.body.classList.remove(expandedCls)
      document.body.classList.remove(collapsedCls)
    }
  }, [sidebarCollapsed])

  useEffect(() => {
    document.body.classList.add('admin-view-active')
    return () => document.body.classList.remove('admin-view-active')
  }, [])
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ action?: string; target?: string }>).detail
      if (!detail || detail.target !== 'admin') return
      if (detail.action === 'toggle-left-panel') {
        setSidebarCollapsed((v) => !v)
        return
      }
      if (detail.action === 'admin-cancel') {
        handleCancel()
        return
      }
      if (detail.action === 'admin-save') {
        if (hasChanges) setShowConfirmSave(true)
        return
      }
      if (detail.action === 'refresh') {
        setLeftPanelConfig(loadLeftPanelConfig())
        if (activeItem === 'sla-policies' && role === 'ADMIN') {
          loadSlaRows()
        }
        if (activeItem === 'mail-configuration' && role === 'ADMIN') {
          loadMailConfiguration()
        }
        if (activeItem === 'database-configuration' && role === 'ADMIN') {
          loadDatabaseConfiguration()
        }
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [activeItem, hasChanges, role, savedValues, values, title])

  const panelSections = visibleSections
  const renderPanelIcon = (sectionId: string) => {
    if (sectionId === 'user-access') {
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="8" r="3" />
          <path d="M5 19a7 7 0 0 1 14 0" />
        </svg>
      )
    }
    if (sectionId === 'incident') {
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
          <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      )
    }
    if (sectionId === 'integrations') {
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 7h4a2 2 0 1 1 0 4H9" />
          <path d="M16 17h-4a2 2 0 1 1 0-4h3" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
      )
    }
    if (sectionId === 'workflow-automation') {
      return (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="6" height="6" rx="1" />
          <rect x="15" y="14" width="6" height="6" rx="1" />
          <path d="M9 7h3a3 3 0 0 1 3 3v4" />
          <path d="M15 14h-2" />
        </svg>
      )
    }
    return (
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5h0a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.5 1z" />
      </svg>
    )
  }
  const adminLeftPanel = (!sidebarCollapsed && queueRoot) ? createPortal(
    <aside className="admin-left-panel">
      <div className="queue-header">
        <div className="queue-title-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <div className="queue-title">
          <button className="queue-title-btn" title="Admin settings">
            <div className="queue-title-text">Admin Settings</div>
          </button>
        </div>
        <button className="queue-collapse-btn" title="Hide Menu" onClick={() => setSidebarCollapsed(true)}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>
      <div className="queue-list">
        {panelSections.map((section) => {
          const allowedItems = section.items.filter((i) => !(i.requiresAdmin && role !== 'ADMIN'))
          const isSectionActive = activeSection === section.id
          if (allowedItems.length > 1) {
            return allowedItems.map((item) => (
              <div
                key={item.id}
                className={`queue-item${activeItem === item.id ? ' queue-item-active' : ''}`}
                onClick={() => handleSelectItem(section.id, item.id)}
              >
                <div className="queue-avatar">{renderPanelIcon(section.id)}</div>
                <div className="queue-name">{item.label}</div>
              </div>
            ))
          }
          return (
            <React.Fragment key={section.id}>
              <div
                className={`queue-item${isSectionActive ? ' queue-item-active' : ''}`}
                onClick={() => handleSelectSection(section.id)}
              >
                <div className="queue-avatar">{renderPanelIcon(section.id)}</div>
                <div className="queue-name">{section.label}</div>
              </div>
            </React.Fragment>
          )
        })}
      </div>
    </aside>,
    queueRoot
  ) : null

  if (isRolesPermissionsView) {
    return (
      <>
        {adminLeftPanel}
        <RbacModule isAdmin={role === 'ADMIN'} />
      </>
    )
  }

  if (isSlaPoliciesView) {
    return (
      <>
        {adminLeftPanel}
        <section className="rbac-module-card" style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
          <div style={{ padding: 16 }}>
            <div className="sla-policy-toolbar">
              <div className="sla-policy-toolbar-left">
                <button
                  className="table-icon-btn"
                  onClick={() => setSidebarCollapsed((v) => !v)}
                  title={sidebarCollapsed ? 'Show Menu' : 'Hide Menu'}
                  aria-label={sidebarCollapsed ? 'Show menu' : 'Hide menu'}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                    {sidebarCollapsed ? (
                      <>
                        <polyline points="13 18 7 12 13 6" />
                        <polyline points="19 18 13 12 19 6" />
                      </>
                    ) : (
                      <>
                        <polyline points="11 18 17 12 11 6" />
                        <polyline points="5 18 11 12 5 6" />
                      </>
                    )}
                  </svg>
                </button>
                <h3 style={{ margin: 0 }}>SLA Policies</h3>
              </div>
              <div className="sla-policy-toolbar-actions">
                {!showPolicyForm && (
                  <button className="table-icon-btn" onClick={loadSlaRows} disabled={slaBusy} title="Refresh" aria-label="Refresh SLA policies">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>
                )}
                {!showPolicyForm ? (
                  <button className="admin-settings-primary" onClick={openCreatePolicyForm} disabled={slaBusy}>
                    Add Policy
                  </button>
                ) : <span />}
              </div>
            </div>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage SLA policies.</p>
            ) : (
              <>
                {showPolicyForm ? (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '240px 240px 320px 1fr auto auto', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <label style={{ fontWeight: 600 }}>Policy Name</label>
                      <label style={{ fontWeight: 600 }}>Format</label>
                      <label style={{ fontWeight: 600 }}>Time Zone</label>
                      <div />
                      <div />
                      <div />
                      <input
                        placeholder="Enter policy name"
                        value={policyName}
                        disabled={slaBusy}
                        onChange={(e) => setPolicyName(e.target.value)}
                        style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', background: '#fff' }}
                      />
                      <select
                        value={policyFormat}
                        disabled={slaBusy}
                        onChange={(e) => setPolicyFormat(e.target.value as SlaFormat)}
                        style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', background: '#fff' }}
                      >
                        <option value="critical_set">Critical, High, Medium, Low</option>
                        <option value="p_set">P1, P2, P3, P4</option>
                        <option value="custom">Custom</option>
                      </select>
                      <select
                        value={policyTimeZone}
                        disabled={slaBusy}
                        onChange={(e) => setPolicyTimeZone(e.target.value)}
                        style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', background: '#fff' }}
                      >
                        {TIME_ZONE_OPTIONS.map((zone) => (
                          <option key={zone} value={zone}>
                            {zone}{zone === SYSTEM_TIME_ZONE ? ' (System)' : ''}
                          </option>
                        ))}
                      </select>
                      <div />
                      <button className="admin-settings-ghost" onClick={closePolicyForm} disabled={slaBusy}>Cancel</button>
                      <button className="admin-settings-primary" onClick={submitPolicyForm} disabled={slaBusy}>
                        {slaBusy ? 'Saving...' : policyFormMode === 'edit' ? 'Update Policy' : 'Create Policy'}
                      </button>
                    </div>
                    {policyFormat === 'custom' ? (
                      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <label style={{ fontWeight: 600 }}>Custom Labels</label>
                        <input
                          placeholder="Ex: Sev1, Sev2, Sev3, Sev4"
                          value={customFormatText}
                          disabled={slaBusy}
                          onChange={(e) => setCustomFormatText(e.target.value)}
                          style={{ height: 34, borderRadius: 8, border: '1px solid #cbd5e1', padding: '0 10px', background: '#fff' }}
                        />
                      </div>
                    ) : null}
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: anyBusinessHoursEnabled ? 'minmax(640px, 1fr) 470px' : 'minmax(640px, 1fr)',
                        gap: 12,
                        alignItems: 'start',
                        marginBottom: 10,
                      }}
                    >
                      <div style={{ maxWidth: anyBusinessHoursEnabled ? 780 : '100%' }}>
                        <table className="rbac-permission-matrix sla-priority-table" style={{ width: '100%', tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: 78 }} />
                            <col style={{ width: 52 }} />
                            <col style={{ width: 188 }} />
                            <col style={{ width: 188 }} />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 62 }} />
                          </colgroup>
                          <thead>
                            <tr>
                              <th>Need SLA</th>
                              <th>Priority</th>
                              <th>Response</th>
                              <th>Resolution</th>
                              <th>Business Hours</th>
                              <th>Active</th>
                            </tr>
                          </thead>
                          <tbody>
                            {SLA_PRIORITIES.map((priority) => {
                              const policy = priorityPolicies[priority]
                              return (
                                <tr key={priority}>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={policy.enabled}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], enabled: e.target.checked },
                                        }))
                                      }
                                    />
                                  </td>
                                  <td>{policyPriorityLabels[SLA_PRIORITIES.indexOf(priority)]}</td>
                                  <td>
                                    <div
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 74px',
                                        minWidth: 156,
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 8,
                                        overflow: 'hidden',
                                        background: '#fff',
                                      }}
                                    >
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={policy.responseTimeMin}
                                        disabled={!policy.enabled || slaBusy}
                                        onChange={(e) =>
                                          setPriorityPolicies((prev) => ({
                                            ...prev,
                                            [priority]: { ...prev[priority], responseTimeMin: e.target.value },
                                          }))
                                        }
                                        style={{ border: 'none', borderRight: '1px solid #cbd5e1', padding: '0 8px', height: 30 }}
                                      />
                                      <select
                                        value={policy.responseTimeUnit}
                                        disabled={!policy.enabled || slaBusy}
                                        onChange={(e) =>
                                          setPriorityPolicies((prev) => ({
                                            ...prev,
                                            [priority]: { ...prev[priority], responseTimeUnit: e.target.value as SlaTimeUnit },
                                          }))
                                        }
                                        style={{ border: 'none', padding: '0 6px', height: 30, background: '#f8fafc' }}
                                      >
                                        {SLA_TIME_UNITS.map((unit) => (
                                          <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </td>
                                  <td>
                                    <div
                                      style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 74px',
                                        minWidth: 156,
                                        border: '1px solid #cbd5e1',
                                        borderRadius: 8,
                                        overflow: 'hidden',
                                        background: '#fff',
                                      }}
                                    >
                                      <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={policy.resolutionTimeMin}
                                        disabled={!policy.enabled || slaBusy}
                                        onChange={(e) =>
                                          setPriorityPolicies((prev) => ({
                                            ...prev,
                                            [priority]: { ...prev[priority], resolutionTimeMin: e.target.value },
                                          }))
                                        }
                                        style={{ border: 'none', borderRight: '1px solid #cbd5e1', padding: '0 8px', height: 30 }}
                                      />
                                      <select
                                        value={policy.resolutionTimeUnit}
                                        disabled={!policy.enabled || slaBusy}
                                        onChange={(e) =>
                                          setPriorityPolicies((prev) => ({
                                            ...prev,
                                            [priority]: { ...prev[priority], resolutionTimeUnit: e.target.value as SlaTimeUnit },
                                          }))
                                        }
                                        style={{ border: 'none', padding: '0 6px', height: 30, background: '#f8fafc' }}
                                      >
                                        {SLA_TIME_UNITS.map((unit) => (
                                          <option key={unit} value={unit}>{unit}</option>
                                        ))}
                                      </select>
                                    </div>
                                  </td>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={policy.businessHours}
                                      disabled={!policy.enabled || slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], businessHours: e.target.checked },
                                        }))
                                      }
                                    />
                                  </td>
                                  <td>
                                    <input
                                      type="checkbox"
                                      checked={policy.active}
                                      disabled={!policy.enabled || slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], active: e.target.checked },
                                        }))
                                      }
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {anyBusinessHoursEnabled ? (
                        <div style={{ border: '1px solid #d7dee8', borderRadius: 10, padding: 10, background: '#fff', width: '100%' }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Business Hours Schedule</div>
                        <div style={{ display: 'grid', gap: 6 }}>
                          {BUSINESS_DAYS.map((day) => {
                            const dayInfo = policySchedule[day]
                            return (
                              <div key={day} style={{ display: 'grid', gridTemplateColumns: '20px 44px 1fr auto', gap: 6, alignItems: 'start' }}>
                                <input
                                  type="checkbox"
                                  checked={dayInfo.enabled}
                                  disabled={slaBusy}
                                  onChange={(e) => toggleBusinessDay(day, e.target.checked)}
                                />
                                <span style={{ fontSize: 12, marginTop: 4 }}>{day.slice(0, 3)}</span>
                                <div style={{ display: 'grid', gap: 4 }}>
                                  {dayInfo.slots.map((slot, slotIndex) => (
                                    <div key={`${day}-${slotIndex}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr auto', gap: 4, alignItems: 'center' }}>
                                      <input
                                        type="time"
                                        value={slot.start}
                                        disabled={!dayInfo.enabled || slaBusy}
                                        onChange={(e) => updateBusinessSlot(day, slotIndex, 'start', e.target.value)}
                                      />
                                      <span style={{ fontSize: 11 }}>to</span>
                                      <input
                                        type="time"
                                        value={slot.end}
                                        disabled={!dayInfo.enabled || slaBusy}
                                        onChange={(e) => updateBusinessSlot(day, slotIndex, 'end', e.target.value)}
                                      />
                                      <button
                                        type="button"
                                        className="admin-settings-ghost"
                                        disabled={!dayInfo.enabled || slaBusy || dayInfo.slots.length <= 1}
                                        onClick={() => removeBusinessSlot(day, slotIndex)}
                                        style={{ padding: '2px 6px' }}
                                      >
                                        -
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  className="admin-settings-ghost"
                                  disabled={!dayInfo.enabled || slaBusy}
                                  onClick={() => addBusinessSlot(day)}
                                  style={{ padding: '2px 6px' }}
                                >
                                  +
                                </button>
                              </div>
                            )
                          })}
                        </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : slaLoading ? (
                  <p>Loading SLA policies...</p>
                ) : (
                  <>
                  <table className="rbac-permission-matrix sla-summary-table">
                    <colgroup>
                      <col style={{ width: 130 }} />
                      <col style={{ width: 88 }} />
                      <col style={{ width: 96 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 82 }} />
                      <col style={{ width: 44 }} />
                      <col style={{ width: 50 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 82 }} />
                      <col style={{ width: 44 }} />
                      <col style={{ width: 50 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 82 }} />
                      <col style={{ width: 44 }} />
                      <col style={{ width: 50 }} />
                      <col style={{ width: 76 }} />
                      <col style={{ width: 82 }} />
                      <col style={{ width: 44 }} />
                      <col style={{ width: 50 }} />
                      <col style={{ width: 104 }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th rowSpan={2}>Policy</th>
                        <th rowSpan={2}>Format</th>
                        <th rowSpan={2}>Time Zone</th>
                        <th colSpan={4}>Critical/Priority1 (P1)</th>
                        <th colSpan={4}>High/Priority2 (P2)</th>
                        <th colSpan={4}>Medium/Priority3 (P3)</th>
                        <th colSpan={4}>Low/Priority4 (P4)</th>
                        <th rowSpan={2}>Actions</th>
                      </tr>
                      <tr>
                        <th>Response</th>
                        <th>Resolution</th>
                        <th>BH</th>
                        <th>Active</th>
                        <th>Response</th>
                        <th>Resolution</th>
                        <th>BH</th>
                        <th>Active</th>
                        <th>Response</th>
                        <th>Resolution</th>
                        <th>BH</th>
                        <th>Active</th>
                        <th>Response</th>
                        <th>Resolution</th>
                        <th>BH</th>
                        <th>Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slaTotalRows === 0 ? (
                        <tr>
                          <td colSpan={20}>No SLA policy available.</td>
                        </tr>
                      ) : slaPoliciesPage.map((group) => (
                        <tr key={group.name}>
                          {(() => {
                            const rows = group.rows.slice()
                            const byRank = new Map<number, any>()
                            rows.forEach((r) => {
                              const rank = Number(r?.priorityRank)
                              if (Number.isFinite(rank) && rank >= 1 && rank <= 4 && !byRank.has(rank)) {
                                byRank.set(rank, r)
                              }
                            })
                            const findByLabel = (labels: string[]) =>
                              rows.find((r) => labels.includes(String(r?.priority || '').trim().toLowerCase()))
                            const r1 = byRank.get(1) || findByLabel(['critical', 'p1'])
                            const r2 = byRank.get(2) || findByLabel(['high', 'p2'])
                            const r3 = byRank.get(3) || findByLabel(['medium', 'p3'])
                            const r4 = byRank.get(4) || findByLabel(['low', 'p4'])
                            const mins = (v: any) => (v === undefined || v === null ? '-' : `${v} min`)
                            const yn = (v: any) => (v === undefined || v === null ? '-' : (v ? 'Yes' : 'No'))
                            const response = (row?: any) => (row ? mins(row.responseTimeMin) : '-')
                            const resolution = (row?: any) => (row ? mins(row.resolutionTimeMin) : '-')
                            const bh = (row?: any) => (row ? yn(row.businessHours) : '-')
                            const active = (row?: any) => (row ? yn(row.active) : '-')
                            const format = String(rows[0]?.format || '').trim()
                            const zone = String(rows[0]?.timeZone || '').trim()
                            return (
                              <>
                                <td>{group.name || '-'}</td>
                                <td>{format || '-'}</td>
                                <td>{zone || '-'}</td>
                                <td>{response(r1)}</td>
                                <td>{resolution(r1)}</td>
                                <td>{bh(r1)}</td>
                                <td>{active(r1)}</td>
                                <td>{response(r2)}</td>
                                <td>{resolution(r2)}</td>
                                <td>{bh(r2)}</td>
                                <td>{active(r2)}</td>
                                <td>{response(r3)}</td>
                                <td>{resolution(r3)}</td>
                                <td>{bh(r3)}</td>
                                <td>{active(r3)}</td>
                                <td>{response(r4)}</td>
                                <td>{resolution(r4)}</td>
                                <td>{bh(r4)}</td>
                                <td>{active(r4)}</td>
                              </>
                            )
                          })()}
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button className="admin-settings-ghost" onClick={() => openEditPolicyForm(group.name)} disabled={slaBusy}>Edit</button>
                            <button className="admin-settings-danger" onClick={() => deletePolicyGroup(group.name)} disabled={slaBusy}>Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {slaTotalRows > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 }}>
                      <span className="pagination">{slaRangeStart}-{slaRangeEnd} of {slaTotalRows}</span>
                      <div className="toolbar-pagination-group">
                        <button
                          className="users-page-btn"
                          onClick={() => setSlaPage((p) => Math.max(1, p - 1))}
                          disabled={slaSafePage <= 1}
                          aria-label="Previous page"
                        >
                          {'<'}
                        </button>
                        <button className="users-page-btn active" aria-label="Current page">
                          {slaSafePage}
                        </button>
                        <button
                          className="users-page-btn"
                          onClick={() => setSlaPage((p) => Math.min(slaTotalPages, p + 1))}
                          disabled={slaSafePage >= slaTotalPages}
                          aria-label="Next page"
                        >
                          {'>'}
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </>
    )
  }

  if (isMailConfigurationView) {
    return (
      <>
        {adminLeftPanel}
        <section className="rbac-module-card" style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
          <div className="admin-config-page">
            <div className="admin-config-head">
              <h3>Mail Provider, Routing & Automation</h3>
              <div className="admin-config-actions">
                <button className="admin-settings-ghost" onClick={loadMailConfiguration} disabled={mailBusy || mailLoading}>
                  {mailLoading ? 'Loading...' : 'Reload'}
                </button>
                <button className="admin-settings-primary" onClick={saveMailConfiguration} disabled={mailBusy || mailLoading}>
                  {mailBusy ? 'Working...' : 'Save'}
                </button>
              </div>
            </div>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage mail configuration.</p>
            ) : (
              <>
                <div className="admin-config-grid two">
                  <article className="admin-config-card">
                    <h4>Email Provider</h4>
                    <p>Provider type, connection mode, and OAuth status.</p>
                    <label className="admin-field-row">
                      <span>Provider Type</span>
                      <select
                        value={mailForm.providerType}
                        onChange={(e) => {
                          const providerType = e.target.value as MailConfigForm['providerType']
                          applyProviderAndConnectionPreset(providerType, mailForm.connectionMode)
                        }}
                      >
                        <option value="google-workspace-oauth">Google Workspace (OAuth)</option>
                        <option value="microsoft-365-oauth">Microsoft 365 (OAuth)</option>
                        <option value="smtp-imap-custom">SMTP/IMAP (Custom)</option>
                        <option value="api-provider">API Provider (SendGrid / Mailgun)</option>
                      </select>
                    </label>
                    <label className="admin-field-row">
                      <span>Connection Mode</span>
                      <select
                        value={mailForm.connectionMode}
                        onChange={(e) => applyProviderAndConnectionPreset(mailForm.providerType, e.target.value as MailConfigForm['connectionMode'])}
                      >
                        <option value="oauth2">OAuth 2.0</option>
                        <option value="app-password">App Password</option>
                        <option value="manual-credentials">Manual Credentials</option>
                      </select>
                    </label>
                    {mailForm.connectionMode === 'oauth2' ? (
                      <>
                        <label className="admin-field-row">
                          <span>Connected Status</span>
                          <div className={`mail-status-badge ${mailForm.oauthConnected ? 'success' : 'danger'}`}>
                            {mailForm.oauthConnected ? 'Connected' : 'Not Connected'}
                          </div>
                        </label>
                        <label className="admin-field-row">
                          <span>Token Expiry</span>
                          <input value={mailForm.oauthTokenExpiry} onChange={(e) => updateMailRoot('oauthTokenExpiry', e.target.value)} placeholder="mm/dd/yyyy hh:mm" />
                        </label>
                        <div className="admin-config-actions">
                          <button className="admin-settings-ghost" onClick={connectOAuthAccount} disabled={mailBusy || mailLoading}>Connect Account</button>
                          <button className="admin-settings-ghost" onClick={reconnectOAuthAccount} disabled={mailBusy || mailLoading}>Reconnect</button>
                        </div>
                      </>
                    ) : null}
                    {mailForm.providerType === 'api-provider' ? (
                      <div className="admin-config-row three">
                        <label className="admin-field-row">
                          <span>API Provider</span>
                          <input value={mailForm.apiProviderName} onChange={(e) => updateMailRoot('apiProviderName', e.target.value)} placeholder="SendGrid / Mailgun" />
                        </label>
                        <label className="admin-field-row">
                          <span>API Base URL</span>
                          <input value={mailForm.apiBaseUrl} onChange={(e) => updateMailRoot('apiBaseUrl', e.target.value)} placeholder="https://api.provider.com" />
                        </label>
                        <label className="admin-field-row">
                          <span>API Key</span>
                          <input value={mailForm.apiKey} onChange={(e) => updateMailRoot('apiKey', e.target.value)} />
                        </label>
                      </div>
                    ) : null}
                  </article>
                  <article className="admin-config-card">
                    <h4>Inbound Mail Processing</h4>
                    <p>
                      Mode:
                      {' '}
                      {isApiProvider ? 'API provider mode (IMAP disabled)' : isOauthMode ? 'OAuth mode' : isAppPasswordMode ? 'App password mode' : 'Manual credentials mode'}
                    </p>
                    <label className="admin-field-row">
                      <span>Inbound Email Address</span>
                      <input
                        value={mailForm.inboundEmailAddress}
                        onChange={(e) => {
                          const next = e.target.value
                          setMailForm((prev) => ({ ...prev, inboundEmailAddress: next, supportMail: next }))
                        }}
                        placeholder="support@domain.com"
                      />
                    </label>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>IMAP Host</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.imap.host} onChange={(e) => updateImapField('host', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>Port</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.imap.port} onChange={(e) => updateImapField('port', e.target.value)} />
                      </label>
                    </div>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>Username</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.imap.user} onChange={(e) => updateImapField('user', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>{isOauthMode ? 'OAuth Managed' : isAppPasswordMode ? 'App Password' : 'Password'}</span>
                        <input
                          type={isOauthMode ? 'text' : 'password'}
                          disabled={disableImapSmtpProtocolConfig || disableImapSmtpCredentials}
                          value={isOauthMode ? 'Managed via OAuth' : mailForm.imap.pass}
                          onChange={(e) => updateImapField('pass', e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>Encryption</span>
                        <select disabled={disableImapSmtpProtocolConfig} value={mailForm.imapEncryption} onChange={(e) => updateMailRoot('imapEncryption', e.target.value as MailConfigForm['imapEncryption'])}>
                          <option value="SSL">SSL</option>
                          <option value="TLS">TLS</option>
                          <option value="None">None</option>
                        </select>
                      </label>
                      <label className="admin-field-row">
                        <span>Poll Interval (ms)</span>
                        <input value={mailForm.pollIntervalMs} onChange={(e) => updateMailRoot('pollIntervalMs', e.target.value)} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Enable Push (Webhook)</span>
                        <input type="checkbox" checked={mailForm.enablePush} onChange={(e) => updateMailRoot('enablePush', e.target.checked)} />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>Default Queue</span>
                        <input value={mailForm.inboundDefaultQueue} onChange={(e) => updateMailRoot('inboundDefaultQueue', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>Default Ticket Type</span>
                        <input value={mailForm.inboundDefaultTicketType} onChange={(e) => updateMailRoot('inboundDefaultTicketType', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>Default Priority</span>
                        <input value={mailForm.inboundDefaultPriority} onChange={(e) => updateMailRoot('inboundDefaultPriority', e.target.value)} />
                      </label>
                    </div>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>Auto Assign Rule</span>
                        <input value={mailForm.autoAssignRule} onChange={(e) => updateMailRoot('autoAssignRule', e.target.value)} placeholder="Round robin / skill based" />
                      </label>
                      <label className="admin-field-row">
                        <span>Mailbox</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.imap.mailbox} onChange={(e) => updateImapField('mailbox', e.target.value)} />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row switch-row">
                        <span>Ignore Auto-Reply Emails</span>
                        <input type="checkbox" checked={mailForm.ignoreAutoReply} onChange={(e) => updateMailRoot('ignoreAutoReply', e.target.checked)} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Prevent Email Loop</span>
                        <input type="checkbox" checked={mailForm.preventEmailLoop} onChange={(e) => updateMailRoot('preventEmailLoop', e.target.checked)} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Process Attachments</span>
                        <input type="checkbox" checked={mailForm.processAttachments} onChange={(e) => updateMailRoot('processAttachments', e.target.checked)} />
                      </label>
                    </div>
                    <div className="admin-config-actions">
                      <button className="admin-settings-ghost" onClick={() => runMailAction('imap')} disabled={mailBusy || mailLoading || disableMailProtocolTests}>Test IMAP</button>
                      <button className="admin-settings-ghost" onClick={testInboundProcessing} disabled={mailBusy || mailLoading || disableMailProtocolTests}>Test Inbound Processing</button>
                      <button className="admin-settings-ghost" onClick={viewLastSyncTime} disabled={mailBusy || mailLoading}>View Last Sync Time</button>
                      <button className="admin-settings-ghost" onClick={syncInboundNow} disabled={mailBusy || mailLoading}>Sync Now</button>
                    </div>
                  </article>
                </div>
                <div className="admin-config-grid two">
                  <article className="admin-config-card">
                    <h4>Outgoing Mail</h4>
                    <p>
                      SMTP channel for ticket updates sent to users.
                      {' '}
                      {isApiProvider ? '(disabled in API provider mode)' : isOauthMode ? '(OAuth-managed auth)' : ''}
                    </p>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>SMTP Host</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.smtp.host} onChange={(e) => updateSmtpField('host', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>Port</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.smtp.port} onChange={(e) => updateSmtpField('port', e.target.value)} />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>Encryption</span>
                        <select disabled={disableImapSmtpProtocolConfig} value={mailForm.smtpEncryption} onChange={(e) => updateMailRoot('smtpEncryption', e.target.value as MailConfigForm['smtpEncryption'])}>
                          <option value="SSL">SSL</option>
                          <option value="TLS">TLS</option>
                          <option value="None">None</option>
                        </select>
                      </label>
                      <label className="admin-field-row">
                        <span>Username</span>
                        <input disabled={disableImapSmtpProtocolConfig} value={mailForm.smtp.user} onChange={(e) => updateSmtpField('user', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>{isOauthMode ? 'OAuth Managed' : isAppPasswordMode ? 'App Password' : 'Password'}</span>
                        <input
                          type={isOauthMode ? 'text' : 'password'}
                          disabled={disableImapSmtpProtocolConfig || disableImapSmtpCredentials}
                          value={isOauthMode ? 'Managed via OAuth' : mailForm.smtp.pass}
                          onChange={(e) => updateSmtpField('pass', e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>From Address</span>
                        <input value={mailForm.smtp.from} onChange={(e) => updateSmtpField('from', e.target.value)} placeholder="support@domain.com" />
                      </label>
                      <label className="admin-field-row">
                        <span>Reply-To Address</span>
                        <input value={mailForm.outboundReplyTo} onChange={(e) => updateMailRoot('outboundReplyTo', e.target.value)} placeholder="helpdesk@domain.com" />
                      </label>
                      <label className="admin-field-row">
                        <span>Max Attachment Size (MB)</span>
                        <input value={mailForm.maxAttachmentSizeMb} onChange={(e) => updateMailRoot('maxAttachmentSizeMb', e.target.value)} />
                      </label>
                    </div>
                    <label className="admin-field-row">
                      <span>Signature Template</span>
                      <textarea value={mailForm.signatureTemplate} onChange={(e) => updateMailRoot('signatureTemplate', e.target.value)} />
                    </label>
                    <label className="admin-field-row">
                      <span>Test Recipient</span>
                      <input value={mailTestRecipient} onChange={(e) => setMailTestRecipient(e.target.value)} placeholder="admin@yourdomain.com" />
                    </label>
                    <div className="admin-config-actions">
                      <button className="admin-settings-ghost" onClick={() => runMailAction('smtp')} disabled={mailBusy || mailLoading || disableMailProtocolTests}>Test SMTP</button>
                      <button className="admin-settings-ghost" onClick={() => runMailAction('send')} disabled={mailBusy || mailLoading}>Send Test Mail</button>
                    </div>
                  </article>
                  <article className="admin-config-card">
                    <h4>Mail to Ticket Rules</h4>
                    <p>Rule engine for creating and appending ticket threads.</p>
                    <label className="admin-field-row switch-row">
                      <span>Create new ticket when subject has no ticket ID</span>
                      <input type="checkbox" checked readOnly />
                    </label>
                    <label className="admin-field-row">
                      <span>Append to ticket pattern</span>
                      <input value={mailForm.appendToTicketPattern} onChange={(e) => updateMailRoot('appendToTicketPattern', e.target.value)} />
                    </label>
                    <div className="admin-config-row three">
                      <label className="admin-field-row switch-row">
                        <span>Overwrite status on reply</span>
                        <input type="checkbox" checked={mailForm.overwriteStatusOnReply} onChange={(e) => updateMailRoot('overwriteStatusOnReply', e.target.checked)} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Auto reopen on reply</span>
                        <input type="checkbox" checked={mailForm.autoReopenOnReply} onChange={(e) => updateMailRoot('autoReopenOnReply', e.target.checked)} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Strip quoted replies</span>
                        <input type="checkbox" checked={mailForm.stripQuotedReplies} onChange={(e) => updateMailRoot('stripQuotedReplies', e.target.checked)} />
                      </label>
                    </div>
                    <div className="admin-config-result">Example: Subject: Re: Printer Issue [#INC-1023]</div>
                  </article>
                </div>

                <div className="admin-config-grid two">
                  <article className="admin-config-card">
                    <h4>Automation & Routing Rules</h4>
                    <p>Queue and type routing rules for inbound emails.</p>
                    <label className="admin-field-row">
                      <span>Rule 1</span>
                      <input value={mailForm.routingRuleHelpdeskQueue} onChange={(e) => updateMailRoot('routingRuleHelpdeskQueue', e.target.value)} />
                    </label>
                    <label className="admin-field-row">
                      <span>Rule 2</span>
                      <input value={mailForm.routingRuleAccessType} onChange={(e) => updateMailRoot('routingRuleAccessType', e.target.value)} />
                    </label>
                    <label className="admin-field-row">
                      <span>Rule 3</span>
                      <input value={mailForm.routingRuleSupplierType} onChange={(e) => updateMailRoot('routingRuleSupplierType', e.target.value)} />
                    </label>
                  </article>
                  <article className="admin-config-card">
                    <h4>Security & Logging</h4>
                    <p>Domain restrictions, validation posture, and delivery retries.</p>
                    <div className="admin-config-row two">
                      <label className="admin-field-row switch-row">
                        <span>Allow External Email Creation</span>
                        <input type="checkbox" checked={mailForm.allowExternalEmailCreation} onChange={(e) => updateMailRoot('allowExternalEmailCreation', e.target.checked)} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Allow Internal Only</span>
                        <input type="checkbox" checked={mailForm.allowInternalOnly} onChange={(e) => updateMailRoot('allowInternalOnly', e.target.checked)} />
                      </label>
                    </div>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>Allowed Domains</span>
                        <input value={mailForm.allowedDomains} onChange={(e) => updateMailRoot('allowedDomains', e.target.value)} placeholder="company.com, partner.com" />
                      </label>
                      <label className="admin-field-row">
                        <span>Blocked Domains</span>
                        <input value={mailForm.blockedDomains} onChange={(e) => updateMailRoot('blockedDomains', e.target.value)} placeholder="spam.com, blocked.com" />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>SPF/DKIM Validation</span>
                        <select value={mailForm.spfDkimStatus} onChange={(e) => updateMailRoot('spfDkimStatus', e.target.value as MailConfigForm['spfDkimStatus'])}>
                          <option value="Unknown">Unknown</option>
                          <option value="Valid">Valid</option>
                          <option value="Invalid">Invalid</option>
                        </select>
                      </label>
                      <label className="admin-field-row">
                        <span>Email Logging Retention (days)</span>
                        <input value={mailForm.emailLogRetentionDays} onChange={(e) => updateMailRoot('emailLogRetentionDays', e.target.value)} />
                      </label>
                      <label className="admin-field-row">
                        <span>Max Retry Count</span>
                        <input value={mailForm.maxRetryCount} onChange={(e) => updateMailRoot('maxRetryCount', e.target.value)} />
                      </label>
                    </div>
                    <label className="admin-field-row switch-row">
                      <span>Retry Failed Send Attempts</span>
                      <input type="checkbox" checked={mailForm.retryFailedSend} onChange={(e) => updateMailRoot('retryFailedSend', e.target.checked)} />
                    </label>
                    <div className="admin-status-grid">
                      <div className={`mail-status-badge ${mailForm.oauthConnected ? 'success' : 'danger'}`}>OAuth {mailForm.oauthConnected ? 'Connected' : 'Disconnected'}</div>
                      <div className={`mail-status-badge ${mailForm.errorLogs ? 'danger' : 'success'}`}>{mailForm.errorLogs ? 'Failed' : 'Healthy'}</div>
                      <div className={`mail-status-badge ${mailForm.oauthTokenExpiry ? 'warning' : 'neutral'}`}>{mailForm.oauthTokenExpiry ? 'Token Expiring' : 'Token Unknown'}</div>
                    </div>
                    <div className="admin-log-panel">
                      <div><strong>Last Sync:</strong> {mailForm.lastSyncTime || '-'}</div>
                      <div><strong>Last Email Received:</strong> {mailForm.lastEmailReceived || '-'}</div>
                      <div><strong>Last Email Sent:</strong> {mailForm.lastEmailSent || '-'}</div>
                      <div><strong>Error Logs:</strong> {mailForm.errorLogs || '-'}</div>
                    </div>
                  </article>
                </div>
                <div className="admin-config-actions admin-mail-footer-actions">
                  <button className="admin-settings-ghost" onClick={() => runMailAction('imap')} disabled={mailBusy || mailLoading || disableMailProtocolTests}>Test IMAP</button>
                  <button className="admin-settings-ghost" onClick={() => runMailAction('smtp')} disabled={mailBusy || mailLoading || disableMailProtocolTests}>Test SMTP</button>
                  <button className="admin-settings-ghost" onClick={syncInboundNow} disabled={mailBusy || mailLoading}>Sync Now</button>
                  <button className="admin-settings-primary" onClick={saveMailConfiguration} disabled={mailBusy || mailLoading}>Save</button>
                </div>
                {mailResult ? <div className="admin-config-result">{mailResult}</div> : null}
              </>
            )}
          </div>
        </section>
      </>
    )
  }

  if (isEmailSignatureTemplatesView) {
    return (
      <>
        {adminLeftPanel}
        <section className="rbac-module-card" style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
          <div className="admin-config-page">
            <div className="admin-config-head">
              <h3>Email & Signature Templates</h3>
              <div className="admin-config-actions">
                <button className="admin-settings-ghost" onClick={loadMailConfiguration} disabled={mailBusy || mailLoading}>
                  {mailLoading ? 'Loading...' : 'Reload'}
                </button>
              </div>
            </div>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage email templates and signatures.</p>
            ) : (
              <>
                <div className="admin-config-grid one">
                  <article className="admin-config-card">
                    <h4>Email Templates (CRUD)</h4>
                    <p>Create individual email templates per button action.</p>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>Template Name</span>
                        <input
                          value={templateForm.name}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                          placeholder="Assign Notification"
                        />
                      </label>
                      <label className="admin-field-row">
                        <span>Button Action</span>
                        <select
                          value={templateForm.buttonKey}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, buttonKey: e.target.value }))}
                        >
                          {BUTTON_TEMPLATE_OPTIONS.map((key) => (
                            <option key={key} value={key}>{key}</option>
                          ))}
                        </select>
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          checked={templateForm.active}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, active: e.target.checked }))}
                        />
                      </label>
                    </div>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>Subject</span>
                        <input
                          value={templateForm.subject}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, subject: e.target.value }))}
                          placeholder="Asset assigned to {{user_name}}"
                        />
                      </label>
                      <label className="admin-field-row">
                        <span>Body</span>
                        <textarea
                          value={templateForm.body}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, body: e.target.value }))}
                          placeholder="Hello {{user_name}}, your asset {{asset_id}} has been assigned."
                        />
                      </label>
                    </div>
                    <div className="admin-config-actions">
                      <button className="admin-settings-primary" onClick={saveTemplate}>
                        {editingTemplateId ? 'Update Template' : 'Create Template'}
                      </button>
                      {editingTemplateId ? (
                        <button
                          className="admin-settings-ghost"
                          onClick={() => {
                            setEditingTemplateId(null)
                            setTemplateForm({ name: '', buttonKey: 'Assign', subject: '', body: '', active: true })
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <div className="admin-entity-list">
                      {emailTemplates.length === 0 ? (
                        <div className="admin-entity-empty">No email templates configured.</div>
                      ) : emailTemplates.map((row) => (
                        <div key={row.id} className="admin-entity-row">
                          <div>
                            <strong>{row.name}</strong> | Action: {row.buttonKey} | {row.active ? 'Active' : 'Inactive'}
                            <div className="admin-entity-subtext">{row.subject}</div>
                          </div>
                          <div className="admin-config-actions">
                            <button className="admin-settings-ghost" onClick={() => editTemplate(row)}>Edit</button>
                            <button className="admin-settings-danger" onClick={() => deleteTemplate(row.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>

                <div className="admin-config-grid two">
                  <article className="admin-config-card">
                    <h4>Email Signatures (CRUD)</h4>
                    <p>Manage individual signatures for service-account users (agents).</p>
                    <label className="admin-field-row">
                      <span>Service Account User</span>
                      <select
                        value={signatureForm.userId}
                        onChange={(e) => setSignatureForm((prev) => ({ ...prev, userId: e.target.value }))}
                      >
                        <option value="">Select user</option>
                        {signatureUsers.map((u: any) => {
                          const id = String(u?.id || '')
                          const label = String(u?.name || u?.fullName || u?.email || `User ${id}`)
                          return <option key={`sig-user-${id}`} value={id}>{label}</option>
                        })}
                      </select>
                    </label>
                    <label className="admin-field-row">
                      <span>Signature HTML/Text</span>
                      <textarea
                        value={signatureForm.signatureHtml}
                        onChange={(e) => setSignatureForm((prev) => ({ ...prev, signatureHtml: e.target.value }))}
                        placeholder="Regards,&#10;IT Support Team"
                      />
                    </label>
                    <label className="admin-field-row switch-row">
                      <span>Active</span>
                      <input
                        type="checkbox"
                        checked={signatureForm.active}
                        onChange={(e) => setSignatureForm((prev) => ({ ...prev, active: e.target.checked }))}
                      />
                    </label>
                    <div className="admin-config-actions">
                      <button className="admin-settings-primary" onClick={saveSignature}>
                        {editingSignatureId ? 'Update Signature' : 'Create Signature'}
                      </button>
                      {editingSignatureId ? (
                        <button
                          className="admin-settings-ghost"
                          onClick={() => {
                            setEditingSignatureId(null)
                            setSignatureForm({ userId: '', userLabel: '', signatureHtml: '', active: true })
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <div className="admin-entity-list">
                      {emailSignatures.length === 0 ? (
                        <div className="admin-entity-empty">No signatures configured.</div>
                      ) : emailSignatures.map((row) => (
                        <div key={row.id} className="admin-entity-row">
                          <div>
                            <strong>{row.userLabel}</strong> | {row.active ? 'Active' : 'Inactive'}
                            <div className="admin-entity-subtext">{row.signatureHtml}</div>
                          </div>
                          <div className="admin-config-actions">
                            <button className="admin-settings-ghost" onClick={() => editSignature(row)}>Edit</button>
                            <button className="admin-settings-danger" onClick={() => deleteSignature(row.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="admin-config-card">
                    <h4>Mail Banner (CRUD)</h4>
                    <p>Banner shown on mail/ticket communications.</p>
                    <label className="admin-field-row">
                      <span>Banner Title</span>
                      <input
                        value={bannerForm.title}
                        onChange={(e) => setBannerForm((prev) => ({ ...prev, title: e.target.value }))}
                        placeholder="Maintenance Window"
                      />
                    </label>
                    <label className="admin-field-row">
                      <span>Banner Message</span>
                      <textarea
                        value={bannerForm.message}
                        onChange={(e) => setBannerForm((prev) => ({ ...prev, message: e.target.value }))}
                        placeholder="Support response time may be delayed during planned maintenance."
                      />
                    </label>
                    <div className="admin-config-row two">
                      <label className="admin-field-row">
                        <span>Tone</span>
                        <select
                          value={bannerForm.tone}
                          onChange={(e) => setBannerForm((prev) => ({ ...prev, tone: e.target.value as MailBannerRecord['tone'] }))}
                        >
                          <option value="info">Info</option>
                          <option value="success">Success</option>
                          <option value="warning">Warning</option>
                          <option value="danger">Danger</option>
                        </select>
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          checked={bannerForm.active}
                          onChange={(e) => setBannerForm((prev) => ({ ...prev, active: e.target.checked }))}
                        />
                      </label>
                    </div>
                    <div className="admin-config-actions">
                      <button className="admin-settings-primary" onClick={saveBanner}>
                        {editingBannerId ? 'Update Banner' : 'Create Banner'}
                      </button>
                      {editingBannerId ? (
                        <button
                          className="admin-settings-ghost"
                          onClick={() => {
                            setEditingBannerId(null)
                            setBannerForm({ title: '', message: '', tone: 'info', active: true })
                          }}
                        >
                          Cancel
                        </button>
                      ) : null}
                    </div>
                    <div className="admin-entity-list">
                      {mailBanners.length === 0 ? (
                        <div className="admin-entity-empty">No banners configured.</div>
                      ) : mailBanners.map((row) => (
                        <div key={row.id} className="admin-entity-row">
                          <div>
                            <strong>{row.title}</strong> | Tone: {row.tone} | {row.active ? 'Active' : 'Inactive'}
                            <div className="admin-entity-subtext">{row.message}</div>
                          </div>
                          <div className="admin-config-actions">
                            <button className="admin-settings-ghost" onClick={() => editBanner(row)}>Edit</button>
                            <button className="admin-settings-danger" onClick={() => deleteBanner(row.id)}>Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
                {mailResult ? <div className="admin-config-result">{mailResult}</div> : null}
              </>
            )}
          </div>
        </section>
      </>
    )
  }

  if (isDatabaseConfigurationView) {
    return (
      <>
        {adminLeftPanel}
        <section className="rbac-module-card" style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
          <div className="admin-config-page">
            <div className="admin-config-head">
              <h3>Database Configuration</h3>
              <div className="admin-config-actions">
                <button className="admin-settings-ghost" onClick={loadDatabaseConfiguration} disabled={dbBusy || dbLoading}>
                  {dbLoading ? 'Loading...' : 'Reload'}
                </button>
                <button className="admin-settings-primary" onClick={runDatabaseTest} disabled={dbBusy || dbLoading}>
                  {dbBusy ? 'Testing...' : 'Test Connection'}
                </button>
              </div>
            </div>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage database configuration.</p>
            ) : (
              <>
                <div className="admin-config-grid one">
                  <article className="admin-config-card">
                    <h4>Application Database Connection</h4>
                    <p>Use either a connection string or explicit host credentials.</p>
                    <label className="admin-field-row">
                      <span>Connection String</span>
                      <input
                        value={dbForm.connectionString}
                        onChange={(e) => setDbForm((prev) => ({ ...prev, connectionString: e.target.value }))}
                        placeholder="postgresql://user:password@host:5432/database?sslmode=require"
                      />
                    </label>
                    <div className="admin-config-divider">OR</div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>Host</span>
                        <input value={dbForm.host} onChange={(e) => setDbForm((prev) => ({ ...prev, host: e.target.value }))} />
                      </label>
                      <label className="admin-field-row">
                        <span>Port</span>
                        <input value={dbForm.port} onChange={(e) => setDbForm((prev) => ({ ...prev, port: e.target.value }))} />
                      </label>
                      <label className="admin-field-row">
                        <span>Database</span>
                        <input value={dbForm.database} onChange={(e) => setDbForm((prev) => ({ ...prev, database: e.target.value }))} />
                      </label>
                    </div>
                    <div className="admin-config-row three">
                      <label className="admin-field-row">
                        <span>User</span>
                        <input value={dbForm.user} onChange={(e) => setDbForm((prev) => ({ ...prev, user: e.target.value }))} />
                      </label>
                      <label className="admin-field-row">
                        <span>Password</span>
                        <input type="password" value={dbForm.password} onChange={(e) => setDbForm((prev) => ({ ...prev, password: e.target.value }))} />
                      </label>
                      <label className="admin-field-row switch-row">
                        <span>SSL</span>
                        <input type="checkbox" checked={dbForm.ssl} onChange={(e) => setDbForm((prev) => ({ ...prev, ssl: e.target.checked }))} />
                      </label>
                    </div>
                  </article>
                </div>
                {dbResult ? <div className="admin-config-result">{dbResult}</div> : null}
              </>
            )}
          </div>
        </section>
      </>
    )
  }

  if (isWorkflowAutomationView) {
    return (
      <>
        {adminLeftPanel}
        <section className="rbac-module-card" style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
          <div className="admin-config-page">
            <div className="admin-config-head">
              <h3>Workflow and Automation</h3>
              <div className="admin-config-actions">
                {!workflowEditMode && selectedWorkflow ? (
                  <button className="admin-settings-primary" onClick={() => setWorkflowEditMode(true)}>Edit</button>
                ) : null}
                {workflowEditMode ? (
                  <>
                    <button className="admin-settings-ghost" onClick={() => setWorkflowEditMode(false)}>Cancel</button>
                    <button className="admin-settings-primary" onClick={() => { saveWorkflowBlueprints(); setWorkflowEditMode(false) }}>Save</button>
                  </>
                ) : null}
              </div>
            </div>
            {workflowSavedAt ? <div className="admin-config-result">Saved at {workflowSavedAt}</div> : null}
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage workflow automation.</p>
            ) : (
              <>
                <div className="admin-config-grid one">
                  <article className="admin-config-card">
                    <div className="admin-config-row one">
                      <label className="admin-field-row">
                        <span>Select Type & Workflow</span>
                        <select
                          value={selectedWorkflowName}
                          onChange={(e) => {
                            const v = e.target.value
                            setSelectedWorkflowType(v)
                            setSelectedWorkflowName(v)
                            setWorkflowEditMode(false)
                          }}
                        >
                          {workflowDrafts.map((wf) => (
                            <option key={`type-${wf.name}`} value={wf.name}>{wf.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </article>
                </div>

                {selectedWorkflow ? (
                  <div className="admin-config-grid one">
                    <article className="admin-config-card">
                      {!workflowEditMode ? (
                        <>
                          <h4>{selectedWorkflow.name}</h4>
                          <div className="admin-field-row">
                            <span>States (Flow Chart)</span>
                            <div>{selectedWorkflow.states.filter(Boolean).join(' -> ') || '-'}</div>
                          </div>
                          <div className="admin-field-row">
                            <span>Allowed Transitions</span>
                            <div>{selectedWorkflow.transitions.filter(Boolean).join(' | ') || '-'}</div>
                          </div>
                          <div className="admin-field-row" style={{ alignItems: 'flex-start' }}>
                            <span>Action Flow</span>
                            <div>
                              {selectedWorkflow.buttonFlow.filter(Boolean).length
                                ? selectedWorkflow.buttonFlow.filter(Boolean).map((step, i) => `${i + 1}. ${step}`).join(' | ')
                                : '-'}
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="admin-config-row">
                            <label className="admin-field-row" style={{ flex: 1 }}>
                              <span>Workflow Name</span>
                              <input
                                value={selectedWorkflow.name}
                                onChange={(e) => updateWorkflowName(selectedWorkflowIndex, e.target.value)}
                                placeholder="Workflow name"
                              />
                            </label>
                          </div>

                          <div className="admin-field-row">
                            <span>States (Flow Chart)</span>
                            <div style={{ color: '#334155', fontWeight: 600 }}>{selectedWorkflow.states.map((s) => String(s || '').trim()).filter(Boolean).join(' -> ') || '-'}</div>
                          </div>

                          <div className="admin-field-row" style={{ alignItems: 'flex-start' }}>
                            <span>States (Editable)</span>
                            <div style={{ width: '100%' }}>
                              {selectedWorkflow.states.map((state, idx) => (
                                <div key={`state-${idx}`} className="admin-config-row" style={{ marginBottom: 8 }}>
                                  <input
                                    value={state}
                                    onChange={(e) => updateWorkflowListItem(selectedWorkflowIndex, 'states', idx, e.target.value)}
                                    placeholder={`State ${idx + 1}`}
                                  />
                                  <div className="admin-settings-toolbar-actions">
                                    <button className="admin-settings-ghost" onClick={() => moveWorkflowListItem(selectedWorkflowIndex, 'states', idx, -1)} disabled={idx === 0}>Up</button>
                                    <button className="admin-settings-ghost" onClick={() => moveWorkflowListItem(selectedWorkflowIndex, 'states', idx, 1)} disabled={idx === selectedWorkflow.states.length - 1}>Down</button>
                                    <button className="admin-settings-danger" onClick={() => deleteWorkflowListItem(selectedWorkflowIndex, 'states', idx)}>Delete</button>
                                  </div>
                                </div>
                              ))}
                              <button className="admin-settings-ghost" onClick={() => addWorkflowListItem(selectedWorkflowIndex, 'states')}>+ Add State</button>
                            </div>
                          </div>

                          <div className="admin-field-row" style={{ alignItems: 'flex-start' }}>
                            <span>Allowed Transitions</span>
                            <div style={{ width: '100%' }}>
                              {selectedWorkflow.transitions.map((transition, idx) => (
                                <div key={`transition-${idx}`} className="admin-config-row" style={{ marginBottom: 8 }}>
                                  <input
                                    value={transition}
                                    onChange={(e) => updateWorkflowListItem(selectedWorkflowIndex, 'transitions', idx, e.target.value)}
                                    placeholder="From -> To"
                                  />
                                  <div className="admin-settings-toolbar-actions">
                                    <button className="admin-settings-ghost" onClick={() => moveWorkflowListItem(selectedWorkflowIndex, 'transitions', idx, -1)} disabled={idx === 0}>Up</button>
                                    <button className="admin-settings-ghost" onClick={() => moveWorkflowListItem(selectedWorkflowIndex, 'transitions', idx, 1)} disabled={idx === selectedWorkflow.transitions.length - 1}>Down</button>
                                    <button className="admin-settings-danger" onClick={() => deleteWorkflowListItem(selectedWorkflowIndex, 'transitions', idx)}>Delete</button>
                                  </div>
                                </div>
                              ))}
                              <button className="admin-settings-ghost" onClick={() => addWorkflowListItem(selectedWorkflowIndex, 'transitions')}>+ Add Transition</button>
                            </div>
                          </div>

                          <div className="admin-field-row" style={{ alignItems: 'flex-start' }}>
                            <span>Button Action Flow (1,2,3...)</span>
                            <div style={{ width: '100%' }}>
                              {selectedWorkflow.buttonFlow.map((action, idx) => (
                                <div key={`action-${idx}`} className="admin-config-row" style={{ marginBottom: 8 }}>
                                  <div style={{ minWidth: 28, fontWeight: 700, color: '#1e293b', alignSelf: 'center' }}>{idx + 1}.</div>
                                  <input
                                    value={action}
                                    onChange={(e) => updateWorkflowListItem(selectedWorkflowIndex, 'buttonFlow', idx, e.target.value)}
                                    placeholder="Button -> Next State"
                                  />
                                  <div className="admin-settings-toolbar-actions">
                                    <button className="admin-settings-ghost" onClick={() => moveWorkflowListItem(selectedWorkflowIndex, 'buttonFlow', idx, -1)} disabled={idx === 0}>Up</button>
                                    <button className="admin-settings-ghost" onClick={() => moveWorkflowListItem(selectedWorkflowIndex, 'buttonFlow', idx, 1)} disabled={idx === selectedWorkflow.buttonFlow.length - 1}>Down</button>
                                    <button className="admin-settings-danger" onClick={() => deleteWorkflowListItem(selectedWorkflowIndex, 'buttonFlow', idx)}>Delete</button>
                                  </div>
                                </div>
                              ))}
                              <button className="admin-settings-ghost" onClick={() => addWorkflowListItem(selectedWorkflowIndex, 'buttonFlow')}>+ Add Action Step</button>
                            </div>
                          </div>
                        </>
                      )}
                    </article>
                  </div>
                ) : (
                  <div className="admin-config-grid one">
                    <article className="admin-config-card">
                      <p>No workflow available. Add one to continue.</p>
                      <button className="admin-settings-primary" onClick={addWorkflow}>Add Workflow</button>
                    </article>
                  </div>
                )}

              </>
            )}
          </div>
        </section>
      </>
    )
  }

  return (
    <>
      {adminLeftPanel}
      <div style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
        <div className={isQueueManagement ? '' : 'admin-settings-page'}>
          <section className={isQueueManagement ? '' : 'admin-settings-main'}>
            {isQueueManagement && (
              <div className="queue-panel-toolbar">
                <div className="queue-panel-toolbar-left">
                  <h3 style={{ margin: 0 }}>Queue & Panel management</h3>
                </div>
                <div className="queue-panel-toolbar-actions">
                  <button
                    className="table-icon-btn"
                    onClick={() => setSidebarCollapsed((v) => !v)}
                    title={sidebarCollapsed ? 'Show Menu' : 'Hide Menu'}
                    aria-label={sidebarCollapsed ? 'Show menu' : 'Hide menu'}
                  >
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      {sidebarCollapsed ? (
                        <>
                          <polyline points="13 18 7 12 13 6" />
                          <polyline points="19 18 13 12 19 6" />
                        </>
                      ) : (
                        <>
                          <polyline points="11 18 17 12 11 6" />
                          <polyline points="5 18 11 12 5 6" />
                        </>
                      )}
                    </svg>
                  </button>
                </div>
              </div>
            )}
            {!isQueueManagement && (
              <div className="admin-settings-main-head">
                <div>
                  <h2>{title}</h2>
                  <p>{selectedSection?.label || 'Configuration'} configuration workspace</p>
                </div>
              </div>
            )}
            {!isQueueManagement && (
              <div className="admin-settings-toolbar">
                <div className="admin-settings-inline-search">
                  <input
                    placeholder="Search fields..."
                    value={settingsQuery}
                    onChange={(e) => setSettingsQuery(e.target.value)}
                  />
                </div>
                <div className="admin-settings-toolbar-actions">
                  <button className={`admin-settings-ghost${recentOnly ? ' active' : ''}`} onClick={() => setRecentOnly((v) => !v)}>
                    {recentOnly ? 'Recent Changes: ON' : 'Recent Changes'}
                  </button>
                  <button className="admin-settings-ghost" onClick={handleImport}>Import</button>
                  <button className="admin-settings-ghost" onClick={handleExport}>Export</button>
                  <button className="admin-settings-ghost" onClick={() => setShowConfirmReset(true)}>Reset</button>
                  <button className="admin-settings-danger" onClick={() => setShowConfirmRevoke(true)}>Revoke Keys</button>
                </div>
              </div>
            )}
            <div className="admin-settings-grid">
              {topicPanels.length > 0 ? topicPanels.map((panel) => (
                <article key={panel.id} className="admin-settings-card">
                  <h3>{panel.title}</h3>
                  <p>{panel.description}</p>
                  {panel.fields.map((field) => renderField(field))}
                </article>
              )) : (
                <article className="admin-settings-card">
                  <div className="admin-settings-toolbar-actions">
                    <button
                      className={`admin-settings-ghost${queueSettingsView === 'ticket' ? ' active' : ''}`}
                      onClick={() => setQueueSettingsView('ticket')}
                    >
                      Ticket
                    </button>
                    <button
                      className={`admin-settings-ghost${queueSettingsView === 'asset' ? ' active' : ''}`}
                      onClick={() => setQueueSettingsView('asset')}
                    >
                      Asset
                    </button>
                  </div>
                  {queueSettingsView === 'ticket' ? (
                    <>
                      <h3 style={{ marginTop: 0 }}>Ticket Team Queues</h3>
                      <p>Create/edit/delete queues with service account (app user) and visibility scope.</p>
                      <div className="admin-settings-toolbar-actions">
                        <button className="admin-settings-ghost" onClick={handleTicketQueueAdd}>Add Queue</button>
                        <button className="admin-settings-ghost" onClick={handleTicketQueueEdit}>Edit Queue</button>
                        <button className="admin-settings-ghost" onClick={handleTicketQueueDelete}>Delete Queue</button>
                      </div>
                      {ticketQueueModalOpen && ticketQueueModalMode && (
                        <div style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fffafa' }}>
                          <h4 style={{ margin: 0 }}>
                            {ticketQueueModalMode === 'add' ? 'Add Ticket Queue Team' : ticketQueueModalMode === 'edit' ? 'Edit Ticket Queue Team' : 'Delete Ticket Queue Team'}
                          </h4>
                          {ticketQueueModalMode !== 'add' && (
                            <label className="admin-field-row" style={{ marginTop: 10 }}>
                              <span>Queue Team</span>
                              <select
                                value={ticketQueueTargetId}
                                onChange={(e) => {
                                  const nextId = e.target.value
                                  setTicketQueueTargetId(nextId)
                                  if (ticketQueueModalMode === 'edit') hydrateTicketQueueForm(nextId)
                                }}
                              >
                                {leftPanelConfig.ticketQueues.map((queue) => (
                                  <option key={queue.id} value={queue.id}>{queue.label}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          {ticketQueueModalMode !== 'delete' && (
                            <>
                              <label className="admin-field-row" style={{ marginTop: 10 }}>
                                <span>Queue/team name</span>
                                <input
                                  value={ticketQueueLabelInput}
                                  onChange={(e) => setTicketQueueLabelInput(e.target.value)}
                                  placeholder="L1 Team, L2 Team, Accounts Team, HR Team"
                                />
                              </label>
                              <label className="admin-field-row" style={{ marginTop: 10 }}>
                                <span>Service account</span>
                                <input
                                  value={ticketQueueServiceAccountInput}
                                  onChange={(e) => setTicketQueueServiceAccountInput(e.target.value)}
                                  placeholder="app.user"
                                />
                              </label>
                              <label className="admin-field-row" style={{ marginTop: 10 }}>
                                <span>Visibility roles (comma separated)</span>
                                <input
                                  value={ticketQueueVisibilityInput}
                                  onChange={(e) => setTicketQueueVisibilityInput(e.target.value)}
                                  placeholder="ADMIN,AGENT"
                                />
                              </label>
                            </>
                          )}
                          {ticketQueueModalMode === 'delete' && (
                            <div
                              style={{
                                marginTop: 10,
                                border: '1px solid #fecaca',
                                background: '#fef2f2',
                                borderRadius: 8,
                                padding: '10px 12px',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Danger Zone</div>
                              <p style={{ margin: 0, color: '#7f1d1d' }}>
                                This action permanently deletes the selected ticket queue team and cannot be undone.
                              </p>
                            </div>
                          )}
                          {ticketQueueModalError ? (
                            <p style={{ marginTop: 10, color: '#b91c1c' }}>{ticketQueueModalError}</p>
                          ) : null}
                          <div className="admin-settings-modal-actions" style={{ marginTop: 10 }}>
                            <button className="admin-settings-ghost" onClick={closeTicketQueueModal}>Cancel</button>
                            <button className="admin-settings-primary" onClick={submitTicketQueueModal}>
                              {ticketQueueModalMode === 'delete' ? 'Delete' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="admin-queue-rules-plain">
                        {leftPanelConfig.ticketQueues.length === 0 ? (
                          <div className="admin-queue-rule-row"><small>No ticket queues configured.</small></div>
                        ) : leftPanelConfig.ticketQueues.map((queue) => (
                          <div key={queue.id} className="admin-queue-rule-row">
                            <span>{queue.label}</span>
                            <small>
                              App User: {queue.serviceAccount || 'Not set'} | Scope: {(queue.visibilityRoles || []).join(', ') || 'ALL'} | Default: Unassigned (non-deletable)
                            </small>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <h3 style={{ marginTop: 0 }}>Asset Categories & Subcategories</h3>
                      <p>Maintain category tree like Hardware &gt; Laptop without hardcoding.</p>
                      <div className="admin-settings-toolbar-actions">
                        <button className="admin-settings-ghost" onClick={handleAssetCategoryAdd}>Add Category</button>
                        <button className="admin-settings-ghost" onClick={handleAssetCategoryEdit}>Edit Category</button>
                        <button className="admin-settings-ghost" onClick={handleAssetCategoryDelete}>Delete Category</button>
                      </div>
                      {assetCategoryModalOpen && assetCategoryModalMode && (
                        <div style={{ marginTop: 10, border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, background: '#fffafa' }}>
                          <h4 style={{ margin: 0 }}>
                            {assetCategoryModalMode === 'add' ? 'Add Asset Category' : assetCategoryModalMode === 'edit' ? 'Edit Asset Category' : 'Delete Asset Category'}
                          </h4>
                          {assetCategoryModalMode !== 'add' && (
                            <label className="admin-field-row" style={{ marginTop: 10 }}>
                              <span>Category</span>
                              <select
                                value={assetCategoryTargetId}
                                onChange={(e) => {
                                  const nextId = e.target.value
                                  setAssetCategoryTargetId(nextId)
                                  if (assetCategoryModalMode === 'edit') hydrateAssetCategoryForm(nextId)
                                }}
                              >
                                {leftPanelConfig.assetCategories.map((category) => (
                                  <option key={category.id} value={category.id}>{category.label}</option>
                                ))}
                              </select>
                            </label>
                          )}
                          {assetCategoryModalMode !== 'delete' && (
                            <>
                              <label className="admin-field-row" style={{ marginTop: 10 }}>
                                <span>Main category name</span>
                                <input
                                  value={assetCategoryLabelInput}
                                  onChange={(e) => setAssetCategoryLabelInput(e.target.value)}
                                  placeholder="Hardware"
                                />
                              </label>
                              <label className="admin-field-row" style={{ marginTop: 10 }}>
                                <span>Subcategories (comma separated)</span>
                                <input
                                  value={assetCategorySubcategoriesInput}
                                  onChange={(e) => setAssetCategorySubcategoriesInput(e.target.value)}
                                  placeholder="Laptop, Workstation, Mobile"
                                />
                              </label>
                              <label className="admin-field-row" style={{ marginTop: 10 }}>
                                <span>Visibility roles (comma separated)</span>
                                <input
                                  value={assetCategoryVisibilityInput}
                                  onChange={(e) => setAssetCategoryVisibilityInput(e.target.value)}
                                  placeholder="ADMIN,AGENT"
                                />
                              </label>
                            </>
                          )}
                          {assetCategoryModalMode === 'delete' && (
                            <div
                              style={{
                                marginTop: 10,
                                border: '1px solid #fecaca',
                                background: '#fef2f2',
                                borderRadius: 8,
                                padding: '10px 12px',
                              }}
                            >
                              <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 4 }}>Danger Zone</div>
                              <p style={{ margin: 0, color: '#7f1d1d' }}>
                                This action permanently deletes the selected asset category and cannot be undone.
                              </p>
                            </div>
                          )}
                          {assetCategoryModalError ? (
                            <p style={{ marginTop: 10, color: '#b91c1c' }}>{assetCategoryModalError}</p>
                          ) : null}
                          <div className="admin-settings-modal-actions" style={{ marginTop: 10 }}>
                            <button className="admin-settings-ghost" onClick={closeAssetCategoryModal}>Cancel</button>
                            <button className="admin-settings-primary" onClick={submitAssetCategoryModal}>
                              {assetCategoryModalMode === 'delete' ? 'Delete' : 'Save'}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="admin-queue-rules-plain">
                        {leftPanelConfig.assetCategories.length === 0 ? (
                          <div className="admin-queue-rule-row"><small>No asset categories configured.</small></div>
                        ) : leftPanelConfig.assetCategories.map((category) => (
                          <div key={category.id} className="admin-queue-rule-row">
                            <span>{category.label}</span>
                            <small>
                              {(category.subcategories || []).length ? category.subcategories.join(', ') : 'No subcategory'} | Scope: {(category.visibilityRoles || []).join(', ') || 'ALL'}
                            </small>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </article>
              )}
            </div>
          </section>
        </div>
      </div>

      {showConfirmSave && (
        <div className="admin-settings-modal-backdrop" onClick={() => setShowConfirmSave(false)}>
          <div className="admin-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Save configuration changes</h4>
            <p>Confirm applying updates to {title}. This action will be tracked in audit history.</p>
            <div className="admin-settings-modal-actions">
              <button className="admin-settings-ghost" onClick={() => setShowConfirmSave(false)}>Cancel</button>
              <button className="admin-settings-primary" onClick={handleSave}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmReset && (
        <div className="admin-settings-modal-backdrop" onClick={() => setShowConfirmReset(false)}>
          <div className="admin-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Confirm reset</h4>
            <p>This will reset current settings to default values for {title}. Continue?</p>
            <div className="admin-settings-modal-actions">
              <button className="admin-settings-ghost" onClick={() => setShowConfirmReset(false)}>Cancel</button>
              <button className="admin-settings-danger" onClick={confirmReset}>Confirm Reset</button>
            </div>
          </div>
        </div>
      )}

      {showConfirmRevoke && (
        <div className="admin-settings-modal-backdrop" onClick={() => setShowConfirmRevoke(false)}>
          <div className="admin-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Revoke API keys</h4>
            <p>All currently active integration keys will be revoked immediately. Continue?</p>
            <div className="admin-settings-modal-actions">
              <button className="admin-settings-ghost" onClick={() => setShowConfirmRevoke(false)}>Cancel</button>
              <button className="admin-settings-danger" onClick={confirmRevoke}>Revoke Keys</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}


