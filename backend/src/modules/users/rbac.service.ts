import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { query, queryOne, withClient } from '../../db'
import { auditLog } from '../../common/logger/logger'

type PermissionRow = {
  permission_id: number
  permission_key: string
  module: string
  action: string
  queue: string | null
  label: string
}

type TicketQueueRow = {
  queue_id: number
  queue_key: string
  queue_label: string
}

type ModuleSeed = {
  key: string
  label: string
  sortOrder: number
}

const predefinedRoles = ['ADMIN', 'AGENT', 'USER', 'SUPPLIER', 'CUSTOM'] as const
type PredefinedRole = typeof predefinedRoles[number]

const enterpriseModuleSeeds: ModuleSeed[] = [
  { key: 'dashboard', label: 'Dashboard', sortOrder: 1 },
  { key: 'tickets', label: 'Tickets', sortOrder: 2 },
  { key: 'assets', label: 'Assets', sortOrder: 3 },
  { key: 'users', label: 'Users', sortOrder: 4 },
  { key: 'suppliers', label: 'Suppliers', sortOrder: 5 },
  { key: 'reports', label: 'Reports', sortOrder: 6 },
  { key: 'admin', label: 'Admin', sortOrder: 7 },
]

const baseModulePermissions: Array<{ module: string; action: string; label: string }> = [
  { module: 'dashboard', action: 'view', label: 'View Dashboard' },
  { module: 'dashboard', action: 'analytics', label: 'Analytics' },
  { module: 'dashboard', action: 'kpi_view', label: 'KPI View' },
  { module: 'tickets', action: 'view', label: 'View Tickets' },
  { module: 'tickets', action: 'create', label: 'Create Tickets' },
  { module: 'tickets', action: 'edit', label: 'Edit Tickets' },
  { module: 'tickets', action: 'delete', label: 'Delete Tickets' },
  { module: 'tickets', action: 'resolve', label: 'Resolve Tickets' },
  { module: 'tickets', action: 'close', label: 'Close Tickets' },
  { module: 'assets', action: 'view', label: 'View Asset' },
  { module: 'assets', action: 'create', label: 'Create Asset' },
  { module: 'assets', action: 'edit', label: 'Edit Asset' },
  { module: 'assets', action: 'delete', label: 'Delete Asset' },
  { module: 'users', action: 'view', label: 'View User' },
  { module: 'users', action: 'create', label: 'Create User' },
  { module: 'users', action: 'edit', label: 'Edit User' },
  { module: 'users', action: 'delete', label: 'Delete User' },
  { module: 'suppliers', action: 'view', label: 'View Supplier' },
  { module: 'suppliers', action: 'create', label: 'Create Supplier' },
  { module: 'suppliers', action: 'edit', label: 'Edit Supplier' },
  { module: 'suppliers', action: 'delete', label: 'Delete Supplier' },
  { module: 'reports', action: 'view', label: 'View Report' },
  { module: 'reports', action: 'edit', label: 'Edit Report' },
  { module: 'admin', action: 'view', label: 'View Admin' },
  { module: 'admin', action: 'create', label: 'Create Admin' },
  { module: 'admin', action: 'edit', label: 'Edit Admin' },
  { module: 'admin', action: 'delete', label: 'Delete Admin' },
  { module: 'user', action: 'view_user', label: 'View User' },
  { module: 'user', action: 'edit_user', label: 'Edit User' },
  { module: 'user', action: 'create_user', label: 'Create User' },
  { module: 'user', action: 'delete_user', label: 'Delete User' },
  { module: 'user', action: 'reset_user_password', label: 'Reset User Password' },
  { module: 'role', action: 'view_role', label: 'View Role' },
  { module: 'role', action: 'edit_role', label: 'Edit Role' },
  { module: 'role', action: 'create_role', label: 'Create Role' },
  { module: 'role', action: 'delete_role', label: 'Delete Role' },
  { module: 'reports', action: 'view_all_cash_reports', label: 'View All Cash Reports' },
  { module: 'pharmacy_product', action: 'view_product', label: 'View Product' },
  { module: 'pharmacy_product', action: 'edit_product', label: 'Edit Product' },
  { module: 'pharmacy_product', action: 'create_product', label: 'Create Product' },
  { module: 'pharmacy_product', action: 'delete_product', label: 'Delete Product' },
  { module: 'patient', action: 'view_patient', label: 'View Patient' },
  { module: 'patient', action: 'edit_patient', label: 'Edit Patient' },
  { module: 'patient', action: 'create_patient', label: 'Create Patient' },
  { module: 'patient', action: 'delete_patient', label: 'Delete Patient' },
  { module: 'other_service', action: 'view_service', label: 'View Service' },
  { module: 'other_service', action: 'edit_service', label: 'Edit Service' },
  { module: 'other_service', action: 'create_service', label: 'Create Service' },
  { module: 'other_service', action: 'delete_service', label: 'Delete Service' },
  { module: 'lab_report', action: 'view_lab_report', label: 'View Lab Report' },
  { module: 'lab_report', action: 'edit_lab_report', label: 'Edit Lab Report' },
  { module: 'lab_report', action: 'view_unit', label: 'View Unit' },
  { module: 'lab_report', action: 'edit_unit', label: 'Edit Unit' },
  { module: 'lab_report', action: 'view_result_category', label: 'View Result Category' },
  { module: 'lab_report', action: 'edit_result_category', label: 'Edit Result Category' },
  { module: 'lab_report', action: 'view_test_data', label: 'View Test Data' },
  { module: 'lab_report', action: 'edit_test_data', label: 'Edit Test Data' },
  { module: 'lab_report', action: 'view_test_data_category', label: 'View Test Data Category' },
  { module: 'lab_report', action: 'edit_test_data_category', label: 'Edit Test Data Category' },
  { module: 'lab_report', action: 'view_patient_lab_report', label: 'View Patient Lab Report' },
  { module: 'lab_report', action: 'print_patient_lab_report', label: 'Print Patient Lab Report' },
  { module: 'lab_report', action: 'create_lab_report', label: 'Create Lab Report' },
  { module: 'lab_report', action: 'delete_lab_report', label: 'Delete Lab Report' },
  { module: 'lab_report', action: 'create_unit', label: 'Create Unit' },
  { module: 'lab_report', action: 'delete_unit', label: 'Delete Unit' },
  { module: 'lab_report', action: 'create_result_category', label: 'Create Result Category' },
  { module: 'lab_report', action: 'delete_result_category', label: 'Delete Result Category' },
  { module: 'lab_report', action: 'create_test_data', label: 'Create Test Data' },
  { module: 'lab_report', action: 'delete_test_data', label: 'Delete Test Data' },
  { module: 'lab_report', action: 'create_test_data_category', label: 'Create Test Data Category' },
  { module: 'lab_report', action: 'delete_test_data_category', label: 'Delete Test Data Category' },
  { module: 'lab_report', action: 'update_patient_lab_report', label: 'Update Patient Lab Report' },
  { module: 'invoice', action: 'create_invoice', label: 'Create Invoice' },
  { module: 'invoice', action: 'reverse_invoice', label: 'Reverse Invoice' },
  { module: 'doctor', action: 'view_doctor', label: 'View Doctor' },
  { module: 'doctor', action: 'edit_doctor', label: 'Edit Doctor' },
  { module: 'doctor', action: 'create_doctor', label: 'Create Doctor' },
  { module: 'doctor', action: 'delete_doctor', label: 'Delete Doctor' },
  { module: 'chanel_session', action: 'view_session', label: 'View Session' },
  { module: 'chanel_session', action: 'edit_session', label: 'Edit Session' },
  { module: 'chanel_session', action: 'create_session', label: 'Create Session' },
  { module: 'chanel_session', action: 'delete_session', label: 'Delete Session' },
  { module: 'dashboard', action: 'read', label: 'Dashboard - Read' },
  { module: 'asset', action: 'read', label: 'Asset - Read' },
  { module: 'asset', action: 'create', label: 'Asset - Create' },
  { module: 'asset', action: 'edit', label: 'Asset - Edit' },
  { module: 'asset', action: 'delete', label: 'Asset - Delete' },
  { module: 'user', action: 'read', label: 'User - Read' },
  { module: 'user', action: 'create', label: 'User - Create' },
  { module: 'user', action: 'edit', label: 'User - Edit' },
  { module: 'user', action: 'delete', label: 'User - Delete' },
  { module: 'supplier', action: 'read', label: 'Supplier - Read' },
  { module: 'supplier', action: 'create', label: 'Supplier - Create' },
  { module: 'supplier', action: 'edit', label: 'Supplier - Edit' },
  { module: 'supplier', action: 'delete', label: 'Supplier - Delete' },
  { module: 'report', action: 'read', label: 'Report - Read' },
  { module: 'report', action: 'edit', label: 'Report - Edit' },
  { module: 'admin', action: 'read', label: 'Admin - Read' },
  { module: 'admin', action: 'create', label: 'Admin - Create' },
  { module: 'admin', action: 'edit', label: 'Admin - Edit' },
  { module: 'admin', action: 'delete', label: 'Admin - Delete' },
]

