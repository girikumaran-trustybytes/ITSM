DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT', 'USER');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS "User" (
  "id" SERIAL PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "password" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "client" TEXT,
  "site" TEXT,
  "accountManager" TEXT,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RefreshToken" (
  "id" SERIAL PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Asset" (
  "id" SERIAL PRIMARY KEY,
  "assetId" TEXT UNIQUE,
  "name" TEXT NOT NULL,
  "assetType" TEXT,
  "category" TEXT NOT NULL,
  "subcategory" TEXT,
  "ciType" TEXT,
  "serial" TEXT,
  "assetTag" TEXT,
  "barcode" TEXT,
  "assignedToId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "assignedUserEmail" TEXT,
  "department" TEXT,
  "location" TEXT,
  "site" TEXT,
  "costCentre" TEXT,
  "manager" TEXT,
  "assetOwner" TEXT,
  "manufacturer" TEXT,
  "model" TEXT,
  "cpu" TEXT,
  "ram" TEXT,
  "storage" TEXT,
  "macAddress" TEXT,
  "ipAddress" TEXT,
  "biosVersion" TEXT,
  "firmware" TEXT,
  "os" TEXT,
  "osVersion" TEXT,
  "licenseKey" TEXT,
  "installedSoftware" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "antivirus" TEXT,
  "patchStatus" TEXT,
  "encryption" TEXT,
  "purchaseDate" TIMESTAMP(3),
  "supplier" TEXT,
  "poNumber" TEXT,
  "invoiceNumber" TEXT,
  "purchaseCost" NUMERIC(12,2),
  "warrantyStart" TIMESTAMP(3),
  "warrantyUntil" TIMESTAMP(3),
  "amcSupport" TEXT,
  "depreciationEnd" TIMESTAMP(3),
  "status" TEXT NOT NULL,
  "lifecycleStage" TEXT,
  "condition" TEXT,
  "deploymentDate" TIMESTAMP(3),
  "lastAuditDate" TIMESTAMP(3),
  "endOfLife" TIMESTAMP(3),
  "disposalDate" TIMESTAMP(3),
  "disposalMethod" TEXT,
  "securityClassification" TEXT,
  "dataSensitivity" TEXT,
  "mdmEnrolled" BOOLEAN NOT NULL DEFAULT false,
  "complianceStatus" TEXT,
  "riskLevel" TEXT,
  "lastSecurityScan" TIMESTAMP(3),
  "parentAssetId" INTEGER REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "notes" TEXT,
  "createdById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" SERIAL PRIMARY KEY,
  "companyName" TEXT NOT NULL,
  "contactName" TEXT,
  "contactEmail" TEXT,
  "slaTerms" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Ticket" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" TEXT NOT NULL UNIQUE,
  "subject" TEXT,
  "type" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "impact" TEXT NOT NULL,
  "urgency" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "category" TEXT,
  "subcategory" TEXT,
  "description" TEXT,
  "resolution" TEXT,
  "resolutionCategory" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "requesterId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "assigneeId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "slaStart" TIMESTAMP(3),
  "slaBreach" TIMESTAMP(3),
  "supplierId" INTEGER REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "assetId" INTEGER REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TicketHistory" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" INTEGER NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "fromStatus" TEXT NOT NULL,
  "toStatus" TEXT NOT NULL,
  "changedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "note" TEXT,
  "internal" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Attachment" (
  "id" SERIAL PRIMARY KEY,
  "filename" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "ticketId" INTEGER REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "uploadedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" SERIAL PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" INTEGER,
  "userId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "assetId" INTEGER REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "meta" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AssetAttachment" (
  "id" SERIAL PRIMARY KEY,
  "assetId" INTEGER NOT NULL REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "filename" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "uploadedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Change" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "status" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Problem" (
  "id" SERIAL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "status" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Service" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AssetChange" (
  "assetId" INTEGER NOT NULL REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "changeId" INTEGER NOT NULL REFERENCES "Change"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("assetId", "changeId")
);

CREATE TABLE IF NOT EXISTS "AssetProblem" (
  "assetId" INTEGER NOT NULL REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "problemId" INTEGER NOT NULL REFERENCES "Problem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("assetId", "problemId")
);

CREATE TABLE IF NOT EXISTS "AssetService" (
  "assetId" INTEGER NOT NULL REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "serviceId" INTEGER NOT NULL REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("assetId", "serviceId")
);

CREATE TABLE IF NOT EXISTS "Approval" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" INTEGER NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "approverId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "comment" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "SlaTracking" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" INTEGER NOT NULL UNIQUE REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "slaName" TEXT,
  "startTime" TIMESTAMP(3),
  "pauseTime" TIMESTAMP(3),
  "resumeTime" TIMESTAMP(3),
  "breachTime" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'running',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SlaConfig" (
  "id" SERIAL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "priority" TEXT NOT NULL,
  "responseTimeMin" INTEGER NOT NULL,
  "resolutionTimeMin" INTEGER NOT NULL,
  "businessHours" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Task" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" INTEGER REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "assignedToId" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);

