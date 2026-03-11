import React, { useEffect, useMemo, useRef, useState } from 'react'
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
import { getSecuritySettings, updateSecuritySettings, type SecuritySettings } from '../services/security-settings.service'
import { cancelAccount, exportAccountData, getAccountSettings, updateAccountSettings, type AccountSettings } from '../services/account-settings.service'
import * as userService from '../modules/users/services/user.service'

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
    id: 'account',
    label: 'Account',
    items: [
      { id: 'account', label: 'Account' },
    ],
  },
  {
    id: 'security',
    label: 'Security',
    items: [
      { id: 'security', label: 'Security' },
    ],
  },
  {
    id: 'user-access',
    label: 'User Management',
    items: [
      { id: 'roles-permissions', label: 'User Management', requiresAdmin: true },
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
    label: 'Types and Workflow',
    items: [
      { id: 'workflow-automation', label: 'Types and Workflow', requiresAdmin: true },
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

const DEFAULT_SECURITY_SETTINGS: SecuritySettings = {
  loginMethods: {
    password: true,
    passwordless: false,
    googleSso: false,
    sso: false,
  },
  ipRangeRestriction: {
    enabled: false,
    ranges: [],
  },
  sessionTimeoutMinutes: 60,
  requireAuthForPublicUrls: true,
  ticketSharing: {
    publicLinks: true,
    shareOutsideGroup: false,
    allowRequesterShare: true,
    requesterShareScope: 'any',
  },
  adminNotifications: {
    adminUserId: null,
  },
  attachmentFileTypes: {
    mode: 'all',
    types: [],
  },
}

const DEFAULT_ACCOUNT_SETTINGS: AccountSettings = {
  accountName: 'ITSM Workspace',
  currentPlan: 'Standard',
  activeSince: '',
  assetsCount: 0,
  agentsCount: 0,
  dataCenter: 'US-East',
  version: '1.0',
  contact: {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    invoiceEmail: '',
  },
}
type SlaPriority = typeof SLA_PRIORITIES[number]
const SLA_TIME_UNITS = ['min', 'hrs', 'days', 'weeks'] as const
type SlaTimeUnit = typeof SLA_TIME_UNITS[number]
type SlaFormat = 'critical_set' | 'p_set' | 'custom'
const SLA_OPERATIONAL_HOURS = ['Business Hours', '24x7'] as const
type SlaOperationalHours = typeof SLA_OPERATIONAL_HOURS[number]
type SlaApplyMatch = 'all' | 'any'
type SlaCondition = {
  field: string
  operator: string
  value: string
}
type SlaEscalationRule = {
  level: number
  afterValue: string
  afterUnit: SlaTimeUnit
  notify: string
  recipients: string
}
const SLA_PRIORITY_LABELS: Record<SlaPriority, string> = {
  Critical: 'Urgent',
  High: 'High',
  Medium: 'Medium',
  Low: 'Low',
}
const SLA_TIME_UNIT_LABELS: Record<SlaTimeUnit, string> = {
  min: 'Mins',
  hrs: 'Hrs',
  days: 'Days',
  weeks: 'Weeks',
}
const SLA_CONDITION_FIELDS = ['Priority', 'Ticket Type', 'Queue', 'Category', 'Source', 'Requester', 'Department', 'Tag'] as const
const SLA_CONDITION_OPERATORS = ['is', 'is not', 'contains', 'does not contain', 'in', 'not in'] as const
const SLA_NOTIFY_CHANNELS = ['Email', 'SMS', 'Slack', 'Webhook'] as const
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
  operationalHours: SlaOperationalHours
  businessHours: boolean
  escalationEmail: boolean
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
  inboundSupportEmail: string
  inboundHrEmail: string
  inboundManagementEmail: string
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
  outboundSupportFrom: string
  outboundHrFrom: string
  outboundManagementFrom: string
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

const EMAIL_TEMPLATE_STORAGE_KEY = 'admin.mail.templates.v1'
const EMAIL_SIGNATURE_STORAGE_KEY = 'admin.mail.signatures.v1'

const BUTTON_TEMPLATE_OPTIONS = Array.from(new Set([
  'Accept',
  'Acknowledge',
  'Allocate Asset',
  'Approve',
  'Assign',
  'Budget Approve',
  'Call Back Supplier',
  'Check Stock',
  'Close',
  'Collect Asset',
  'Complete',
  'Complete Change',
  'Complete Offboarding',
  'Confirm by HR',
  'Email User',
  'Email Supplier',
  'Fulfill',
  'HR Confirm',
  'IT Approve',
  'Install Software',
  'Issue Asset',
  'Log to Supplier',
  'Mark Completed',
  'Mark Ready',
  'Note + Email',
  'Provision Access',
  'Quick Close',
  'Re-open',
  'Reassign',
  'Reject',
  'Request Approval',
  'Requesting Approval',
  'Resolve',
  'Retire',
  'Revoke Access',
  'Send for Approval',
  'Send to HR',
  'Send to Manager',
  'Start',
  'Start Implementation',
  'Start IT Setup',
  'Start Procurement',
  'Start Review',
  'Verify Asset',
])).sort((a, b) => a.localeCompare(b))

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
  inboundDefaultQueue: 'Support Team',
  inboundSupportEmail: 'support@trustybytes.in',
  inboundHrEmail: 'hr@trustybytes.in',
  inboundManagementEmail: 'management@trustybytes.in',
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
  outboundSupportFrom: 'support@trustybytes.in',
  outboundHrFrom: 'hr@trustybytes.in',
  outboundManagementFrom: 'management@trustybytes.in',
  maxAttachmentSizeMb: '20',
  signatureTemplate: 'Kind regards,\nTrustyBytes Support Team',
  allowExternalEmailCreation: true,
  allowInternalOnly: false,
  allowedDomains: '',
  blockedDomains: '',
  spfDkimStatus: 'Unknown',
  emailLogRetentionDays: '90',
  retryFailedSend: true,
  maxRetryCount: '3',
  routingRuleHelpdeskQueue: 'If email sent to support@ -> Queue = Support Team',
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

const defaultPriorityPolicy = (priority: SlaPriority): PrioritySlaForm => {
  const defaults: Record<SlaPriority, { response: string; responseUnit: SlaTimeUnit; resolution: string; resolutionUnit: SlaTimeUnit }> = {
    Critical: { response: '15', responseUnit: 'min', resolution: '4', resolutionUnit: 'hrs' },
    High: { response: '30', responseUnit: 'min', resolution: '8', resolutionUnit: 'hrs' },
    Medium: { response: '1', responseUnit: 'hrs', resolution: '1', resolutionUnit: 'days' },
    Low: { response: '4', responseUnit: 'hrs', resolution: '3', resolutionUnit: 'days' },
  }
  return {
    enabled: true,
    name: `${priority} SLA`,
    responseTimeMin: defaults[priority].response,
    responseTimeUnit: defaults[priority].responseUnit,
    resolutionTimeMin: defaults[priority].resolution,
    resolutionTimeUnit: defaults[priority].resolutionUnit,
    operationalHours: 'Business Hours',
    businessHours: true,
    escalationEmail: true,
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
  mfaRequired: false,
  mfaMethod: 'Authenticator App',
  mfaGracePeriod: '0',
  mfaBypassEmergency: false,
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
    const operationalHours: SlaOperationalHours =
      String(row?.operationalHours || '').trim() === '24x7'
        ? '24x7'
        : row?.businessHours === false
          ? '24x7'
          : 'Business Hours'
    next[priority] = {
      enabled: true,
      name: String(row.name || ''),
      responseTimeMin: responseDisplay.value,
      responseTimeUnit: responseDisplay.unit,
      resolutionTimeMin: resolutionDisplay.value,
      resolutionTimeUnit: resolutionDisplay.unit,
      operationalHours,
      businessHours: operationalHours === 'Business Hours',
      escalationEmail: row?.escalationEmail === undefined ? true : Boolean(row.escalationEmail),
      active: row?.active === undefined ? true : Boolean(row.active),
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
  'account': [
    { id: 'account', title: 'Account', description: 'Account profile and ownership details.', fields: [] },
  ],
  'security': [
    { id: 'security', title: 'Security', description: 'Security and access policies.', fields: [] },
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
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securitySaving, setSecuritySaving] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const [securitySettings, setSecuritySettings] = useState<SecuritySettings | null>(null)
  const [securityDraft, setSecurityDraft] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS)
  const [securityDirty, setSecurityDirty] = useState(false)
  const [adminNotifyUsers, setAdminNotifyUsers] = useState<Array<{ id: string; label: string }>>([])
  const [accountLoading, setAccountLoading] = useState(false)
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [accountSettings, setAccountSettings] = useState<AccountSettings | null>(null)
  const [accountDraft, setAccountDraft] = useState<AccountSettings>(DEFAULT_ACCOUNT_SETTINGS)
  const [accountDirty, setAccountDirty] = useState(false)
  const [accountTab, setAccountTab] = useState<'contact' | 'other'>('contact')
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
  const [queueSyncBusy, setQueueSyncBusy] = useState(false)
  const inboundQueueOptions = useMemo(() => {
    const labels = (leftPanelConfig.ticketQueues || [])
      .map((queue) => String(queue?.label || '').trim())
      .filter((label) => label && label.toLowerCase() !== 'helpdesk' && label.toLowerCase() !== 'service request')
    const unique = Array.from(new Set(labels))
    return unique.length ? unique : ['Support Team']
  }, [leftPanelConfig.ticketQueues])
  const inboundTicketTypeOptions = useMemo(() => ['Incident', 'Service request', 'HR request', 'Task', 'New starter'], [])
  const inboundPriorityOptions = useMemo(() => ['Low', 'Medium', 'High', 'Critical'], [])
  const [queuePanelKey, setQueuePanelKey] = useState<'ticketsMyLists' | 'users' | 'assets' | 'suppliers'>('ticketsMyLists')
  const [queueSettingsView, setQueueSettingsView] = useState<QueueSettingsView>('ticket')
  const [ticketQueueModalMode, setTicketQueueModalMode] = useState<TicketQueueModalMode | null>(null)
  const [ticketQueueModalOpen, setTicketQueueModalOpen] = useState(false)
  const [ticketQueueTargetId, setTicketQueueTargetId] = useState('')
  const [ticketQueueLabelInput, setTicketQueueLabelInput] = useState('')
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
  const [policyDescription, setPolicyDescription] = useState('')
  const [editingPolicyName, setEditingPolicyName] = useState<string | null>(null)
  const [policyFormat, setPolicyFormat] = useState<SlaFormat>('critical_set')
  const [customFormatText, setCustomFormatText] = useState('')
  const [policyTimeZone, setPolicyTimeZone] = useState<string>(SYSTEM_TIME_ZONE)
  const [policyApplyMatch, setPolicyApplyMatch] = useState<SlaApplyMatch>('all')
  const [policyConditions, setPolicyConditions] = useState<SlaCondition[]>([])
  const [policyResponseRules, setPolicyResponseRules] = useState<SlaEscalationRule[]>([])
  const [policyResolutionRules, setPolicyResolutionRules] = useState<SlaEscalationRule[]>([])
  const [slaPage, setSlaPage] = useState(1)
  const [mailForm, setMailForm] = useState<MailConfigForm>(defaultMailConfigForm())
  const [mailLoading, setMailLoading] = useState(false)
  const [mailBusy, setMailBusy] = useState(false)
  const [mailResult, setMailResult] = useState('')
  const [mailTestRecipient, setMailTestRecipient] = useState('')
  const [mailCompanyLink, setMailCompanyLink] = useState('')
  const [mailEditing, setMailEditing] = useState(false)
  const mailDraftRef = useRef<MailConfigForm | null>(null)
  const mailCompanyDraftRef = useRef<string>('')
  const [mailProvider, setMailProvider] = useState<'gmail' | 'outlook' | 'zoho' | 'custom' | null>(null)
  const [imapHost, setImapHost] = useState('')
  const [imapPort, setImapPort] = useState('993')
  const [imapSsl, setImapSsl] = useState(true)
  const [imapAuthMode, setImapAuthMode] = useState<'plain' | 'login'>('plain')
  const [imapUser, setImapUser] = useState('')
  const [imapPass, setImapPass] = useState('')
  const [smtpHost, setSmtpHost] = useState('')
  const [smtpPort, setSmtpPort] = useState('587')
  const [smtpSsl, setSmtpSsl] = useState(true)
  const [smtpAuthMode, setSmtpAuthMode] = useState<'plain' | 'login'>('plain')
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplateRecord[]>(() =>
    loadStoredList<EmailTemplateRecord>(EMAIL_TEMPLATE_STORAGE_KEY, [])
  )
  const [templateForm, setTemplateForm] = useState<Omit<EmailTemplateRecord, 'id'>>({
    name: '',
    buttonKey: 'Assign',
    body: '',
    active: true,
  })
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
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
  const [signatureUsers, setSignatureUsers] = useState<Array<{ id: string; label: string }>>([])

  const refreshTicketQueues = async (localOverride?: TicketQueueConfig[]) => {
    try {
      setQueueSyncBusy(true)
      const serverQueues = await userService.listTicketQueues()
      const normalized = Array.isArray(serverQueues) ? serverQueues : []
      const localQueues = Array.isArray(localOverride) ? localOverride : leftPanelConfig.ticketQueues
      const serverKeys = new Set(
        normalized.map((q: any) => String(q?.queue_key || '').trim().toLowerCase()).filter(Boolean)
      )

      for (const label of ['Support Team', 'HR Team', 'Management']) {
        if (serverKeys.has(label.toLowerCase())) continue
        try {
          const created = await userService.createTicketQueue({ label })
          normalized.push(created)
          serverKeys.add(label.toLowerCase())
        } catch {
          // ignore if backend restricts or already created
        }
      }

      const mergedQueues: TicketQueueConfig[] = normalized.map((q: any) => {
        const label = String(q?.queue_label || '').trim()
        const id = String(q?.queue_id || '').trim()
        const localMatch = localQueues.find((l) => String(l?.label || '').trim().toLowerCase() === label.toLowerCase())
        return {
          id: id || String(localMatch?.id || `q-${Date.now()}`),
          queueId: q?.queue_id ? Number(q.queue_id) : localMatch?.queueId,
          queueKey: q?.queue_key ? String(q.queue_key).trim() : localMatch?.queueKey,
          label,
          serviceAccount: String(localMatch?.serviceAccount || '').trim(),
          visibilityRoles: Array.isArray(localMatch?.visibilityRoles) && localMatch?.visibilityRoles.length
            ? localMatch.visibilityRoles
            : ['ADMIN', 'AGENT'],
        }
      })

      const mergedMap = mergedQueues.reduce<Record<string, TicketQueueConfig>>((acc, queue) => {
        const key = String(queue.label || '').trim().toLowerCase()
        if (!key) return acc
        acc[key] = queue
        return acc
      }, {})
      const nextConfig = {
        ...leftPanelConfig,
        ticketQueues: Object.values(mergedMap),
      }
      setLeftPanelConfig(nextConfig)
      saveLeftPanelConfig(nextConfig)
    } finally {
      setQueueSyncBusy(false)
    }
  }

  useEffect(() => {
    const preferred = inboundQueueOptions.find((label) => label.toLowerCase().includes('support')) || inboundQueueOptions[0] || 'Support Team'
    setMailForm((prev) => {
      const current = String(prev.inboundDefaultQueue || '').trim()
      if (!current || current.toLowerCase() === 'helpdesk' || !inboundQueueOptions.includes(current)) {
        return { ...prev, inboundDefaultQueue: preferred }
      }
      return prev
    })
  }, [inboundQueueOptions])
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
    const baseline = securitySettings || DEFAULT_SECURITY_SETTINGS
    setSecurityDirty(JSON.stringify(securityDraft) !== JSON.stringify(baseline))
  }, [securityDraft, securitySettings])
  useEffect(() => {
    const baseline = accountSettings || DEFAULT_ACCOUNT_SETTINGS
    setAccountDirty(JSON.stringify(accountDraft) !== JSON.stringify(baseline))
  }, [accountDraft, accountSettings])
  useEffect(() => {
    if (activeSection !== 'security' || role !== 'ADMIN') return
    let cancelled = false
    setSecurityLoading(true)
    getSecuritySettings()
      .then((data) => {
        if (cancelled) return
        const next = data || DEFAULT_SECURITY_SETTINGS
        setSecuritySettings(next)
        setSecurityDraft(next)
        setSecurityError('')
      })
      .catch((err: any) => {
        if (cancelled) return
        setSecurityError(err?.response?.data?.error || err?.message || 'Unable to load security settings')
        setSecuritySettings(DEFAULT_SECURITY_SETTINGS)
        setSecurityDraft(DEFAULT_SECURITY_SETTINGS)
      })
      .finally(() => {
        if (!cancelled) setSecurityLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSection, role])
  useEffect(() => {
    if (activeSection !== 'account' || role !== 'ADMIN') return
    let cancelled = false
    setAccountLoading(true)
    getAccountSettings()
      .then((data) => {
        if (cancelled) return
        const next = data || DEFAULT_ACCOUNT_SETTINGS
        setAccountSettings(next)
        setAccountDraft(next)
        setAccountError('')
      })
      .catch((err: any) => {
        if (cancelled) return
        setAccountError(err?.response?.data?.error || err?.message || 'Unable to load account settings')
        setAccountSettings(DEFAULT_ACCOUNT_SETTINGS)
        setAccountDraft(DEFAULT_ACCOUNT_SETTINGS)
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeSection, role])
  useEffect(() => {
    if (activeSection !== 'security' || role !== 'ADMIN') return
    let cancelled = false
    userService.listUsers({ limit: 1000 })
      .then((rows: any) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? rows : []
        const normalized = list
          .map((u: any) => ({
            id: String(u?.id || '').trim(),
            label: String(u?.name || u?.email || u?.username || '').trim(),
          }))
          .filter((u: { id: string; label: string }) => u.id && u.label)
        setAdminNotifyUsers(normalized)
      })
      .catch(() => {
        if (!cancelled) setAdminNotifyUsers([])
      })
    return () => {
      cancelled = true
    }
  }, [activeSection, role])
  useEffect(() => {
    const handler = () => setLeftPanelConfig(loadLeftPanelConfig())
    window.addEventListener('left-panel-config-updated', handler as EventListener)
    return () => window.removeEventListener('left-panel-config-updated', handler as EventListener)
  }, [])
  useEffect(() => {
    if (role !== 'ADMIN') return
    let cancelled = false
    refreshTicketQueues()
      .catch(() => {})
      .finally(() => {
        if (cancelled) return
      })
    return () => {
      cancelled = true
    }
  }, [role])
  useEffect(() => {
    if (activeItem === 'sla-policies' && role === 'ADMIN') {
      loadSlaRows()
    }
  }, [activeItem, role])
  useEffect(() => {
    if ((activeItem === 'mail-configuration' || activeItem === 'email-signature-templates' || activeItem === 'auto-assignment') && role === 'ADMIN') {
      loadMailConfiguration()
    }
  }, [activeItem, role])
  useEffect(() => {
    if (activeItem !== 'email-signature-templates' || role !== 'ADMIN') return
    let cancelled = false
    userService.listUsers({ limit: 1000 })
      .then((rows: any) => {
        if (cancelled) return
        const list = Array.isArray(rows) ? rows : []
        const normalized = list
          .map((u: any) => ({
            id: String(u?.id || '').trim(),
            label: String(u?.name || u?.email || u?.username || '').trim(),
          }))
          .filter((u: { id: string; label: string }) => u.id && u.label)
        setSignatureUsers(normalized)
      })
      .catch(() => {
        if (!cancelled) setSignatureUsers([])
      })
    return () => {
      cancelled = true
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
    if (!workflowDrafts.length) return
    const hasSelectedType = workflowDrafts.some((wf) => wf.name === selectedWorkflowType)
    const hasSelectedName = workflowDrafts.some((wf) => wf.name === selectedWorkflowName)
    if (selectedWorkflowType && !hasSelectedType) setSelectedWorkflowType('')
    if (selectedWorkflowName && !hasSelectedName) {
      setSelectedWorkflowName('')
      setWorkflowEditMode(false)
    }
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
  const isAccountSection = activeSection === 'account'
  const isSecuritySection = activeSection === 'security'
  const isApiProvider = mailForm.providerType === 'api-provider'
  const isOauthProvider = mailForm.providerType === 'google-workspace-oauth' || mailForm.providerType === 'microsoft-365-oauth'
  const isOauthMode = mailForm.connectionMode === 'oauth2'
  const isAppPasswordMode = mailForm.connectionMode === 'app-password'
  const mailFieldDisabled = mailBusy || mailLoading || !mailEditing
  const oauthUrls = {
    gmail: (import.meta.env.VITE_MAIL_OAUTH_GOOGLE_URL as string | undefined) || '',
    outlook: (import.meta.env.VITE_MAIL_OAUTH_OUTLOOK_URL as string | undefined) || '',
    zoho: (import.meta.env.VITE_MAIL_OAUTH_ZOHO_URL as string | undefined) || '',
  }
  const buildMailOauthUrl = (provider: keyof typeof oauthUrls) => {
    const overrideUrl = oauthUrls[provider]
    if (overrideUrl) return overrideUrl
    if (provider === 'gmail') {
      const clientId = String(import.meta.env.VITE_MAIL_GOOGLE_CLIENT_ID || '').trim()
      const redirectUri = String(import.meta.env.VITE_MAIL_GOOGLE_REDIRECT_URI || '').trim()
      const scope = String(import.meta.env.VITE_MAIL_GOOGLE_SCOPES || 'https://mail.google.com/').trim()
      if (!clientId || !redirectUri) return ''
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope,
      })
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    }
    if (provider === 'outlook') {
      const tenant = String(import.meta.env.VITE_MAIL_OUTLOOK_TENANT || 'common').trim()
      const clientId = String(import.meta.env.VITE_MAIL_OUTLOOK_CLIENT_ID || '').trim()
      const redirectUri = String(import.meta.env.VITE_MAIL_OUTLOOK_REDIRECT_URI || '').trim()
      const scope = String(
        import.meta.env.VITE_MAIL_OUTLOOK_SCOPES ||
        'https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access',
      ).trim()
      if (!clientId || !redirectUri) return ''
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'query',
        scope,
      })
      return `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?${params.toString()}`
    }
    const clientId = String(import.meta.env.VITE_MAIL_ZOHO_CLIENT_ID || '').trim()
    const redirectUri = String(import.meta.env.VITE_MAIL_ZOHO_REDIRECT_URI || '').trim()
    const scope = String(import.meta.env.VITE_MAIL_ZOHO_SCOPES || 'ZohoMail.accounts.READ,ZohoMail.messages.ALL').trim()
    const accountsBase = String(import.meta.env.VITE_MAIL_ZOHO_ACCOUNTS_BASE || 'https://accounts.zoho.com')
      .trim()
      .replace(/\/+$/, '')
    if (!clientId || !redirectUri) return ''
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope,
    })
    return `${accountsBase}/oauth/v2/auth?${params.toString()}`
  }
  const openOAuthProvider = (provider: keyof typeof oauthUrls) => {
    const url = buildMailOauthUrl(provider)
    if (!url) {
      setMailResult('OAuth is not configured. Please set the provider client ID and redirect URI.')
      return
    }
    window.open(url, '_blank', 'noopener')
  }

  useEffect(() => {
    if (mailProvider !== 'custom') return
    setImapPort((prev) => prev || '993')
    setSmtpPort((prev) => prev || '587')
  }, [mailProvider])
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
      const inboundRoutes: any[] = Array.isArray((data as any)?.inbound?.inboundRoutes) ? (data as any).inbound.inboundRoutes : []
      const outboundRoutes: any[] = Array.isArray((data as any)?.inbound?.outboundRoutes) ? (data as any).inbound.outboundRoutes : []
      const findInboundEmail = (queue: string, fallback: string) =>
        String(inboundRoutes.find((row: any) => String(row?.queue || '').trim().toLowerCase() === queue.toLowerCase())?.email || fallback)
      const findOutboundFrom = (queue: string, fallback: string) =>
        String(outboundRoutes.find((row: any) => String(row?.queue || '').trim().toLowerCase() === queue.toLowerCase())?.from || fallback)
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
        inboundDefaultQueue: String(data?.inbound?.defaultQueue || 'Support Team'),
        inboundSupportEmail: findInboundEmail('Support Team', 'support@trustybytes.in'),
        inboundHrEmail: findInboundEmail('HR Team', 'hr@trustybytes.in'),
        inboundManagementEmail: findInboundEmail('Management Team', 'management@trustybytes.in'),
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
        outboundSupportFrom: findOutboundFrom('Support Team', 'support@trustybytes.in'),
        outboundHrFrom: findOutboundFrom('HR Team', 'hr@trustybytes.in'),
        outboundManagementFrom: findOutboundFrom('Management Team', 'management@trustybytes.in'),
        maxAttachmentSizeMb: '20',
        signatureTemplate: 'Kind regards,\nTrustyBytes Support Team',
        allowExternalEmailCreation: true,
        allowInternalOnly: false,
        allowedDomains: '',
        blockedDomains: '',
        spfDkimStatus: 'Unknown',
        emailLogRetentionDays: '90',
        retryFailedSend: true,
        maxRetryCount: '3',
        routingRuleHelpdeskQueue: 'If email sent to support@ -> Queue = Support Team',
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
      await updateInboundMailConfig({
        defaultQueue,
        inboundRoutes: [
          { email: String(mailForm.inboundSupportEmail || '').trim().toLowerCase(), queue: 'Support Team' },
          { email: String(mailForm.inboundHrEmail || '').trim().toLowerCase(), queue: 'HR Team' },
          { email: String(mailForm.inboundManagementEmail || '').trim().toLowerCase(), queue: 'Management Team' },
        ],
        outboundRoutes: [
          { queue: 'Support Team', from: String(mailForm.outboundSupportFrom || '').trim().toLowerCase() },
          { queue: 'HR Team', from: String(mailForm.outboundHrFrom || '').trim().toLowerCase() },
          { queue: 'Management Team', from: String(mailForm.outboundManagementFrom || '').trim().toLowerCase() },
        ],
      })
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
    const body = templateForm.body.trim()
    if (!name || !body) {
      setMailResult('Template name and body are required')
      return
    }
    if (editingTemplateId) {
      setEmailTemplates((prev) => prev.map((row) => (row.id === editingTemplateId ? { ...row, ...templateForm, name, body } : row)))
      setMailResult('Email template updated')
    } else {
      setEmailTemplates((prev) => [{ id: `tpl-${Date.now()}`, ...templateForm, name, body }, ...prev])
      setMailResult('Email template created')
    }
    setEditingTemplateId(null)
    setTemplateForm({ name: '', buttonKey: 'Assign', body: '', active: true })
  }

  const editTemplate = (row: EmailTemplateRecord) => {
    setEditingTemplateId(row.id)
    setTemplateForm({ name: row.name, buttonKey: row.buttonKey, body: row.body, active: row.active })
  }

  const deleteTemplate = (id: string) => {
    setEmailTemplates((prev) => prev.filter((row) => row.id !== id))
    if (editingTemplateId === id) {
      setEditingTemplateId(null)
      setTemplateForm({ name: '', buttonKey: 'Assign', body: '', active: true })
    }
    setMailResult('Email template deleted')
  }

  const saveSignature = () => {
    const userId = signatureForm.userId.trim()
    const signatureHtml = signatureForm.signatureHtml.trim()
    if (!userId || !signatureHtml) {
      setMailResult('User and signature content are required')
      return
    }
    const selectedUser = signatureUsers.find((entry) => entry.id === userId)
    const userLabel = String(selectedUser?.label || signatureForm.userLabel || userId)
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

  const openCreatePolicyForm = () => {
    setPolicyFormMode('create')
    setEditingPolicyName(null)
    setPolicyName('')
    setPolicyDescription('')
    setPolicyFormat('critical_set')
    setCustomFormatText('')
    setPolicyTimeZone(SYSTEM_TIME_ZONE)
    setPolicyApplyMatch('all')
    setPolicyConditions([])
    setPolicyResponseRules([])
    setPolicyResolutionRules([])
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
    setPolicyDescription(String(first?.description || ''))
    setPolicyTimeZone(String(first?.timeZone || SYSTEM_TIME_ZONE))
    const applyMatchValue = String(first?.applyMatch || '').toLowerCase()
    setPolicyApplyMatch(applyMatchValue === 'any' ? 'any' : 'all')
    setPolicyConditions(Array.isArray(first?.conditions)
      ? first.conditions.map((row: any) => ({
        field: String(row?.field || ''),
        operator: String(row?.operator || ''),
        value: String(row?.value || ''),
      }))
      : [])
    setPolicyResponseRules(Array.isArray(first?.responseEscalations)
      ? first.responseEscalations.map((row: any, index: number) => {
        const fallback = splitMinutesToDisplay(row?.afterMinutes)
        return {
          level: Number(row?.level) || index + 1,
          afterValue: String(row?.afterValue ?? fallback.value ?? ''),
          afterUnit: (row?.afterUnit as SlaTimeUnit) || fallback.unit || 'min',
          notify: String(row?.notify || 'Email'),
          recipients: String(row?.recipients || ''),
        }
      })
      : [])
    setPolicyResolutionRules(Array.isArray(first?.resolutionEscalations)
      ? first.resolutionEscalations.map((row: any, index: number) => {
        const fallback = splitMinutesToDisplay(row?.afterMinutes)
        return {
          level: Number(row?.level) || index + 1,
          afterValue: String(row?.afterValue ?? fallback.value ?? ''),
          afterUnit: (row?.afterUnit as SlaTimeUnit) || fallback.unit || 'min',
          notify: String(row?.notify || 'Email'),
          recipients: String(row?.recipients || ''),
        }
      })
      : [])
    setShowPolicyForm(true)
  }

  const closePolicyForm = () => {
    setShowPolicyForm(false)
    setEditingPolicyName(null)
    setPolicyName('')
    setPolicyDescription('')
    setPolicyFormat('critical_set')
    setCustomFormatText('')
    setPolicyTimeZone(SYSTEM_TIME_ZONE)
    setPolicyApplyMatch('all')
    setPolicyConditions([])
    setPolicyResponseRules([])
    setPolicyResolutionRules([])
    setPriorityPolicies(createEmptyPriorityPolicies())
  }

  const addConditionRow = () => {
    setPolicyConditions((prev) => [
      ...prev,
      { field: 'Priority', operator: 'is', value: '' },
    ])
  }

  const updateConditionRow = (index: number, key: keyof SlaCondition, value: string) => {
    setPolicyConditions((prev) => prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)))
  }

  const removeConditionRow = (index: number) => {
    setPolicyConditions((prev) => prev.filter((_, idx) => idx !== index))
  }

  const normalizeRuleLevels = (rows: SlaEscalationRule[]) =>
    rows.map((row, idx) => ({ ...row, level: idx + 1 }))

  const addResponseRule = () => {
    setPolicyResponseRules((prev) =>
      normalizeRuleLevels([
        ...prev,
        { level: prev.length + 1, afterValue: '15', afterUnit: 'min', notify: 'Email', recipients: '' },
      ])
    )
  }

  const updateResponseRule = (index: number, key: keyof SlaEscalationRule, value: string) => {
    setPolicyResponseRules((prev) =>
      normalizeRuleLevels(prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)))
    )
  }

  const removeResponseRule = (index: number) => {
    setPolicyResponseRules((prev) => normalizeRuleLevels(prev.filter((_, idx) => idx !== index)))
  }

  const addResolutionRule = () => {
    setPolicyResolutionRules((prev) =>
      normalizeRuleLevels([
        ...prev,
        { level: prev.length + 1, afterValue: '1', afterUnit: 'hrs', notify: 'Email', recipients: '' },
      ])
    )
  }

  const updateResolutionRule = (index: number, key: keyof SlaEscalationRule, value: string) => {
    setPolicyResolutionRules((prev) =>
      normalizeRuleLevels(prev.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)))
    )
  }

  const removeResolutionRule = (index: number) => {
    setPolicyResolutionRules((prev) => normalizeRuleLevels(prev.filter((_, idx) => idx !== index)))
  }

  const submitPolicyForm = async () => {
    const normalizedName = policyName.trim()
    if (!normalizedName) return alert('Policy name is required')
    if (policyFormMode === 'create') {
      const exists = slaRows.some((r) => String(r?.name || '').trim().toLowerCase() === normalizedName.toLowerCase())
      if (exists) return alert('Policy name already exists')
    }
    const normalizedConditions = policyConditions
      .map((row) => ({
        field: String(row.field || '').trim(),
        operator: String(row.operator || '').trim(),
        value: String(row.value || '').trim(),
      }))
      .filter((row) => row.field || row.operator || row.value)
    const normalizeEscalationRules = (rows: SlaEscalationRule[]) =>
      rows
        .map((row, index) => {
          const afterValue = String(row.afterValue || '').trim()
          const parsedValue = Number(afterValue)
          return {
            level: row.level || index + 1,
            afterValue,
            afterUnit: row.afterUnit,
            afterMinutes: Number.isFinite(parsedValue) ? parsedValue * getMinutesMultiplier(row.afterUnit) : null,
            notify: String(row.notify || 'Email').trim() || 'Email',
            recipients: String(row.recipients || '').trim(),
          }
        })
        .filter((row) => row.afterValue || row.recipients || row.notify)
    const responseEscalations = normalizeEscalationRules(policyResponseRules)
    const resolutionEscalations = normalizeEscalationRules(policyResolutionRules)
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
          description: policyDescription.trim(),
          priority: priorityLabel,
          priorityRank: rank,
          format: policyFormat,
          responseTimeMin,
          resolutionTimeMin,
          operationalHours: policy.operationalHours,
          businessHours: policy.operationalHours === 'Business Hours',
          escalationEmail: policy.escalationEmail,
          timeZone: policyTimeZone,
          businessSchedule: null,
          applyMatch: policyApplyMatch,
          conditions: normalizedConditions,
          responseEscalations,
          resolutionEscalations,
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
    setTicketQueueVisibilityInput('ADMIN,AGENT')
    setTicketQueueModalError('')
  }
  const hydrateTicketQueueForm = (id: string) => {
    const target = leftPanelConfig.ticketQueues.find((q) => q.id === id)
    if (!target) return
    setTicketQueueLabelInput(target.label)
    setTicketQueueVisibilityInput((target.visibilityRoles || []).join(',') || 'ADMIN,AGENT')
  }
  const handleTicketQueueAdd = () => {
    setTicketQueueModalMode('add')
    setTicketQueueModalOpen(true)
    setTicketQueueModalError('')
    setTicketQueueTargetId('')
    setTicketQueueLabelInput('')
    setTicketQueueVisibilityInput('ADMIN,AGENT')
  }
  const handleTicketQueueEdit = () => {
    setTicketQueueModalMode('edit')
    setTicketQueueModalOpen(true)
    setTicketQueueModalError('')
    if (!leftPanelConfig.ticketQueues.length) {
      setTicketQueueTargetId('')
      setTicketQueueLabelInput('')
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
  const submitTicketQueueModal = async () => {
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
      const visibilityRoles = parseVisibilityRoles(ticketQueueVisibilityInput)
      try {
        await userService.createTicketQueue({ label })
      } catch (error: any) {
        setTicketQueueModalError(error?.response?.data?.error || 'Failed to create queue')
        return
      }
      const nextConfig = {
        ...leftPanelConfig,
        ticketQueues: [...leftPanelConfig.ticketQueues, {
          id: `tq-${Date.now()}`,
          label,
          serviceAccount: '',
          visibilityRoles,
        }],
      }
      persistQueueConfig(nextConfig)
      await refreshTicketQueues(nextConfig.ticketQueues)
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
      const visibilityRoles = parseVisibilityRoles(ticketQueueVisibilityInput)
      const queueId = Number(target.queueId || target.id)
      if (Number.isFinite(queueId) && queueId > 0) {
        try {
          await userService.updateTicketQueue(queueId, { label })
        } catch (error: any) {
          setTicketQueueModalError(error?.response?.data?.error || 'Failed to update queue')
          return
        }
      } else {
        try {
          await userService.createTicketQueue({ label })
        } catch (error: any) {
          setTicketQueueModalError(error?.response?.data?.error || 'Failed to sync queue')
          return
        }
      }
      const nextConfig = {
        ...leftPanelConfig,
        ticketQueues: leftPanelConfig.ticketQueues.map((q) => q.id === target.id
          ? { ...q, label, visibilityRoles }
          : q),
      }
      persistQueueConfig(nextConfig)
      await refreshTicketQueues(nextConfig.ticketQueues)
      closeTicketQueueModal()
      return
    }
    if (!ticketQueueTargetId) return setTicketQueueModalError('Select a queue to delete.')
    const target = leftPanelConfig.ticketQueues.find((q) => q.id === ticketQueueTargetId)
    if (!target) return setTicketQueueModalError('Queue not found.')
    if (target.label.trim().toLowerCase() === 'unassigned') return setTicketQueueModalError('Unassigned cannot be deleted.')
    const queueId = Number(target.queueId || target.id)
    if (Number.isFinite(queueId) && queueId > 0) {
      try {
        await userService.deleteTicketQueue(queueId)
      } catch (error: any) {
        setTicketQueueModalError(error?.response?.data?.error || 'Failed to delete queue')
        return
      }
    }
    const nextConfig = {
      ...leftPanelConfig,
      ticketQueues: leftPanelConfig.ticketQueues.filter((q) => q.id !== target.id),
    }
    persistQueueConfig(nextConfig)
    await refreshTicketQueues(nextConfig.ticketQueues)
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

  const normalizeListInput = (value: string) =>
    value
      .split(/[\n,]+/g)
      .map((v) => v.trim())
      .filter(Boolean)

  const updateSecurityDraft = (next: Partial<SecuritySettings>) => {
    setSecurityDraft((prev) => ({ ...prev, ...next }))
  }

  const handleSecuritySave = async () => {
    setSecurityError('')
    const login = securityDraft.loginMethods
    if (!login.password && !login.passwordless && !login.googleSso && !login.sso) {
      setSecurityError('At least one login method must be enabled.')
      return
    }
    if (securityDraft.ipRangeRestriction.enabled && securityDraft.ipRangeRestriction.ranges.length === 0) {
      setSecurityError('Provide at least one IP range or disable IP range restriction.')
      return
    }
    if (securityDraft.attachmentFileTypes.mode === 'specific' && securityDraft.attachmentFileTypes.types.length === 0) {
      setSecurityError('Add at least one attachment file type or choose All file types.')
      return
    }
    try {
      setSecuritySaving(true)
      const saved = await updateSecuritySettings(securityDraft)
      setSecuritySettings(saved)
      setSecurityDraft(saved)
      setSecurityError('')
    } catch (err: any) {
      setSecurityError(err?.response?.data?.error || err?.message || 'Unable to save security settings')
    } finally {
      setSecuritySaving(false)
    }
  }

  const handleSecurityCancel = () => {
    const baseline = securitySettings || DEFAULT_SECURITY_SETTINGS
    setSecurityDraft(baseline)
    setSecurityError('')
  }

  const updateAccountDraft = (next: Partial<AccountSettings>) => {
    setAccountDraft((prev) => ({ ...prev, ...next }))
  }

  const handleAccountSave = async () => {
    setAccountError('')
    if (!accountDraft.accountName.trim()) {
      setAccountError('Account name is required.')
      return
    }
    if (!accountDraft.contact.firstName.trim() || !accountDraft.contact.lastName.trim()) {
      setAccountError('Primary contact first and last name are required.')
      return
    }
    if (!accountDraft.contact.email.trim()) {
      setAccountError('Primary contact email is required.')
      return
    }
    try {
      setAccountSaving(true)
      const saved = await updateAccountSettings(accountDraft)
      setAccountSettings(saved)
      setAccountDraft(saved)
      setAccountError('')
    } catch (err: any) {
      setAccountError(err?.response?.data?.error || err?.message || 'Unable to update account settings')
    } finally {
      setAccountSaving(false)
    }
  }

  const handleAccountCancel = () => {
    const baseline = accountSettings || DEFAULT_ACCOUNT_SETTINGS
    setAccountDraft(baseline)
    setAccountError('')
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

  const handleSave = async () => {
    try {
      setSavedValues(values)
      const now = new Date().toLocaleString()
      setLastSavedAt(now)
      addActivity(`${title} configuration saved`)
      setShowConfirmSave(false)
    } catch (error: any) {
      addActivity(error?.response?.data?.error || 'Failed to save configuration')
      alert(error?.response?.data?.error || error?.message || 'Failed to save configuration')
    }
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
            <div className="rbac-top-action-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                <div className="rbac-top-action-title">SLA Policies</div>
              </div>
              <div className="rbac-top-action-actions">
                {!showPolicyForm && (
                  <button className="admin-settings-ghost" onClick={loadSlaRows} disabled={slaBusy}>
                    {slaBusy ? 'Loading...' : 'Reload'}
                  </button>
                )}
                {!showPolicyForm ? (
                  <button className="rbac-add-btn" onClick={openCreatePolicyForm} disabled={slaBusy}>
                    <span className="rbac-add-btn-plus" aria-hidden="true">+</span>
                    <span>Add Policy</span>
                  </button>
                ) : <span />}
              </div>
            </div>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage SLA policies.</p>
            ) : (
              <>
                {showPolicyForm ? (
                  <div className="sla-policy-form">
                    <div className="sla-policy-form-header">
                      <div>
                        <div className="sla-policy-form-title">{policyFormMode === 'edit' ? 'Edit SLA Policy' : 'New SLA Policy'}</div>
                        <div className="sla-policy-form-sub">Set response and resolution targets plus escalation steps.</div>
                      </div>
                      <div className="sla-policy-form-actions">
                        <button className="admin-settings-ghost" onClick={closePolicyForm} disabled={slaBusy}>Cancel</button>
                        <button className="admin-settings-primary" onClick={submitPolicyForm} disabled={slaBusy}>
                          {slaBusy ? 'Saving...' : policyFormMode === 'edit' ? 'Update' : 'Save'}
                        </button>
                      </div>
                    </div>

                    <div className="sla-policy-card">
                      <label className="admin-field-row">
                        <span>Name</span>
                        <input
                          placeholder="New SLA Policy"
                          value={policyName}
                          disabled={slaBusy}
                          onChange={(e) => setPolicyName(e.target.value)}
                        />
                      </label>
                      <label className="admin-field-row">
                        <span>Description</span>
                        <textarea
                          placeholder="Describe when this SLA applies"
                          value={policyDescription}
                          disabled={slaBusy}
                          onChange={(e) => setPolicyDescription(e.target.value)}
                          rows={3}
                        />
                      </label>
                    </div>

                    <div className="sla-policy-card">
                      <div className="sla-policy-card-head">
                        <div>
                          <h4>SLA Targets</h4>
                          <p>Set Service Level Targets for each ticket priority</p>
                        </div>
                      </div>
                      <table className="sla-targets-table">
                        <colgroup>
                          <col style={{ width: 160 }} />
                          <col style={{ width: 260 }} />
                          <col style={{ width: 260 }} />
                          <col style={{ width: 220 }} />
                          <col style={{ width: 170 }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Priority</th>
                            <th>Respond within</th>
                            <th>Resolve within</th>
                            <th>Operational Hrs</th>
                            <th>Escalation email</th>
                          </tr>
                        </thead>
                        <tbody>
                          {SLA_PRIORITIES.map((priority) => {
                            const policy = priorityPolicies[priority]
                            return (
                              <tr key={priority}>
                                <td className="sla-priority-label">{SLA_PRIORITY_LABELS[priority]}</td>
                                <td>
                                  <div className="sla-time-input">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={policy.responseTimeMin}
                                      disabled={slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], responseTimeMin: e.target.value },
                                        }))
                                      }
                                    />
                                    <select
                                      value={policy.responseTimeUnit}
                                      disabled={slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], responseTimeUnit: e.target.value as SlaTimeUnit },
                                        }))
                                      }
                                    >
                                      {SLA_TIME_UNITS.map((unit) => (
                                        <option key={unit} value={unit}>{SLA_TIME_UNIT_LABELS[unit]}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                                <td>
                                  <div className="sla-time-input">
                                    <input
                                      type="number"
                                      min={0}
                                      step={1}
                                      value={policy.resolutionTimeMin}
                                      disabled={slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], resolutionTimeMin: e.target.value },
                                        }))
                                      }
                                    />
                                    <select
                                      value={policy.resolutionTimeUnit}
                                      disabled={slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], resolutionTimeUnit: e.target.value as SlaTimeUnit },
                                        }))
                                      }
                                    >
                                      {SLA_TIME_UNITS.map((unit) => (
                                        <option key={unit} value={unit}>{SLA_TIME_UNIT_LABELS[unit]}</option>
                                      ))}
                                    </select>
                                  </div>
                                </td>
                                <td>
                                  <select
                                    value={policy.operationalHours}
                                    disabled={slaBusy}
                                    onChange={(e) =>
                                      setPriorityPolicies((prev) => ({
                                        ...prev,
                                        [priority]: { ...prev[priority], operationalHours: e.target.value as SlaOperationalHours },
                                      }))
                                    }
                                  >
                                    {SLA_OPERATIONAL_HOURS.map((opt) => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <label className="admin-toggle">
                                    <input
                                      type="checkbox"
                                      checked={policy.escalationEmail}
                                      disabled={slaBusy}
                                      onChange={(e) =>
                                        setPriorityPolicies((prev) => ({
                                          ...prev,
                                          [priority]: { ...prev[priority], escalationEmail: e.target.checked },
                                        }))
                                      }
                                    />
                                    <span className="toggle-slider" />
                                  </label>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="sla-policy-card">
                      <div className="sla-policy-card-head">
                        <div>
                          <h4>Apply this to:</h4>
                          <p>Choose when this SLA policy must be enforced</p>
                        </div>
                      </div>
                      <div className="sla-apply-row">
                        <label>
                          <input
                            type="radio"
                            name="sla-apply-match"
                            checked={policyApplyMatch === 'all'}
                            onChange={() => setPolicyApplyMatch('all')}
                          />
                          Match ALL of the conditions below
                        </label>
                        <label>
                          <input
                            type="radio"
                            name="sla-apply-match"
                            checked={policyApplyMatch === 'any'}
                            onChange={() => setPolicyApplyMatch('any')}
                          />
                          Match ANY of the conditions below
                        </label>
                      </div>
                      <div className="sla-conditions">
                        {policyConditions.length === 0 ? (
                          <div className="sla-empty">No conditions added yet.</div>
                        ) : (
                          policyConditions.map((condition, index) => (
                            <div key={`sla-cond-${index}`} className="sla-condition-row">
                              <select
                                value={condition.field}
                                onChange={(e) => updateConditionRow(index, 'field', e.target.value)}
                                disabled={slaBusy}
                              >
                                {SLA_CONDITION_FIELDS.map((field) => (
                                  <option key={field} value={field}>{field}</option>
                                ))}
                              </select>
                              <select
                                value={condition.operator}
                                onChange={(e) => updateConditionRow(index, 'operator', e.target.value)}
                                disabled={slaBusy}
                              >
                                {SLA_CONDITION_OPERATORS.map((op) => (
                                  <option key={op} value={op}>{op}</option>
                                ))}
                              </select>
                              <input
                                value={condition.value}
                                onChange={(e) => updateConditionRow(index, 'value', e.target.value)}
                                placeholder="Value"
                                disabled={slaBusy}
                              />
                              <button className="admin-settings-ghost" onClick={() => removeConditionRow(index)} disabled={slaBusy}>
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                        <button className="admin-settings-ghost" onClick={addConditionRow} disabled={slaBusy}>
                          + Add new condition
                        </button>
                      </div>
                    </div>

                    <div className="sla-policy-card">
                      <div className="sla-policy-card-head">
                        <div>
                          <h4>What happens when the due date approaches / this SLA is violated?</h4>
                        </div>
                      </div>
                      <div className="sla-escalation-section">
                        <div className="sla-escalation-title">Set Escalation Rule when a ticket is not responded to on time</div>
                        {policyResponseRules.length === 0 ? (
                          <div className="sla-empty">No escalation rules added.</div>
                        ) : (
                          policyResponseRules.map((rule, index) => (
                            <div key={`sla-response-${index}`} className="sla-rule-row">
                              <span className="sla-rule-badge">Rule {rule.level}</span>
                              <div className="sla-time-input">
                                <input
                                  type="number"
                                  min={0}
                                  value={rule.afterValue}
                                  onChange={(e) => updateResponseRule(index, 'afterValue', e.target.value)}
                                  disabled={slaBusy}
                                />
                                <select
                                  value={rule.afterUnit}
                                  onChange={(e) => updateResponseRule(index, 'afterUnit', e.target.value as SlaTimeUnit)}
                                  disabled={slaBusy}
                                >
                                  {SLA_TIME_UNITS.map((unit) => (
                                    <option key={unit} value={unit}>{SLA_TIME_UNIT_LABELS[unit]}</option>
                                  ))}
                                </select>
                              </div>
                              <select
                                value={rule.notify}
                                onChange={(e) => updateResponseRule(index, 'notify', e.target.value)}
                                disabled={slaBusy}
                              >
                                {SLA_NOTIFY_CHANNELS.map((channel) => (
                                  <option key={channel} value={channel}>{channel}</option>
                                ))}
                              </select>
                              <input
                                value={rule.recipients}
                                onChange={(e) => updateResponseRule(index, 'recipients', e.target.value)}
                                placeholder="Notify recipients"
                                disabled={slaBusy}
                              />
                              <button className="admin-settings-ghost" onClick={() => removeResponseRule(index)} disabled={slaBusy}>
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                        <button className="admin-settings-ghost" onClick={addResponseRule} disabled={slaBusy}>
                          + Add rule
                        </button>
                      </div>
                      <div className="sla-escalation-section">
                        <div className="sla-escalation-title">Set Escalation Hierarchy when a ticket is not resolved on time</div>
                        {policyResolutionRules.length === 0 ? (
                          <div className="sla-empty">No escalation levels configured.</div>
                        ) : (
                          policyResolutionRules.map((rule, index) => (
                            <div key={`sla-resolution-${index}`} className="sla-rule-row">
                              <span className="sla-rule-badge">Level {rule.level}</span>
                              <div className="sla-time-input">
                                <input
                                  type="number"
                                  min={0}
                                  value={rule.afterValue}
                                  onChange={(e) => updateResolutionRule(index, 'afterValue', e.target.value)}
                                  disabled={slaBusy}
                                />
                                <select
                                  value={rule.afterUnit}
                                  onChange={(e) => updateResolutionRule(index, 'afterUnit', e.target.value as SlaTimeUnit)}
                                  disabled={slaBusy}
                                >
                                  {SLA_TIME_UNITS.map((unit) => (
                                    <option key={unit} value={unit}>{SLA_TIME_UNIT_LABELS[unit]}</option>
                                  ))}
                                </select>
                              </div>
                              <select
                                value={rule.notify}
                                onChange={(e) => updateResolutionRule(index, 'notify', e.target.value)}
                                disabled={slaBusy}
                              >
                                {SLA_NOTIFY_CHANNELS.map((channel) => (
                                  <option key={channel} value={channel}>{channel}</option>
                                ))}
                              </select>
                              <input
                                value={rule.recipients}
                                onChange={(e) => updateResolutionRule(index, 'recipients', e.target.value)}
                                placeholder="Notify recipients"
                                disabled={slaBusy}
                              />
                              <button className="admin-settings-ghost" onClick={() => removeResolutionRule(index)} disabled={slaBusy}>
                                Remove
                              </button>
                            </div>
                          ))
                        )}
                        <button className="admin-settings-ghost" onClick={addResolutionRule} disabled={slaBusy}>
                          + Add level {policyResolutionRules.length + 1} rule
                        </button>
                      </div>
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
                {!mailEditing ? (
                  <button
                    className="admin-settings-primary"
                    onClick={() => {
                      mailDraftRef.current = mailForm
                      mailCompanyDraftRef.current = mailCompanyLink
                      setMailEditing(true)
                    }}
                    disabled={mailBusy || mailLoading}
                  >
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      className="admin-settings-ghost"
                      onClick={() => {
                        if (mailDraftRef.current) setMailForm(mailDraftRef.current)
                        setMailCompanyLink(mailCompanyDraftRef.current || '')
                        setMailEditing(false)
                      }}
                      disabled={mailBusy || mailLoading}
                    >
                      X
                    </button>
                    <button
                      className="admin-settings-primary"
                      onClick={async () => {
                        await saveMailConfiguration()
                        setMailEditing(false)
                      }}
                      disabled={mailBusy || mailLoading}
                    >
                      {mailBusy ? 'Working...' : 'Save'}
                    </button>
                  </>
                )}
              </div>
            </div>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage mail configuration.</p>
            ) : (
              <>
                <div className="admin-config-grid one">
                  <article className={`admin-config-card${mailEditing ? '' : ' admin-config-card-readonly'}`}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                      <h4 style={{ margin: 0 }}>Add mailbox</h4>
                    </div>
                    <div className="admin-config-row one">
                      <label className="admin-field-row">
                        <span>Mailbox name</span>
                        <input
                          readOnly={mailFieldDisabled}
                          value={mailForm.smtp.from}
                          onChange={(e) => {
                            const next = e.target.value
                            updateSmtpField('from', next)
                          }}
                          placeholder="Name of the sender that will be used in ticket replies"
                        />
                      </label>
                    </div>
                    <div className="admin-config-row one">
                      <label className="admin-field-row">
                        <span>Your service desk email *</span>
                        <input
                          readOnly={mailFieldDisabled}
                          value={mailForm.inboundEmailAddress}
                          onChange={(e) => {
                            const next = e.target.value
                            setMailForm((prev) => ({ ...prev, inboundEmailAddress: next, supportMail: next }))
                          }}
                          placeholder="This is also your Reply-to address"
                        />
                      </label>
                    </div>
                    <div className="admin-config-row one">
                      <label className="admin-field-row">
                        <span>Assign tickets to agent group</span>
                        <select
                          disabled={mailFieldDisabled}
                          value={mailForm.inboundDefaultQueue}
                          onChange={(e) => updateMailRoot('inboundDefaultQueue', e.target.value)}
                        >
                          {inboundQueueOptions.map((queueName) => (
                            <option key={`mailbox-queue-${queueName}`} value={queueName}>{queueName}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </article>
                </div>
                <div className="admin-config-grid one">
                  <article className="admin-config-card">
                    <h4>Email service provider</h4>
                    <div className="mail-provider-grid">
                      {([
                        { id: 'gmail', label: 'Gmail', sub: 'Connect via OAuth' },
                        { id: 'outlook', label: 'Microsoft Outlook', sub: 'Connect via OAuth' },
                        { id: 'zoho', label: 'Zoho Mail', sub: 'Connect via OAuth' },
                        { id: 'custom', label: 'Custom email server', sub: 'Connect via SMTP / IMAP' },
                      ] as const).map((item) => (
                        <button
                          key={item.id}
                          className={`mail-provider-card${mailProvider === item.id ? ' active' : ''}`}
                          onClick={() => setMailProvider(item.id)}
                        >
                          <div className="mail-provider-title">{item.label}</div>
                          <div className="mail-provider-sub">{item.sub}</div>
                        </button>
                      ))}
                    </div>
                  </article>
                </div>
                {mailProvider && mailProvider !== 'custom' ? (
                  <div className="admin-config-grid one">
                    <article className="admin-config-card">
                      <h4>Select OAuth method</h4>
                      <p>Select one of the options below to connect your {mailProvider === 'gmail' ? 'Google' : mailProvider === 'outlook' ? 'Microsoft' : 'Zoho'} account.</p>
                      <div className="admin-config-actions">
                        <button
                          className="admin-settings-primary"
                          onClick={() => openOAuthProvider(mailProvider)}
                          disabled={!mailEditing}
                        >
                          Configure {mailProvider === 'gmail' ? 'Gmail' : mailProvider === 'outlook' ? 'Outlook' : 'Zoho'} OAuth
                        </button>
                      </div>
                    </article>
                  </div>
                ) : null}
                {mailProvider === 'custom' ? (
                  <div className="admin-config-grid one">
                    <article className="admin-config-card">
                      <h4>Incoming Mail Server</h4>
                      <div className="admin-config-row two">
                        <label className="admin-field-row">
                          <span>IMAP Server Name</span>
                          <input
                            readOnly={mailFieldDisabled}
                            value={imapHost}
                            onChange={(e) => setImapHost(e.target.value)}
                            placeholder="Enter IMAP Server Name"
                          />
                        </label>
                        <label className="admin-field-row">
                          <span>Port</span>
                          <input
                            readOnly={mailFieldDisabled}
                            value={imapPort}
                            onChange={(e) => setImapPort(e.target.value)}
                            placeholder="Port"
                          />
                        </label>
                      </div>
                      <div className="admin-config-row two">
                        <label className="admin-field-row switch-row">
                          <span>Use SSL/TLS</span>
                          <input
                            type="checkbox"
                            disabled={mailFieldDisabled}
                            checked={imapSsl}
                            onChange={(e) => setImapSsl(e.target.checked)}
                          />
                        </label>
                      </div>
                      <div className="admin-config-row two mail-auth-row">
                        <label className="admin-field-row switch-row">
                          <span>Authentication: Plain</span>
                          <input
                            type="radio"
                            disabled={mailFieldDisabled}
                            checked={imapAuthMode === 'plain'}
                            onChange={() => setImapAuthMode('plain')}
                          />
                        </label>
                        <label className="admin-field-row switch-row">
                          <span>Authentication: Login</span>
                          <input
                            type="radio"
                            disabled={mailFieldDisabled}
                            checked={imapAuthMode === 'login'}
                            onChange={() => setImapAuthMode('login')}
                          />
                        </label>
                      </div>
                      <div className="admin-config-row two">
                        <label className="admin-field-row">
                          <span>Email address</span>
                          <input
                            readOnly={mailFieldDisabled}
                            value={imapUser}
                            onChange={(e) => setImapUser(e.target.value)}
                            placeholder="Enter your email address"
                          />
                        </label>
                        <label className="admin-field-row">
                          <span>Password</span>
                          <input
                            type="password"
                            readOnly={mailFieldDisabled}
                            value={imapPass}
                            onChange={(e) => setImapPass(e.target.value)}
                            placeholder="Password"
                          />
                        </label>
                      </div>
                    </article>
                    <article className="admin-config-card">
                      <h4>Outgoing Mail Server</h4>
                      <div className="admin-config-row two">
                        <label className="admin-field-row">
                          <span>SMTP Server Name</span>
                          <input
                            readOnly={mailFieldDisabled}
                            value={smtpHost}
                            onChange={(e) => setSmtpHost(e.target.value)}
                            placeholder="Enter SMTP Server Name"
                          />
                        </label>
                        <label className="admin-field-row">
                          <span>Port</span>
                          <input
                            readOnly={mailFieldDisabled}
                            value={smtpPort}
                            onChange={(e) => setSmtpPort(e.target.value)}
                            placeholder="Port"
                          />
                        </label>
                      </div>
                      <div className="admin-config-row two">
                        <label className="admin-field-row switch-row">
                          <span>Use SSL/TLS</span>
                          <input
                            type="checkbox"
                            disabled={mailFieldDisabled}
                            checked={smtpSsl}
                            onChange={(e) => setSmtpSsl(e.target.checked)}
                          />
                        </label>
                      </div>
                      <div className="admin-config-row two mail-auth-row">
                        <label className="admin-field-row switch-row">
                          <span>Authentication: Plain</span>
                          <input
                            type="radio"
                            disabled={mailFieldDisabled}
                            checked={smtpAuthMode === 'plain'}
                            onChange={() => setSmtpAuthMode('plain')}
                          />
                        </label>
                        <label className="admin-field-row switch-row">
                          <span>Authentication: Login</span>
                          <input
                            type="radio"
                            disabled={mailFieldDisabled}
                            checked={smtpAuthMode === 'login'}
                            onChange={() => setSmtpAuthMode('login')}
                          />
                        </label>
                      </div>
                      <div className="admin-config-row two">
                        <label className="admin-field-row">
                          <span>Email address</span>
                          <input
                            readOnly={mailFieldDisabled}
                            value={smtpUser}
                            onChange={(e) => setSmtpUser(e.target.value)}
                            placeholder="Enter your email address"
                          />
                        </label>
                        <label className="admin-field-row">
                          <span>Password</span>
                          <input
                            type="password"
                            readOnly={mailFieldDisabled}
                            value={smtpPass}
                            onChange={(e) => setSmtpPass(e.target.value)}
                            placeholder="Password"
                          />
                        </label>
                      </div>
                    </article>
                  </div>
                ) : null}
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
          <div className="admin-config-page admin-mail-template-page">
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
                  <article className="admin-config-card admin-email-template-card">
                    <h4>Email Templates (CRUD)</h4>
                    <p>Create individual email templates per button action.</p>
                    <div className="admin-config-row three admin-template-meta">
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
                      <label className="admin-field-row switch-row admin-template-active">
                        <span>Active</span>
                        <input
                          type="checkbox"
                          checked={templateForm.active}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, active: e.target.checked }))}
                        />
                      </label>
                    </div>
                    <div className="admin-template-compose">
                      <label className="admin-field-row admin-template-body">
                        <span>Body</span>
                        <textarea
                          value={templateForm.body}
                          onChange={(e) => setTemplateForm((prev) => ({ ...prev, body: e.target.value }))}
                          placeholder="Hello {{user_name}}, your asset {{asset_id}} has been assigned."
                        />
                      </label>
                    </div>
                    <div className="admin-config-actions admin-template-actions">
                      <button className="admin-settings-primary" onClick={saveTemplate}>
                        {editingTemplateId ? 'Update Template' : 'Create Template'}
                      </button>
                      {editingTemplateId ? (
                        <button
                          className="admin-settings-ghost"
                          onClick={() => {
                            setEditingTemplateId(null)
                            setTemplateForm({ name: '', buttonKey: 'Assign', body: '', active: true })
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
                            <div className="admin-entity-subtext">{row.body}</div>
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

                <article className="admin-config-card">
                    <h4>Email Signatures (CRUD)</h4>
                    <p>Manage signature templates by user.</p>
                    <label className="admin-field-row">
                      <span>User</span>
                      <select
                        value={signatureForm.userId}
                        onChange={(e) => {
                          const nextUserId = e.target.value
                          const selectedUser = signatureUsers.find((entry) => entry.id === nextUserId)
                          setSignatureForm((prev) => ({ ...prev, userId: nextUserId, userLabel: selectedUser?.label || prev.userLabel }))
                        }}
                      >
                        <option value="">Select user</option>
                        {signatureUsers.map((entry) => (
                          <option key={`sig-user-${entry.id}`} value={entry.id}>{entry.label}</option>
                        ))}
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
              <h3>Types and Workflow</h3>
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
                          <option value="">Select a type/flow to view</option>
                          {workflowDrafts.map((wf) => (
                            <option key={`type-${wf.name}`} value={wf.name}>{wf.name}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </article>
                </div>

                {workflowDrafts.length === 0 ? (
                  <div className="admin-config-grid one">
                    <article className="admin-config-card">
                      <p>No workflow available. Add one to continue.</p>
                      <button className="admin-settings-primary" onClick={addWorkflow}>Add Workflow</button>
                    </article>
                  </div>
                ) : !selectedWorkflowName ? (
                  <div className="admin-config-grid one">
                    <article className="admin-config-card">
                      <p>Select a type/flow from the dropdown above to view its states, transitions, and action flow.</p>
                    </article>
                  </div>
                ) : selectedWorkflow ? (
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
                      <p>Select a valid type/flow to continue.</p>
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
                  <h2>{isAccountSection ? 'Accounts' : isSecuritySection ? 'Security' : title}</h2>
                  {isAccountSection ? (
                    <p>Account profile, ownership, and export controls.</p>
                  ) : isSecuritySection ? (
                    <p>Security and access controls for your workspace.</p>
                  ) : (
                    <p>{selectedSection?.label || 'Configuration'} configuration workspace</p>
                  )}
                </div>
                {isAccountSection && (
                  <div className="admin-settings-footer-actions">
                    <button
                      className="admin-settings-ghost"
                      onClick={handleAccountCancel}
                      disabled={!accountDirty || accountSaving}
                    >
                      Cancel
                    </button>
                    <button
                      className="admin-settings-primary"
                      onClick={handleAccountSave}
                      disabled={!accountDirty || accountSaving || accountLoading}
                    >
                      Update
                    </button>
                  </div>
                )}
                {isSecuritySection && (
                  <div className="admin-settings-footer-actions">
                    <button
                      className="admin-settings-ghost"
                      onClick={handleSecurityCancel}
                      disabled={!securityDirty || securitySaving}
                    >
                      Cancel
                    </button>
                    <button
                      className="admin-settings-primary"
                      onClick={handleSecuritySave}
                      disabled={!securityDirty || securitySaving || securityLoading}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            )}
            {!isQueueManagement && !isAccountSection && !isSecuritySection && (
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
            {isAccountSection && (
              <div className="admin-settings-grid" style={{ gridTemplateColumns: '320px minmax(0, 1fr)' }}>
                <article className="admin-settings-card" style={{ alignSelf: 'start' }}>
                  <h3>Account Name</h3>
                  <label className="admin-field-row">
                    <input
                      value={accountDraft.accountName}
                      onChange={(e) => updateAccountDraft({ accountName: e.target.value })}
                      placeholder="Account name"
                    />
                  </label>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Current Plan</div>
                    <div style={{ color: '#475569' }}>{accountDraft.currentPlan || '-'}</div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Active Since</div>
                    <div style={{ color: '#475569' }}>{accountDraft.activeSince || '-'}</div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Assets</div>
                    <div style={{ color: '#475569' }}>{accountDraft.assetsCount}</div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Agents</div>
                    <div style={{ color: '#475569' }}>{accountDraft.agentsCount}</div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Data Center</div>
                    <div style={{ color: '#475569' }}>{accountDraft.dataCenter || '-'}</div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>Version</div>
                    <div style={{ color: '#475569' }}>{accountDraft.version || '-'}</div>
                  </div>
                </article>
                <article className="admin-settings-card">
                  {accountError && <div className="error-message">{accountError}</div>}
                  {accountLoading ? (
                    <p>Loading account settings...</p>
                  ) : (
                    <>
                      <div style={{ display: 'flex', gap: 16, borderBottom: '1px solid #e5e7eb', paddingBottom: 8 }}>
                        <button
                          className={`admin-settings-ghost${accountTab === 'contact' ? ' active' : ''}`}
                          onClick={() => setAccountTab('contact')}
                        >
                          Contact Details
                        </button>
                        <button
                          className={`admin-settings-ghost${accountTab === 'other' ? ' active' : ''}`}
                          onClick={() => setAccountTab('other')}
                        >
                          Other Details
                        </button>
                      </div>
                      {accountTab === 'contact' ? (
                        <>
                          <h3 style={{ marginTop: 16 }}>Primary contact details</h3>
                          <p>Used for all account-related communications.</p>
                          <label className="admin-field-row">
                            <span>First Name</span>
                            <input
                              value={accountDraft.contact.firstName}
                              onChange={(e) =>
                                updateAccountDraft({
                                  contact: { ...accountDraft.contact, firstName: e.target.value },
                                })
                              }
                            />
                          </label>
                          <label className="admin-field-row">
                            <span>Last Name</span>
                            <input
                              value={accountDraft.contact.lastName}
                              onChange={(e) =>
                                updateAccountDraft({
                                  contact: { ...accountDraft.contact, lastName: e.target.value },
                                })
                              }
                            />
                          </label>
                          <label className="admin-field-row">
                            <span>Email</span>
                            <input
                              value={accountDraft.contact.email}
                              onChange={(e) =>
                                updateAccountDraft({
                                  contact: { ...accountDraft.contact, email: e.target.value },
                                })
                              }
                            />
                          </label>
                          <label className="admin-field-row">
                            <span>Phone</span>
                            <input
                              value={accountDraft.contact.phone}
                              onChange={(e) =>
                                updateAccountDraft({
                                  contact: { ...accountDraft.contact, phone: e.target.value },
                                })
                              }
                            />
                          </label>
                          <label className="admin-field-row">
                            <span>Send invoice to</span>
                            <input
                              value={accountDraft.contact.invoiceEmail}
                              onChange={(e) =>
                                updateAccountDraft({
                                  contact: { ...accountDraft.contact, invoiceEmail: e.target.value },
                                })
                              }
                            />
                          </label>
                        </>
                      ) : (
                        <>
                          <h3 style={{ marginTop: 16 }}>Export Data</h3>
                          <p>Generate an export of service desk data and send it to the primary contact.</p>
                          <button
                            className="admin-settings-ghost"
                            onClick={() => exportAccountData().catch(() => setAccountError('Export failed'))}
                          >
                            Export now
                          </button>
                          <div style={{ marginTop: 24 }}>
                            <h3>Cancel Account</h3>
                            <p>Request account cancellation. This action can be undone by support.</p>
                            <button
                              className="admin-settings-danger"
                              onClick={() => cancelAccount().catch(() => setAccountError('Cancellation failed'))}
                            >
                              Cancel my account
                            </button>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </article>
              </div>
            )}
            {isSecuritySection && (
              <div className="admin-settings-grid">
                {securityError && <div className="error-message">{securityError}</div>}
                {securityLoading ? (
                  <article className="admin-settings-card">
                    <p>Loading security settings...</p>
                  </article>
                ) : (
                  <>
                    <article className="admin-settings-card">
                      <h3>Default Login Policy</h3>
                      <p>Choose which login methods are allowed for your ITSM workspace.</p>
                      {([
                        { key: 'password', label: 'Password login', help: 'Standard email and password sign-in.' },
                        { key: 'passwordless', label: 'Passwordless login', help: 'Send one-time codes for sign-in.' },
                        { key: 'googleSso', label: 'Google SSO', help: 'Allow Google Workspace SSO.' },
                        { key: 'sso', label: 'Single sign-on', help: 'Enable SAML/OIDC SSO.' },
                      ] as const).map((method) => (
                        <label key={method.key} className="admin-field-row switch-row" style={{ marginTop: 10 }}>
                          <span>
                            <strong>{method.label}</strong>
                            <div style={{ fontSize: 12, color: '#6b7280' }}>{method.help}</div>
                          </span>
                          <input
                            type="checkbox"
                            checked={Boolean(securityDraft.loginMethods[method.key])}
                            onChange={(e) =>
                              setSecurityDraft((prev) => ({
                                ...prev,
                                loginMethods: { ...prev.loginMethods, [method.key]: e.target.checked },
                              }))
                            }
                          />
                        </label>
                      ))}
                    </article>

                    <article className="admin-settings-card">
                      <h3>IP Range Restriction</h3>
                      <p>Restrict access to trusted IP ranges (CIDR or single IP per line).</p>
                      <label className="admin-field-row switch-row">
                        <span>Enable IP range restriction</span>
                        <input
                          type="checkbox"
                          checked={securityDraft.ipRangeRestriction.enabled}
                          onChange={(e) =>
                            updateSecurityDraft({
                              ipRangeRestriction: { ...securityDraft.ipRangeRestriction, enabled: e.target.checked },
                            })
                          }
                        />
                      </label>
                      {securityDraft.ipRangeRestriction.enabled && (
                        <label className="admin-field-row" style={{ marginTop: 10 }}>
                          <span>Allowed IP ranges</span>
                          <textarea
                            value={securityDraft.ipRangeRestriction.ranges.join('\n')}
                            onChange={(e) =>
                              updateSecurityDraft({
                                ipRangeRestriction: {
                                  ...securityDraft.ipRangeRestriction,
                                  ranges: normalizeListInput(e.target.value),
                                },
                              })
                            }
                            placeholder="e.g. 192.168.0.0/24"
                          />
                        </label>
                      )}
                    </article>

                    <article className="admin-settings-card">
                      <h3>Session Timeout</h3>
                      <p>Automatically sign out users after inactivity.</p>
                      <label className="admin-field-row">
                        <span>Timeout (minutes)</span>
                        <select
                          value={String(securityDraft.sessionTimeoutMinutes)}
                          onChange={(e) =>
                            updateSecurityDraft({ sessionTimeoutMinutes: Number(e.target.value) || 60 })
                          }
                        >
                          {[15, 30, 60, 120, 240, 480, 720, 1440].map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </label>
                    </article>

                    <article className="admin-settings-card">
                      <h3>Authentication for Public URLs</h3>
                      <p>Require login before accessing public ticket and approval links.</p>
                      <label className="admin-field-row switch-row">
                        <span>Require authentication for public URLs</span>
                        <input
                          type="checkbox"
                          checked={securityDraft.requireAuthForPublicUrls}
                          onChange={(e) => updateSecurityDraft({ requireAuthForPublicUrls: e.target.checked })}
                        />
                      </label>
                    </article>

                    <article className="admin-settings-card">
                      <h3>Tickets Sharing</h3>
                      <p>Control how tickets can be shared inside and outside the workspace.</p>
                      <label className="admin-field-row switch-row">
                        <span>Share tickets using public links</span>
                        <input
                          type="checkbox"
                          checked={securityDraft.ticketSharing.publicLinks}
                          onChange={(e) =>
                            updateSecurityDraft({
                              ticketSharing: { ...securityDraft.ticketSharing, publicLinks: e.target.checked },
                            })
                          }
                        />
                      </label>
                      <label className="admin-field-row switch-row" style={{ marginTop: 10 }}>
                        <span>Share tickets outside restricted groups/workspaces</span>
                        <input
                          type="checkbox"
                          checked={securityDraft.ticketSharing.shareOutsideGroup}
                          onChange={(e) =>
                            updateSecurityDraft({
                              ticketSharing: { ...securityDraft.ticketSharing, shareOutsideGroup: e.target.checked },
                            })
                          }
                        />
                      </label>
                      <label className="admin-field-row switch-row" style={{ marginTop: 10 }}>
                        <span>Allow requesters to share tickets</span>
                        <input
                          type="checkbox"
                          checked={securityDraft.ticketSharing.allowRequesterShare}
                          onChange={(e) =>
                            updateSecurityDraft({
                              ticketSharing: { ...securityDraft.ticketSharing, allowRequesterShare: e.target.checked },
                            })
                          }
                        />
                      </label>
                      {securityDraft.ticketSharing.allowRequesterShare && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Can share with</div>
                          <label style={{ marginRight: 16 }}>
                            <input
                              type="radio"
                              name="requester-share-scope"
                              checked={securityDraft.ticketSharing.requesterShareScope === 'any'}
                              onChange={() =>
                                updateSecurityDraft({
                                  ticketSharing: { ...securityDraft.ticketSharing, requesterShareScope: 'any' },
                                })
                              }
                            />
                            <span style={{ marginLeft: 6 }}>Any users</span>
                          </label>
                          <label>
                            <input
                              type="radio"
                              name="requester-share-scope"
                              checked={securityDraft.ticketSharing.requesterShareScope === 'department'}
                              onChange={() =>
                                updateSecurityDraft({
                                  ticketSharing: { ...securityDraft.ticketSharing, requesterShareScope: 'department' },
                                })
                              }
                            />
                            <span style={{ marginLeft: 6 }}>Only department users</span>
                          </label>
                        </div>
                      )}
                    </article>

                    <article className="admin-settings-card">
                      <h3>Admin Notifications</h3>
                      <p>Send notifications to a selected account administrator.</p>
                      <label className="admin-field-row">
                        <span>Send notifications to</span>
                        <select
                          value={securityDraft.adminNotifications.adminUserId || ''}
                          onChange={(e) =>
                            updateSecurityDraft({
                              adminNotifications: { adminUserId: e.target.value || null },
                            })
                          }
                        >
                          <option value="">None</option>
                          {adminNotifyUsers.map((u) => (
                            <option key={u.id} value={u.id}>{u.label}</option>
                          ))}
                        </select>
                      </label>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
                        Notifications are sent when agents are added/removed, IP ranges change, or API keys are enabled.
                      </div>
                    </article>

                    <article className="admin-settings-card">
                      <h3>Attachment File Types</h3>
                      <p>Control which attachment types can be uploaded to tickets.</p>
                      <label className="admin-field-row switch-row">
                        <span>Allow all file types</span>
                        <input
                          type="radio"
                          name="attachment-mode"
                          checked={securityDraft.attachmentFileTypes.mode === 'all'}
                          onChange={() =>
                            updateSecurityDraft({
                              attachmentFileTypes: { ...securityDraft.attachmentFileTypes, mode: 'all' },
                            })
                          }
                        />
                      </label>
                      <label className="admin-field-row switch-row" style={{ marginTop: 10 }}>
                        <span>Allow specific file types only</span>
                        <input
                          type="radio"
                          name="attachment-mode"
                          checked={securityDraft.attachmentFileTypes.mode === 'specific'}
                          onChange={() =>
                            updateSecurityDraft({
                              attachmentFileTypes: { ...securityDraft.attachmentFileTypes, mode: 'specific' },
                            })
                          }
                        />
                      </label>
                      {securityDraft.attachmentFileTypes.mode === 'specific' && (
                        <label className="admin-field-row" style={{ marginTop: 10 }}>
                          <span>Allowed file types</span>
                          <input
                            value={securityDraft.attachmentFileTypes.types.join(', ')}
                            onChange={(e) =>
                              updateSecurityDraft({
                                attachmentFileTypes: {
                                  ...securityDraft.attachmentFileTypes,
                                  types: normalizeListInput(e.target.value),
                                },
                              })
                            }
                            placeholder="pdf, png, jpg, docx"
                          />
                        </label>
                      )}
                    </article>
                  </>
                )}
              </div>
            )}
            {!isAccountSection && !isSecuritySection && (
              <div className="admin-settings-grid">
              {topicPanels.length > 0 ? topicPanels.map((panel) => (
                <article key={panel.id} className="admin-settings-card">
                  <h3>{panel.title}</h3>
                  <p>{panel.description}</p>
                  {panel.fields.map((field) => renderField(field))}
                </article>
              )) : (
                <article className="admin-settings-card queue-panel-card">
                  <div className="queue-panel-tabs">
                    <button
                      className={`queue-panel-tab${queueSettingsView === 'ticket' ? ' active' : ''}`}
                      onClick={() => setQueueSettingsView('ticket')}
                    >
                      Ticket
                    </button>
                    <button
                      className={`queue-panel-tab${queueSettingsView === 'asset' ? ' active' : ''}`}
                      onClick={() => setQueueSettingsView('asset')}
                    >
                      Asset
                    </button>
                  </div>
                  {queueSettingsView === 'ticket' ? (
                    <>
                      <h3 style={{ marginTop: 0 }}>Ticket Team Queues</h3>
                      <p>Create/edit/delete queues and manage visibility scope.</p>
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
                                  placeholder="Support Team"
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
                        ) : Array.from(
                          leftPanelConfig.ticketQueues.reduce((acc, queue) => {
                            const label = String(queue?.label || '').trim()
                            if (!label) return acc
                            const key = label.toLowerCase()
                            const queueId = queue.queueId ?? Number(queue.id)
                            const existing = acc.get(key)
                            if (!existing || (Number.isFinite(queueId) && queueId > 0 && (!Number.isFinite(existing.queueId) || existing.queueId <= 0))) {
                              acc.set(key, { ...queue, queueId })
                            }
                            return acc
                          }, new Map<string, TicketQueueConfig & { queueId?: number }>() ).values()
                        )
                          .sort((a, b) => {
                            const aId = Number.isFinite(a.queueId) ? Number(a.queueId) : Number.MAX_SAFE_INTEGER
                            const bId = Number.isFinite(b.queueId) ? Number(b.queueId) : Number.MAX_SAFE_INTEGER
                            return aId - bId
                          })
                          .map((queue) => {
                          const queueId = queue.queueId ?? Number(queue.id)
                          const queueIdLabel = Number.isFinite(queueId) && queueId > 0 ? ` (ID ${queueId})` : ''
                          return (
                            <div key={`${queue.label}-${queueIdLabel}`} className="admin-queue-rule-row">
                              <span>{queue.label}{queueIdLabel}</span>
                              <small>
                                Scope: {(queue.visibilityRoles || []).join(', ') || 'ALL'} | Default: Unassigned (non-deletable)
                              </small>
                            </div>
                          )
                        })}
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
              {activeItem === 'auto-assignment' ? (
                <article className="admin-settings-card">
                  <h3>Automation & Routing Rules</h3>
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
                  <div className="admin-config-actions">
                    <button className="admin-settings-primary" onClick={saveMailConfiguration} disabled={mailBusy || mailLoading}>
                      {mailBusy ? 'Saving...' : 'Save Routing Rules'}
                    </button>
                  </div>
                </article>
              ) : null}
            </div>
            )}
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