type PermissionTemplateSeed = {
  key: string
  label: string
  baseRole: PredefinedRole
}

const permissionTemplateSeeds: PermissionTemplateSeed[] = [
  { key: 'support_desk', label: 'Support Desk', baseRole: 'AGENT' },
  { key: 'hr_queue', label: 'HR Queue', baseRole: 'USER' },
  { key: 'management', label: 'Management', baseRole: 'ADMIN' },
  { key: 'account', label: 'Account', baseRole: 'USER' },
  { key: 'supplier_queue', label: 'Supplier Queue', baseRole: 'SUPPLIER' },
]

const defaultQueues: Array<{ key: string; label: string }> = [
  { key: 'helpdesk', label: 'Helpdesk' },
  { key: 'l1', label: 'L1' },
  { key: 'hr', label: 'HR' },
  { key: 'l2', label: 'L2' },
  { key: 'l3', label: 'L3' },
  { key: 'supplier', label: 'Supplier' },
]

const defaultQueueActions: Array<{ key: string; label: string }> = [
  { key: 'accept', label: 'Accept' },
  { key: 'acknowledge', label: 'Acknowledge' },
  { key: 'email_user', label: 'Email User' },
  { key: 'log_to_supplier', label: 'Log to Supplier' },
  { key: 'email_supplier', label: 'Email Supplier' },
  { key: 'internal_note', label: 'Internal Note' },
  { key: 'note_plus_email', label: 'Note + Email' },
  { key: 'resolve', label: 'Resolve' },
  { key: 'call_back_supplier', label: 'Call Back Supplier' },
  { key: 'approval', label: 'Approval' },
  { key: 'close', label: 'Close' },
]

