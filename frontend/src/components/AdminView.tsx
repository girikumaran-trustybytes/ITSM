import React, { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../contexts/AuthContext'
import { loadLeftPanelConfig, resetLeftPanelConfig, saveLeftPanelConfig, type LeftPanelConfig, type QueueRule } from '../utils/leftPanelConfig'
import RbacModule from './RbacModule'
import { createSlaConfig, deleteSlaConfig, listSlaConfigs, updateSlaConfig } from '../services/sla.service'

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
    id: 'incident',
    label: 'Incident Management',
    items: [
      { id: 'sla-policies', label: 'SLA policies' },
      { id: 'escalation-rules', label: 'Escalation rules' },
      { id: 'auto-assignment', label: 'Auto-assignment rules' },
    ],
  },
  {
    id: 'service-catalog',
    label: 'Service Catalog',
    items: [
      { id: 'categories', label: 'Categories' },
      { id: 'request-workflows', label: 'Request workflows' },
      { id: 'approval-matrix', label: 'Approval matrix' },
    ],
  },
  {
    id: 'change',
    label: 'Change Management',
    items: [
      { id: 'change-types', label: 'Change types' },
      { id: 'risk-matrix', label: 'Risk matrix' },
      { id: 'cab-configuration', label: 'CAB configuration' },
    ],
  },
  {
    id: 'automation',
    label: 'Automation & Workflows',
    items: [
      { id: 'workflow-builder', label: 'Workflow builder' },
      { id: 'triggers-conditions', label: 'Triggers & conditions' },
      { id: 'email-templates-automation', label: 'Email templates' },
      { id: 'webhooks', label: 'Webhooks' },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    items: [
      { id: 'api-keys', label: 'API keys', requiresAdmin: true },
      { id: 'third-party-tools', label: 'Third-party tools (Slack, Azure AD, etc.)' },
      { id: 'monitoring-tools', label: 'Monitoring tools' },
    ],
  },
  {
    id: 'asset-cmdb',
    label: 'Asset & CMDB',
    items: [
      { id: 'asset-types', label: 'Asset types' },
      { id: 'ci-relationships', label: 'CI relationships' },
      { id: 'discovery-settings', label: 'Discovery settings' },
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    items: [
      { id: 'email-templates-notify', label: 'Email templates' },
      { id: 'sms-settings', label: 'SMS settings' },
      { id: 'push-notifications', label: 'Push notifications' },
    ],
  },
  {
    id: 'audit',
    label: 'Audit & Compliance',
    items: [
      { id: 'audit-logs', label: 'Audit logs', requiresAdmin: true },
      { id: 'data-retention', label: 'Data retention policy', requiresAdmin: true },
      { id: 'backup-settings', label: 'Backup settings', requiresAdmin: true },
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
  'escalation-rules': [
    { id: 'escalation', title: 'Escalation Rules', description: 'Route aging tickets through support tiers.', fields: [
      { key: 'escalationTier1', label: 'Tier 1 escalation time', type: 'select', options: ['30 min', '1 hour', '2 hours'] },
      { key: 'escalationTier2', label: 'Tier 2 escalation time', type: 'select', options: ['2 hours', '4 hours', '8 hours'] },
      { key: 'escalationOnBreach', label: 'Escalate on SLA breach', type: 'toggle' },
      { key: 'escalationNotifyManager', label: 'Notify manager on escalation', type: 'toggle' },
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

  const [subSidebarQuery, setSubSidebarQuery] = useState('')
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
  const [slaLoading, setSlaLoading] = useState(false)
  const [slaBusy, setSlaBusy] = useState(false)
  const [slaRows, setSlaRows] = useState<any[]>([])
  const [editingSlaId, setEditingSlaId] = useState<number | null>(null)
  const [slaForm, setSlaForm] = useState({
    name: '',
    priority: 'Medium',
    responseTimeMin: '60',
    resolutionTimeMin: '1440',
    businessHours: false,
    active: true,
  })

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

  const selectedSection = visibleSections.find((s) => s.id === activeSection) || visibleSections[0]
  const selectedItem = selectedSection?.items.find((i) => i.id === activeItem) || selectedSection?.items[0]
  const topicPanels = settingsTopicPanels[activeItem] || []
  const subItems = (selectedSection?.items || []).filter((item) => item.label.toLowerCase().includes(subSidebarQuery.trim().toLowerCase()))

  const hasChanges = JSON.stringify(values) !== JSON.stringify(savedValues)
  const isRestrictedRole = role !== 'ADMIN'

  const systemHealth = useMemo(() => {
    if (!values.ssoEnforced && !values.mfaRequired) return { tone: 'red', label: 'Critical risk' }
    if (!values.auditLogging || !values.backupEnabled) return { tone: 'yellow', label: 'Warning state' }
    return { tone: 'green', label: 'Healthy' }
  }, [values])

  const title = selectedItem?.label || 'Settings'
  const isQueueManagement = activeItem === 'queue-management'
  const isRolesPermissionsView = activeItem === 'roles-permissions'
  const isSlaPoliciesView = activeItem === 'sla-policies'

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
      setSlaRows(Array.isArray(data) ? data : [])
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to load SLA configs')
      setSlaRows([])
    } finally {
      setSlaLoading(false)
    }
  }

  const resetSlaForm = () => {
    setEditingSlaId(null)
    setSlaForm({
      name: '',
      priority: 'Medium',
      responseTimeMin: '60',
      resolutionTimeMin: '1440',
      businessHours: false,
      active: true,
    })
  }

  const submitSlaForm = async () => {
    const responseTimeMin = Number(slaForm.responseTimeMin)
    const resolutionTimeMin = Number(slaForm.resolutionTimeMin)
    if (!slaForm.name.trim()) return alert('SLA name is required')
    if (!Number.isFinite(responseTimeMin) || responseTimeMin < 0) return alert('Invalid response time')
    if (!Number.isFinite(resolutionTimeMin) || resolutionTimeMin < 0) return alert('Invalid resolution time')
    try {
      setSlaBusy(true)
      const payload = {
        name: slaForm.name.trim(),
        priority: slaForm.priority,
        responseTimeMin,
        resolutionTimeMin,
        businessHours: slaForm.businessHours,
        active: slaForm.active,
      }
      if (editingSlaId) {
        await updateSlaConfig(editingSlaId, payload)
      } else {
        await createSlaConfig(payload)
      }
      resetSlaForm()
      await loadSlaRows()
    } catch (error: any) {
      alert(error?.response?.data?.error || 'Failed to save SLA config')
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

  const roleBadge = role === 'ADMIN' ? 'Administrator' : role === 'AGENT' ? 'Agent' : 'End User'
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
      }
    }
    window.addEventListener('shared-toolbar-action', handler as EventListener)
    return () => window.removeEventListener('shared-toolbar-action', handler as EventListener)
  }, [hasChanges, savedValues, values, title])

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
        {panelSections.map((section) => (
          <div
            key={section.id}
            className={`queue-item${activeSection === section.id ? ' queue-item-active' : ''}`}
            onClick={() => handleSelectSection(section.id)}
          >
            <div className="queue-avatar">{renderPanelIcon(section.id)}</div>
            <div className="queue-name">{section.label}</div>
          </div>
        ))}
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

  if (isQueueManagement) {
    return (
      <>
        {adminLeftPanel}
      </>
    )
  }

  if (isSlaPoliciesView) {
    return (
      <>
        {adminLeftPanel}
        <section className="rbac-module-card" style={{ marginLeft: sidebarCollapsed ? 12 : 0 }}>
          <div style={{ padding: 16 }}>
            <h3 style={{ marginTop: 0 }}>SLA Policies</h3>
            {role !== 'ADMIN' ? (
              <p>Only administrators can manage SLA policies.</p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto auto', gap: 8, marginBottom: 12 }}>
                  <input
                    placeholder="Policy name"
                    value={slaForm.name}
                    onChange={(e) => setSlaForm((p) => ({ ...p, name: e.target.value }))}
                  />
                  <select value={slaForm.priority} onChange={(e) => setSlaForm((p) => ({ ...p, priority: e.target.value }))}>
                    <option>High</option>
                    <option>Medium</option>
                    <option>Low</option>
                  </select>
                  <input
                    placeholder="Response (min)"
                    value={slaForm.responseTimeMin}
                    onChange={(e) => setSlaForm((p) => ({ ...p, responseTimeMin: e.target.value }))}
                  />
                  <input
                    placeholder="Resolution (min)"
                    value={slaForm.resolutionTimeMin}
                    onChange={(e) => setSlaForm((p) => ({ ...p, resolutionTimeMin: e.target.value }))}
                  />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <input
                      type="checkbox"
                      checked={slaForm.active}
                      onChange={(e) => setSlaForm((p) => ({ ...p, active: e.target.checked }))}
                    />
                    Active
                  </label>
                  <button className="admin-settings-primary" onClick={submitSlaForm} disabled={slaBusy}>
                    {slaBusy ? 'Saving...' : editingSlaId ? 'Update' : 'Add'}
                  </button>
                </div>
                {editingSlaId ? (
                  <div style={{ marginBottom: 10 }}>
                    <button className="admin-settings-ghost" onClick={resetSlaForm}>Cancel edit</button>
                  </div>
                ) : null}
                {slaLoading ? (
                  <p>Loading SLA policies...</p>
                ) : (
                  <table className="rbac-permission-matrix">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Priority</th>
                        <th>Response (min)</th>
                        <th>Resolution (min)</th>
                        <th>Business Hours</th>
                        <th>Active</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slaRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.name}</td>
                          <td>{row.priority}</td>
                          <td>{row.responseTimeMin}</td>
                          <td>{row.resolutionTimeMin}</td>
                          <td>{row.businessHours ? 'Yes' : 'No'}</td>
                          <td>{row.active ? 'Yes' : 'No'}</td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button
                              className="admin-settings-ghost"
                              onClick={() => {
                                setEditingSlaId(Number(row.id))
                                setSlaForm({
                                  name: String(row.name || ''),
                                  priority: String(row.priority || 'Medium'),
                                  responseTimeMin: String(row.responseTimeMin ?? '0'),
                                  resolutionTimeMin: String(row.resolutionTimeMin ?? '0'),
                                  businessHours: Boolean(row.businessHours),
                                  active: Boolean(row.active),
                                })
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="admin-settings-danger"
                              onClick={async () => {
                                if (!window.confirm(`Delete SLA policy "${row.name}"?`)) return
                                try {
                                  await deleteSlaConfig(Number(row.id))
                                  await loadSlaRows()
                                  if (editingSlaId === Number(row.id)) resetSlaForm()
                                } catch (error: any) {
                                  alert(error?.response?.data?.error || 'Failed to delete SLA policy')
                                }
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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


