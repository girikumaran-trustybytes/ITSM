-- CRUD core schema for backend entities:
-- User <- "User"
-- Asset <- "Asset"
-- Supplier <- "Supplier"
-- Ticket <- "Ticket"
--
-- This script is idempotent and safe to run multiple times.

BEGIN;

-- ------------------------------------------------------------
-- 1) Base table compatibility (soft delete + audit timestamps)
-- ------------------------------------------------------------

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "companyMail" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactNumber" BIGINT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
UPDATE "Supplier" SET "contactPerson" = COALESCE("contactPerson", "contactName") WHERE "contactPerson" IS NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Supplier'
      AND column_name = 'contactNumber'
      AND data_type <> 'bigint'
  ) THEN
    ALTER TABLE "Supplier"
    ALTER COLUMN "contactNumber"
    TYPE BIGINT
    USING NULLIF(regexp_replace(COALESCE("contactNumber"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
  END IF;
END
$$;
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Ensure updatedAt defaults exist for legacy rows/instances
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Asset" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Supplier" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Ticket" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 2) CRUD/search indexes
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "ServiceAccounts" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES "User"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "autoUpgradeQueues" BOOLEAN NOT NULL DEFAULT TRUE,
  "queueIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_email_active ON "User"("email") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_name_active ON "User"("name") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_role_active ON "User"("role") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_status_active ON "User"("status") WHERE "is_deleted" = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_accounts_user_id ON "ServiceAccounts"("userId");

CREATE INDEX IF NOT EXISTS idx_asset_name_active ON "Asset"("name") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_asset_assetid_active ON "Asset"("assetId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_asset_status_active ON "Asset"("status") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_asset_category_active ON "Asset"("category") WHERE "is_deleted" = FALSE;

CREATE INDEX IF NOT EXISTS idx_supplier_company_active ON "Supplier"("companyName") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_company_mail_active ON "Supplier"("companyMail") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_contact_person_active ON "Supplier"("contactPerson") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_email_active ON "Supplier"("contactEmail") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_contact_number_active ON "Supplier"("contactNumber") WHERE "is_deleted" = FALSE;

CREATE INDEX IF NOT EXISTS idx_ticket_ticketid_active ON "Ticket"("ticketId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_status_active ON "Ticket"("status") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_priority_active ON "Ticket"("priority") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_requester_active ON "Ticket"("requesterId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_assignee_active ON "Ticket"("assigneeId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_created_active ON "Ticket"("createdAt") WHERE "is_deleted" = FALSE;

-- ------------------------------------------------------------
-- 3) Auto-update trigger for updatedAt
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW."updatedAt" = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_set_updated_at ON "User";
CREATE TRIGGER trg_user_set_updated_at
BEFORE UPDATE ON "User"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_asset_set_updated_at ON "Asset";
CREATE TRIGGER trg_asset_set_updated_at
BEFORE UPDATE ON "Asset"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_set_updated_at ON "Supplier";
CREATE TRIGGER trg_supplier_set_updated_at
BEFORE UPDATE ON "Supplier"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_set_updated_at ON "Ticket";
CREATE TRIGGER trg_ticket_set_updated_at
BEFORE UPDATE ON "Ticket"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

-- ------------------------------------------------------------
-- 4) Duplicate-name cleanup safeguard
-- ------------------------------------------------------------
-- If plural compatibility views exist from older migrations, drop them.
DROP VIEW IF EXISTS users;
DROP VIEW IF EXISTS assets;
DROP VIEW IF EXISTS suppliers;
DROP VIEW IF EXISTS tickets;

DROP TABLE IF EXISTS "users";
DROP TABLE IF EXISTS "Users";
DROP TABLE IF EXISTS "USER";
DROP TABLE IF EXISTS "USERS";

COMMIT;