function normalizeRoleName(role: string | undefined | null): string {
  const value = String(role || 'USER').trim().toUpperCase()
  if (predefinedRoles.includes(value as PredefinedRole)) return value
  return 'CUSTOM'
}

function defaultRoleAllowed(role: string, permission: PermissionRow): boolean {
  const roleName = normalizeRoleName(role)
  if (roleName === 'ADMIN') return true
  if (roleName === 'AGENT') {
    if (permission.module === 'dashboard' && ['view', 'analytics', 'kpi_view', 'read'].includes(permission.action)) return true
    if (permission.module === 'tickets') return true
    if (permission.module === 'assets' && ['view', 'create', 'edit'].includes(permission.action)) return true
    if (permission.module === 'users' && permission.action === 'view') return true
    if (permission.module === 'suppliers' && permission.action === 'view') return true
    if (permission.module === 'reports' && permission.action === 'view') return true
    if (permission.module === 'dashboard' && permission.action === 'read') return true
    if (permission.module === 'ticket') return true
    if (permission.module === 'asset' && ['read', 'create', 'edit'].includes(permission.action)) return true
    if (permission.module === 'user' && permission.action === 'read') return true
    if (permission.module === 'supplier' && permission.action === 'read') return true
    if (permission.module === 'report' && permission.action === 'read') return true
    return false
  }
  if (roleName === 'USER') {
    if (permission.module === 'dashboard' && permission.action === 'view') return true
    if (permission.module === 'tickets' && permission.action === 'view') return true
    if (permission.module === 'assets' && permission.action === 'view') return true
    if (permission.module === 'users' && permission.action === 'view') return true
    if (permission.module === 'reports' && permission.action === 'view') return true
    if (permission.module === 'dashboard' && permission.action === 'read') return true
    if (permission.module === 'asset' && permission.action === 'read') return true
    if (permission.module === 'ticket' && permission.action === 'email_user') return true
    return false
  }
  if (roleName === 'SUPPLIER') {
    if (permission.module === 'tickets' && ['view', 'resolve', 'close'].includes(permission.action)) return true
    if (permission.module === 'suppliers' && permission.action === 'view') return true
    if (permission.module === 'reports' && permission.action === 'view') return true
    if (permission.module === 'ticket' && permission.queue === 'supplier' && ['acknowledge', 'resolve', 'close', 'internal_note'].includes(permission.action)) return true
    if (permission.module === 'supplier' && permission.action === 'read') return true
    if (permission.module === 'report' && permission.action === 'read') return true
    return false
  }
  return false
}

function defaultTemplateAllowed(templateKey: string, permission: PermissionRow): boolean {
  if (templateKey === 'management') return true

  if (templateKey === 'support_desk') {
    if (permission.module === 'dashboard' && ['view', 'analytics', 'kpi_view'].includes(permission.action)) return true
    if (permission.module === 'tickets') return true
    if (permission.module === 'assets' && ['view', 'create', 'edit'].includes(permission.action)) return true
    if (permission.module === 'users' && ['view', 'create', 'edit'].includes(permission.action)) return true
    if (permission.module === 'suppliers' && permission.action === 'view') return true
    if (permission.module === 'reports' && permission.action === 'view') return true
    if (permission.module === 'admin' && permission.action === 'view') return true
    if (permission.module === 'reports' && permission.action === 'view_all_cash_reports') return true
    if (permission.module === 'user' && ['view_user', 'create_user', 'edit_user'].includes(permission.action)) return true
    if (permission.module === 'role' && permission.action === 'view_role') return true
    if (permission.module === 'pharmacy_product' && ['view_product', 'edit_product'].includes(permission.action)) return true
    if (permission.module === 'patient') return true
    if (permission.module === 'other_service' && ['view_service', 'edit_service'].includes(permission.action)) return true
    if (permission.module === 'lab_report' && permission.action.startsWith('view_')) return true
    if (permission.module === 'doctor' && ['view_doctor', 'edit_doctor'].includes(permission.action)) return true
    if (permission.module === 'chanel_session' && ['view_session', 'edit_session'].includes(permission.action)) return true
    if (permission.module === 'invoice' && permission.action === 'create_invoice') return true
    return false
  }

  if (templateKey === 'hr_queue') {
    if (permission.module === 'dashboard' && permission.action === 'view') return true
    if (permission.module === 'tickets' && ['view', 'resolve'].includes(permission.action)) return true
    if (permission.module === 'users' && permission.action === 'view') return true
    if (permission.module === 'reports' && permission.action === 'view') return true
    if (permission.module === 'patient') return true
    if (permission.module === 'lab_report' && ['view_lab_report', 'edit_lab_report', 'view_patient_lab_report', 'update_patient_lab_report'].includes(permission.action)) return true
    if (permission.module === 'reports' && permission.action === 'view_all_cash_reports') return true
    if (permission.module === 'user' && permission.action === 'view_user') return true
    return false
  }

  if (templateKey === 'account') {
    if (permission.module === 'dashboard' && permission.action === 'view') return true
    if (permission.module === 'reports') return true
    if (permission.module === 'users' && permission.action === 'view') return true
    if (permission.module === 'tickets' && permission.action === 'view') return true
    if (permission.module === 'invoice') return true
    if (permission.module === 'reports' && permission.action === 'view_all_cash_reports') return true
    if (permission.module === 'user' && permission.action === 'view_user') return true
    if (permission.module === 'patient' && permission.action === 'view_patient') return true
    return false
  }

  if (templateKey === 'supplier_queue') {
    if (permission.module === 'dashboard' && permission.action === 'view') return true
    if (permission.module === 'suppliers') return true
    if (permission.module === 'tickets' && ['view', 'resolve', 'close'].includes(permission.action)) return true
    if (permission.module === 'reports' && permission.action === 'view') return true
    if (permission.module === 'other_service') return true
    if (permission.module === 'supplier' && permission.action === 'read') return true
    if (permission.module === 'reports' && permission.action === 'view_all_cash_reports') return true
    if (permission.module === 'chanel_session' && ['view_session', 'edit_session'].includes(permission.action)) return true
    return false
  }

  return false
}

