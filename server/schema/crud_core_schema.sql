-- CRUD core schema for backend entities:
-- User <- "user"
-- Asset <- "asset"
-- Supplier <- "supplier"
-- Ticket <- "ticket"
--
-- This script is idempotent and safe to run multiple times.

BEGIN;

-- ------------------------------------------------------------
-- 1) Base table compatibility (soft delete + audit timestamps)
-- ------------------------------------------------------------

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "companyMail" TEXT;
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "contactNumber" BIGINT;
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "contactName" TEXT;
UPDATE "supplier" SET "contactPerson" = COALESCE("contactPerson", "contactName") WHERE "contactPerson" IS NULL;
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
    ALTER TABLE "supplier"
    ALTER COLUMN "contactNumber"
    TYPE BIGINT
    USING NULLIF(regexp_replace(COALESCE("contactNumber"::text, ''), '[^0-9]', '', 'g'), '')::BIGINT;
  END IF;
END
$$;
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "is_deleted" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "asset" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "supplier" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "ticket" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- Ensure updatedAt defaults exist for legacy rows/instances
ALTER TABLE "user" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "asset" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "supplier" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "ticket" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- ------------------------------------------------------------
-- 2) CRUD/search indexes
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "serviceaccounts" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL UNIQUE REFERENCES "user"("id") ON DELETE CASCADE,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "autoUpgradeQueues" BOOLEAN NOT NULL DEFAULT TRUE,
  "queueIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_email_active ON "user"("email") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_name_active ON "user"("name") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_role_active ON "user"("role") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_user_status_active ON "user"("status") WHERE "is_deleted" = FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_service_accounts_user_id ON "serviceaccounts"("userId");

CREATE INDEX IF NOT EXISTS idx_asset_name_active ON "asset"("name") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_asset_assetid_active ON "asset"("assetId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_asset_status_active ON "asset"("status") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_asset_category_active ON "asset"("category") WHERE "is_deleted" = FALSE;

CREATE INDEX IF NOT EXISTS idx_supplier_company_active ON "supplier"("companyName") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_company_mail_active ON "supplier"("companyMail") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_contact_person_active ON "supplier"("contactPerson") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_email_active ON "supplier"("contactEmail") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_supplier_contact_number_active ON "supplier"("contactNumber") WHERE "is_deleted" = FALSE;

CREATE INDEX IF NOT EXISTS idx_ticket_ticketid_active ON "ticket"("ticketId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_status_active ON "ticket"("status") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_priority_active ON "ticket"("priority") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_requester_active ON "ticket"("requesterId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_assignee_active ON "ticket"("assigneeId") WHERE "is_deleted" = FALSE;
CREATE INDEX IF NOT EXISTS idx_ticket_created_active ON "ticket"("createdAt") WHERE "is_deleted" = FALSE;

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

DROP TRIGGER IF EXISTS trg_user_set_updated_at ON "user";
CREATE TRIGGER trg_user_set_updated_at
BEFORE UPDATE ON "user"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_asset_set_updated_at ON "asset";
CREATE TRIGGER trg_asset_set_updated_at
BEFORE UPDATE ON "asset"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_supplier_set_updated_at ON "supplier";
CREATE TRIGGER trg_supplier_set_updated_at
BEFORE UPDATE ON "supplier"
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_set_updated_at ON "ticket";
CREATE TRIGGER trg_ticket_set_updated_at
BEFORE UPDATE ON "ticket"
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