CREATE TABLE IF NOT EXISTS "TicketStatusHistory" (
  "id" SERIAL PRIMARY KEY,
  "ticketId" INTEGER NOT NULL REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "oldStatus" TEXT NOT NULL,
  "newStatus" TEXT NOT NULL,
  "changedById" INTEGER REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Role') THEN
    ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPPLIER';
    ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CUSTOM';
  END IF;
END$$;

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

CREATE INDEX IF NOT EXISTS idx_user_invites_user_id_created_at ON user_invites(user_id, created_at DESC);

INSERT INTO roles (role_name)
VALUES
  ('ADMIN'),
  ('AGENT'),
  ('USER'),
  ('SUPPLIER'),
  ('CUSTOM')
ON CONFLICT (role_name) DO NOTHING;

INSERT INTO ticket_queues (queue_key, queue_label)
VALUES
  ('helpdesk', 'Helpdesk'),
  ('l1', 'L1'),
  ('hr', 'HR'),
  ('l2', 'L2'),
  ('l3', 'L3'),
  ('supplier', 'Supplier')
ON CONFLICT (queue_key) DO NOTHING;

INSERT INTO ticket_queue_actions (queue_id, action_key, action_label, is_custom)
SELECT tq.queue_id, src.action_key, src.action_label, false
FROM ticket_queues tq
CROSS JOIN (
  VALUES
    ('accept', 'Accept'),
    ('acknowledge', 'Acknowledge'),
    ('email_user', 'Email User'),
    ('log_to_supplier', 'Log to Supplier'),
    ('email_supplier', 'Email Supplier'),
    ('internal_note', 'Internal Note'),
    ('note_plus_email', 'Note + Email'),
    ('resolve', 'Resolve'),
    ('call_back_supplier', 'Call Back Supplier'),
    ('approval', 'Approval'),
    ('close', 'Close')
) AS src(action_key, action_label)
ON CONFLICT (queue_id, action_key) DO NOTHING;

INSERT INTO permissions (permission_key, module, action, queue, label)
VALUES
  ('dashboard:*:read', 'dashboard', 'read', NULL, 'Dashboard - Read'),
  ('asset:*:read', 'asset', 'read', NULL, 'Asset - Read'),
  ('asset:*:create', 'asset', 'create', NULL, 'Asset - Create'),
  ('asset:*:edit', 'asset', 'edit', NULL, 'Asset - Edit'),
  ('asset:*:delete', 'asset', 'delete', NULL, 'Asset - Delete'),
  ('user:*:read', 'user', 'read', NULL, 'User - Read'),
  ('user:*:create', 'user', 'create', NULL, 'User - Create'),
  ('user:*:edit', 'user', 'edit', NULL, 'User - Edit'),
  ('user:*:delete', 'user', 'delete', NULL, 'User - Delete'),
  ('supplier:*:read', 'supplier', 'read', NULL, 'Supplier - Read'),
  ('supplier:*:create', 'supplier', 'create', NULL, 'Supplier - Create'),
  ('supplier:*:edit', 'supplier', 'edit', NULL, 'Supplier - Edit'),
  ('supplier:*:delete', 'supplier', 'delete', NULL, 'Supplier - Delete'),
  ('report:*:read', 'report', 'read', NULL, 'Report - Read'),
  ('report:*:edit', 'report', 'edit', NULL, 'Report - Edit'),
  ('admin:*:read', 'admin', 'read', NULL, 'Admin - Read'),
  ('admin:*:create', 'admin', 'create', NULL, 'Admin - Create'),
  ('admin:*:edit', 'admin', 'edit', NULL, 'Admin - Edit'),
  ('admin:*:delete', 'admin', 'delete', NULL, 'Admin - Delete')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO permissions (permission_key, module, action, queue, label)
SELECT
  'ticket:' || tq.queue_key || ':' || tqa.action_key,
  'ticket',
  tqa.action_key,
  tq.queue_key,
  'Ticket - ' || tq.queue_label || ' - ' || tqa.action_label
FROM ticket_queue_actions tqa
INNER JOIN ticket_queues tq ON tq.queue_id = tqa.queue_id
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id, allowed)
SELECT r.role_id, p.permission_id,
  CASE
    WHEN r.role_name = 'ADMIN' THEN true
    WHEN r.role_name = 'AGENT' THEN (
      (p.module = 'dashboard' AND p.action = 'read')
      OR (p.module = 'ticket')
      OR (p.module = 'asset' AND p.action IN ('read','create','edit'))
      OR (p.module = 'user' AND p.action = 'read')
      OR (p.module = 'supplier' AND p.action = 'read')
      OR (p.module = 'report' AND p.action = 'read')
    )
    WHEN r.role_name = 'USER' THEN (
      (p.module = 'dashboard' AND p.action = 'read')
      OR (p.module = 'ticket' AND p.action IN ('email_user'))
      OR (p.module = 'asset' AND p.action = 'read')
    )
    WHEN r.role_name = 'SUPPLIER' THEN (
      (p.module = 'ticket' AND p.queue = 'supplier' AND p.action IN ('acknowledge','resolve','close','internal_note'))
      OR (p.module = 'supplier' AND p.action = 'read')
      OR (p.module = 'report' AND p.action = 'read')
    )
    ELSE false
  END
FROM roles r
CROSS JOIN permissions p
ON CONFLICT (role_id, permission_id) DO NOTHING;