function buildTicketPermissionKey(queueKey: string, actionKey: string): string {
  return `ticket:${queueKey}:${actionKey}`
}

function buildModulePermissionKey(module: string, action: string): string {
  return `${module}:*:${action}`
}

async function getRoleId(roleName: string): Promise<number> {
  const row = await queryOne<{ role_id: number }>('SELECT role_id FROM roles WHERE role_name = $1', [normalizeRoleName(roleName)])
  if (!row) throw { status: 400, message: `Unknown role: ${roleName}` }
  return row.role_id
}

export async function ensureRbacSeeded() {
  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
            BEGIN
              ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPLIER';
            EXCEPTION WHEN duplicate_object THEN
              NULL;
            END;
            BEGIN
              ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CUSTOM';
            EXCEPTION WHEN duplicate_object THEN
              NULL;
            END;
          END IF;
        END$$;
      `)

      await client.query(`
        DO $$
        BEGIN
          IF to_regclass('public.roles') IS NOT NULL THEN
            ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT true;
            ALTER TABLE roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
          END IF;
        END$$;
      `)

      await client.query(`
        DO $$
        BEGIN
          IF to_regclass('public.permissions') IS NOT NULL THEN
            ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_key TEXT;
            ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module TEXT;
            ALTER TABLE permissions ADD COLUMN IF NOT EXISTS action TEXT;
            ALTER TABLE permissions ADD COLUMN IF NOT EXISTS queue TEXT;
            ALTER TABLE permissions ADD COLUMN IF NOT EXISTS label TEXT;
            ALTER TABLE permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

            IF EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_name = 'permissions' AND column_name = 'permission_name'
            ) THEN
              UPDATE permissions
              SET permission_key = COALESCE(permission_key, permission_name),
                  label = COALESCE(label, permission_name),
                  module = COALESCE(module, module_name, 'legacy'),
                  action = COALESCE(action, lower(regexp_replace(permission_name, '[^a-zA-Z0-9]+', '_', 'g')))
              WHERE permission_key IS NULL OR label IS NULL OR module IS NULL OR action IS NULL;
            END IF;

            UPDATE permissions
            SET permission_key = COALESCE(permission_key, concat(module, ':*:', action)),
                module = COALESCE(module, 'legacy'),
                action = COALESCE(action, 'read'),
                label = COALESCE(label, permission_key)
            WHERE permission_key IS NULL OR module IS NULL OR action IS NULL OR label IS NULL;
          END IF;
        END$$;
      `)

      await client.query(`
        DO $$
        BEGIN
          IF to_regclass('public.role_permissions') IS NOT NULL THEN
            ALTER TABLE role_permissions ADD COLUMN IF NOT EXISTS allowed BOOLEAN;
            UPDATE role_permissions SET allowed = true WHERE allowed IS NULL;
            ALTER TABLE role_permissions ALTER COLUMN allowed SET NOT NULL;
            ALTER TABLE role_permissions ALTER COLUMN allowed SET DEFAULT false;
          END IF;
        END$$;
      `)

      await client.query(`
        CREATE TABLE IF NOT EXISTS roles (
          role_id SERIAL PRIMARY KEY,
          role_name TEXT NOT NULL UNIQUE,
          is_system BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS ticket_queues (
          queue_id SERIAL PRIMARY KEY,
          queue_key TEXT NOT NULL UNIQUE,
          queue_label TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ticket_queue_actions (
          action_id SERIAL PRIMARY KEY,
          queue_id INTEGER NOT NULL REFERENCES ticket_queues(queue_id) ON DELETE CASCADE,
          action_key TEXT NOT NULL,
          action_label TEXT NOT NULL,
          is_custom BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(queue_id, action_key)
        );

        CREATE TABLE IF NOT EXISTS permissions (
          permission_id SERIAL PRIMARY KEY,
          permission_key TEXT NOT NULL UNIQUE,
          module TEXT NOT NULL,
          action TEXT NOT NULL,
          queue TEXT,
          label TEXT NOT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
          permission_id INTEGER NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
          allowed BOOLEAN NOT NULL DEFAULT false,
          PRIMARY KEY(role_id, permission_id)
        );

        CREATE TABLE IF NOT EXISTS modules (
          module_id SERIAL PRIMARY KEY,
          module_key TEXT NOT NULL UNIQUE,
          module_label TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 100,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_permissions_override (
          user_id INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          permission_id INTEGER NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
          allowed BOOLEAN NOT NULL,
          PRIMARY KEY(user_id, permission_id)
        );

        CREATE TABLE IF NOT EXISTS user_invites (
          invite_id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
          token_hash TEXT,
          expires_at TIMESTAMP(3),
          status TEXT NOT NULL DEFAULT 'invite_pending',
          sent_at TIMESTAMP(3),
          accepted_at TIMESTAMP(3),
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_user_invites_user_id_created_at
        ON user_invites(user_id, created_at DESC);

        CREATE TABLE IF NOT EXISTS permission_templates (
          template_id SERIAL PRIMARY KEY,
          template_key TEXT NOT NULL UNIQUE,
          template_label TEXT NOT NULL,
          base_role TEXT NOT NULL,
          is_system BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS template_permissions (
          template_id INTEGER NOT NULL REFERENCES permission_templates(template_id) ON DELETE CASCADE,
          permission_id INTEGER NOT NULL REFERENCES permissions(permission_id) ON DELETE CASCADE,
          allowed BOOLEAN NOT NULL DEFAULT false,
          PRIMARY KEY(template_id, permission_id)
        );

        CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_permission_key_unique
        ON permissions(permission_key);
      `)

      for (const role of predefinedRoles) {
        await client.query(
          'INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING',
          [role]
        )
      }

      for (const moduleSeed of enterpriseModuleSeeds) {
        await client.query(
          `INSERT INTO modules (module_key, module_label, sort_order, is_active)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (module_key)
           DO UPDATE SET module_label = EXCLUDED.module_label, sort_order = EXCLUDED.sort_order, is_active = true`,
          [moduleSeed.key, moduleSeed.label, moduleSeed.sortOrder]
        )
      }

      for (const template of permissionTemplateSeeds) {
        await client.query(
          `INSERT INTO permission_templates (template_key, template_label, base_role, is_system)
           VALUES ($1, $2, $3, true)
           ON CONFLICT (template_key)
           DO UPDATE SET template_label = EXCLUDED.template_label, base_role = EXCLUDED.base_role`,
          [template.key, template.label, template.baseRole]
        )
      }

      for (const queue of defaultQueues) {
        await client.query(
          'INSERT INTO ticket_queues (queue_key, queue_label) VALUES ($1, $2) ON CONFLICT (queue_key) DO NOTHING',
          [queue.key, queue.label]
        )
      }

      const queues = await client.query<TicketQueueRow>('SELECT queue_id, queue_key, queue_label FROM ticket_queues')
      for (const q of queues.rows) {
        for (const action of defaultQueueActions) {
          await client.query(
            'INSERT INTO ticket_queue_actions (queue_id, action_key, action_label, is_custom) VALUES ($1, $2, $3, false) ON CONFLICT (queue_id, action_key) DO NOTHING',
            [q.queue_id, action.key, action.label]
          )
        }
      }

      for (const permission of baseModulePermissions) {
        await client.query(
          'INSERT INTO permissions (permission_key, module, action, queue, label) VALUES ($1, $2, $3, NULL, $4) ON CONFLICT (permission_key) DO NOTHING',
          [buildModulePermissionKey(permission.module, permission.action), permission.module, permission.action, permission.label]
        )
      }

      const actions = await client.query<{
        queue_key: string
        queue_label: string
        action_key: string
        action_label: string
      }>(
        `SELECT tq.queue_key, tq.queue_label, tqa.action_key, tqa.action_label
         FROM ticket_queue_actions tqa
         INNER JOIN ticket_queues tq ON tq.queue_id = tqa.queue_id`
      )

      for (const row of actions.rows) {
        await client.query(
          'INSERT INTO permissions (permission_key, module, action, queue, label) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (permission_key) DO NOTHING',
          [
            buildTicketPermissionKey(row.queue_key, row.action_key),
            'ticket',
            row.action_key,
            row.queue_key,
            `Ticket - ${row.queue_label} - ${row.action_label}`,
          ]
        )
      }

      const permissionRows = await client.query<PermissionRow>(
        'SELECT permission_id, permission_key, module, action, queue, label FROM permissions'
      )
      const roleRows = await client.query<{ role_id: number; role_name: string }>('SELECT role_id, role_name FROM roles')
      const templateRows = await client.query<{ template_id: number; template_key: string }>(
        'SELECT template_id, template_key FROM permission_templates'
      )

      for (const roleRow of roleRows.rows) {
        for (const permission of permissionRows.rows) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id, allowed) VALUES ($1, $2, $3) ON CONFLICT (role_id, permission_id) DO NOTHING',
            [roleRow.role_id, permission.permission_id, defaultRoleAllowed(roleRow.role_name, permission)]
          )
        }
      }

      for (const templateRow of templateRows.rows) {
        for (const permission of permissionRows.rows) {
          await client.query(
            `INSERT INTO template_permissions (template_id, permission_id, allowed)
             VALUES ($1, $2, $3)
             ON CONFLICT (template_id, permission_id)
             DO UPDATE SET allowed = EXCLUDED.allowed`,
            [templateRow.template_id, permission.permission_id, defaultTemplateAllowed(templateRow.template_key, permission)]
          )
        }
      }

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })
}

async function getLatestInviteStatus(userId: number): Promise<string> {
  const row = await queryOne<{ status: string }>(
    'SELECT status FROM user_invites WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [userId]
  )
  return row?.status || 'none'
}

async function getRoleTemplates(): Promise<Record<string, Record<string, boolean>>> {
  const templates: Record<string, Record<string, boolean>> = {}
  for (const roleName of predefinedRoles) {
    const roleId = await getRoleId(roleName)
    const rows = await query<{
      permission_key: string
      allowed: boolean
    }>(
      `SELECT p.permission_key, rp.allowed
       FROM role_permissions rp
       INNER JOIN permissions p ON p.permission_id = rp.permission_id
       WHERE rp.role_id = $1`,
      [roleId]
    )
    templates[roleName] = rows.reduce<Record<string, boolean>>((acc, row) => {
      acc[row.permission_key] = Boolean(row.allowed)
      return acc
    }, {})
  }
  return templates
}

type PermissionTemplateMap = {
  key: string
  label: string
  baseRole: string
  permissions: Record<string, boolean>
}

async function getPermissionTemplates(): Promise<PermissionTemplateMap[]> {
  const rows = await query<{
    template_key: string
    template_label: string
    base_role: string
    permission_key: string
    allowed: boolean
  }>(
    `SELECT pt.template_key, pt.template_label, pt.base_role, p.permission_key, tp.allowed
     FROM permission_templates pt
     INNER JOIN template_permissions tp ON tp.template_id = pt.template_id
     INNER JOIN permissions p ON p.permission_id = tp.permission_id
     ORDER BY pt.template_key, p.permission_key`
  )

  const byKey = new Map<string, PermissionTemplateMap>()
  for (const row of rows) {
    if (!byKey.has(row.template_key)) {
      byKey.set(row.template_key, {
        key: row.template_key,
        label: row.template_label,
        baseRole: row.base_role,
        permissions: {},
      })
    }
    const entry = byKey.get(row.template_key)!
    entry.permissions[row.permission_key] = Boolean(row.allowed)
  }

  return Array.from(byKey.values())
}

export async function getUserPermissionsSnapshot(userId: number) {
  await ensureRbacSeeded()

  const user = await queryOne<{
    id: number
    name: string | null
    email: string
    role: string
    status: string
  }>(
    'SELECT "id", "name", "email", "role", "status" FROM "User" WHERE "id" = $1',
    [userId]
  )
  if (!user) throw { status: 404, message: 'User not found' }

  const roleId = await getRoleId(user.role)
  const inviteStatus = await getLatestInviteStatus(user.id)
  const moduleRows = await query<{
    module_key: string
    module_label: string
    sort_order: number
  }>(
    `SELECT module_key, module_label, sort_order
     FROM modules
     WHERE is_active = true
     ORDER BY sort_order ASC, module_label ASC`
  )
  const moduleKeys = moduleRows.map((m) => m.module_key)

  const rows = await query<{
    permission_id: number
    permission_key: string
    module: string
    action: string
    queue: string | null
    label: string
    role_allowed: boolean | null
    override_allowed: boolean | null
  }>(
    `SELECT
       p.permission_id,
       p.permission_key,
       p.module,
       p.action,
       p.queue,
       p.label,
       rp.allowed AS role_allowed,
       uo.allowed AS override_allowed
     FROM permissions p
     LEFT JOIN role_permissions rp
       ON rp.permission_id = p.permission_id
      AND rp.role_id = $1
     LEFT JOIN user_permissions_override uo
       ON uo.permission_id = p.permission_id
      AND uo.user_id = $2
     WHERE p.module = ANY($3::text[])
     ORDER BY p.module, p.queue NULLS FIRST, p.action`,
    [roleId, user.id, moduleKeys]
  )

  const roleTemplates = await getRoleTemplates()
  const permissionTemplates = await getPermissionTemplates()

  const permissions = rows.map((row) => ({
    permissionId: row.permission_id,
    permissionKey: row.permission_key,
    module: row.module,
    queue: row.queue,
    action: row.action,
    label: row.label,
    allowed: row.override_allowed !== null ? Boolean(row.override_allowed) : Boolean(row.role_allowed),
  }))
  const effectiveByKey = permissions.reduce<Record<string, boolean>>((acc, p) => {
    acc[p.permissionKey] = Boolean(p.allowed)
    return acc
  }, {})
  const selectedTemplate = permissionTemplates.find((template) =>
    Object.keys(effectiveByKey).every((permissionKey) => {
      const templateAllowed = template.permissions[permissionKey]
      return Boolean(templateAllowed) === Boolean(effectiveByKey[permissionKey])
    })
  )

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: normalizeRoleName(user.role),
      status: user.status,
      inviteStatus,
    },
    roles: predefinedRoles,
    roleTemplates,
    permissionTemplates,
    selectedTemplateKey: selectedTemplate?.key || 'custom',
    modules: moduleRows.map((m) => ({
      key: m.module_key,
      label: m.module_label,
      sortOrder: m.sort_order,
    })),
    permissions,
  }
}

export async function upsertUserPermissions(
  userId: number,
  payload: {
    role?: string
    templateKey?: string
    permissions?: Record<string, boolean>
    autoSwitchCustom?: boolean
  },
  actorUserId?: number
) {
  await ensureRbacSeeded()
  const user = await queryOne<{ id: number; role: string }>('SELECT "id", "role" FROM "User" WHERE "id" = $1', [userId])
  if (!user) throw { status: 404, message: 'User not found' }

  const allPermissions = await query<PermissionRow>('SELECT permission_id, permission_key, module, action, queue, label FROM permissions')
  const permissionByKey = allPermissions.reduce<Record<string, PermissionRow>>((acc, row) => {
    acc[row.permission_key] = row
    return acc
  }, {})
  const allPermissionKeys = allPermissions.map((p) => p.permission_key)
  const templateList = await getPermissionTemplates()
  const normalizedTemplateKey = String(payload.templateKey || '').trim().toLowerCase()
  const selectedTemplate = templateList.find((t) => t.key === normalizedTemplateKey) || null

  const requestedRole = normalizeRoleName(payload.role || selectedTemplate?.baseRole || user.role)
  let effectiveRole = requestedRole
  const submitted = payload.permissions
    ? payload.permissions
    : selectedTemplate
      ? allPermissionKeys.reduce<Record<string, boolean>>((acc, key) => {
        acc[key] = Boolean(selectedTemplate.permissions[key])
        return acc
      }, {})
      : {}

  if (payload.autoSwitchCustom && requestedRole !== 'CUSTOM') {
    const baseline = selectedTemplate ? selectedTemplate.permissions : {}
    const baselineToCompare = Object.keys(baseline).length > 0
      ? baseline
      : (() => {
        const roleTemplate = templateList.find((t) => t.baseRole === requestedRole)
        if (roleTemplate) return roleTemplate.permissions
        return {} as Record<string, boolean>
      })()
    const differsFromTemplate = Object.entries(submitted).some(([key, allowed]) => {
      const baselineAllowed = Boolean(baselineToCompare[key])
      return baselineAllowed !== Boolean(allowed)
    })
    if (differsFromTemplate) effectiveRole = 'CUSTOM'
  }

  const roleId = await getRoleId(effectiveRole)
  await query('UPDATE "User" SET "role" = $1, "updatedAt" = NOW() WHERE "id" = $2', [effectiveRole, userId])

  const roleRows = await query<{ permission_id: number; permission_key: string; allowed: boolean }>(
    `SELECT rp.permission_id, p.permission_key, rp.allowed
     FROM role_permissions rp
     INNER JOIN permissions p ON p.permission_id = rp.permission_id
     WHERE rp.role_id = $1`,
    [roleId]
  )
  const roleTemplateByKey = roleRows.reduce<Record<string, { permissionId: number; allowed: boolean }>>((acc, row) => {
    acc[row.permission_key] = { permissionId: row.permission_id, allowed: Boolean(row.allowed) }
    return acc
  }, {})
  const baselineTemplateByKey: Record<string, boolean> = roleRows.reduce<Record<string, boolean>>((acc, row) => {
    acc[row.permission_key] = Boolean(row.allowed)
    return acc
  }, {})

  await withClient(async (client) => {
    await client.query('BEGIN')
    try {
      for (const [permissionKey, selectedAllowed] of Object.entries(submitted)) {
        const permission = permissionByKey[permissionKey]
        if (!permission) continue
        const templateAllowed = baselineTemplateByKey[permissionKey] ?? roleTemplateByKey[permissionKey]?.allowed ?? false
        if (Boolean(selectedAllowed) === Boolean(templateAllowed)) {
          await client.query(
            'DELETE FROM user_permissions_override WHERE user_id = $1 AND permission_id = $2',
            [userId, permission.permission_id]
          )
          continue
        }
        await client.query(
          `INSERT INTO user_permissions_override (user_id, permission_id, allowed)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, permission_id)
           DO UPDATE SET allowed = EXCLUDED.allowed`,
          [userId, permission.permission_id, Boolean(selectedAllowed)]
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  })

  await auditLog({
    action: 'rbac_permissions_updated',
    entity: 'user',
    entityId: userId,
    user: actorUserId,
    meta: { role: effectiveRole, templateKey: normalizedTemplateKey || 'custom', overrideCount: Object.keys(submitted).length },
  })

  return getUserPermissionsSnapshot(userId)
}

export async function createTicketQueueCustomAction(payload: {
  queue: string
  label: string
  actionKey?: string
}, actorUserId?: number) {
  await ensureRbacSeeded()
  const queueKey = String(payload.queue || '').trim().toLowerCase()
  const label = String(payload.label || '').trim()
  if (!queueKey || !label) throw { status: 400, message: 'queue and label are required' }

  const queue = await queryOne<TicketQueueRow>('SELECT queue_id, queue_key, queue_label FROM ticket_queues WHERE queue_key = $1', [queueKey])
  if (!queue) throw { status: 404, message: 'Queue not found' }

  const generatedActionKey = String(payload.actionKey || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `custom_${Date.now()}`

  await query(
    `INSERT INTO ticket_queue_actions (queue_id, action_key, action_label, is_custom)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (queue_id, action_key) DO UPDATE
     SET action_label = EXCLUDED.action_label, is_custom = true`,
    [queue.queue_id, generatedActionKey, label]
  )

  const permissionKey = buildTicketPermissionKey(queueKey, generatedActionKey)
  const inserted = await queryOne<{ permission_id: number }>(
    `INSERT INTO permissions (permission_key, module, action, queue, label)
     VALUES ($1, 'ticket', $2, $3, $4)
     ON CONFLICT (permission_key) DO UPDATE SET label = EXCLUDED.label
     RETURNING permission_id`,
    [permissionKey, generatedActionKey, queueKey, `Ticket - ${queue.queue_label} - ${label}`]
  )

  if (inserted) {
    const roles = await query<{ role_id: number; role_name: string }>('SELECT role_id, role_name FROM roles')
    for (const role of roles) {
      const allowed = role.role_name === 'ADMIN'
      await query(
        `INSERT INTO role_permissions (role_id, permission_id, allowed)
         VALUES ($1, $2, $3)
         ON CONFLICT (role_id, permission_id) DO NOTHING`,
        [role.role_id, inserted.permission_id, allowed]
      )
    }
  }

  await auditLog({
    action: 'rbac_ticket_custom_action_added',
    entity: 'permission',
    user: actorUserId,
    meta: { queue: queueKey, actionKey: generatedActionKey, label },
  })

  return { queue: queueKey, actionKey: generatedActionKey, label }
}

export async function markInvitePending(userId: number, actorUserId?: number) {
  const user = await queryOne<{ id: number }>('SELECT "id" FROM "User" WHERE "id" = $1', [userId])
  if (!user) throw { status: 404, message: 'User not found' }

  await query(
    'INSERT INTO user_invites (user_id, status) VALUES ($1, $2)',
    [userId, 'invite_pending']
  )
  await query('UPDATE "User" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2', ['INVITED', userId])

  await auditLog({
    action: 'invite_pending_created',
    entity: 'user',
    entityId: userId,
    user: actorUserId,
  })
}

async function sendInviteEmail(email: string, name: string | null, inviteLink: string, expiresAt: Date) {
  const orgName = process.env.ORG_NAME || 'ITSM'
  const fromAddress = process.env.SMTP_FROM || 'no-reply@itsm.local'
  const subject = `${orgName}: Activate your account`
  const text = [
    `Hello ${name || 'User'},`,
    '',
    `You have been invited to join ${orgName}.`,
    `Activation link: ${inviteLink}`,
    `This link expires on ${expiresAt.toISOString()}.`,
    '',
    'If you did not expect this invite, you can ignore this email.',
  ].join('\n')

  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  const transport = host
    ? nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    })
    : nodemailer.createTransport({ jsonTransport: true })

  await transport.sendMail({
    from: fromAddress,
    to: email,
    subject,
    text,
  })
}

export async function sendUserInvite(userId: number, actorUserId?: number) {
  const user = await queryOne<{ id: number; email: string; name: string | null }>(
    'SELECT "id", "email", "name" FROM "User" WHERE "id" = $1',
    [userId]
  )
  if (!user) throw { status: 404, message: 'User not found' }

  const latestStatus = await getLatestInviteStatus(userId)
  if (!['none', 'invite_pending', 'invited_not_accepted'].includes(latestStatus)) {
    throw { status: 400, message: `User cannot be re-invited from status: ${latestStatus}` }
  }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await query(
    `INSERT INTO user_invites (user_id, token_hash, expires_at, status, sent_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [userId, tokenHash, expiresAt, 'invited_not_accepted']
  )
  await query('UPDATE "User" SET "status" = $1, "updatedAt" = NOW() WHERE "id" = $2', ['INVITED', userId])

  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const inviteLink = `${appUrl}/activate?token=${token}&user=${userId}`
  await sendInviteEmail(user.email, user.name, inviteLink, expiresAt)

  await auditLog({
    action: 'invite_sent',
    entity: 'user',
    entityId: userId,
    user: actorUserId,
    meta: { expiresAt: expiresAt.toISOString() },
  })

  return {
    inviteStatus: 'invited_not_accepted',
    expiresAt: expiresAt.toISOString(),
  }
}
