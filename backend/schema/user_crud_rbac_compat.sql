-- User CRUD + RBAC compatibility schema (idempotent)
-- Run against your PostgreSQL database.

BEGIN;

-- Core user profile columns used by Add/Edit User UI
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "designation" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "reportingManager" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dateOfJoining" DATE;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employmentType" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "workMode" TEXT;

CREATE INDEX IF NOT EXISTS idx_user_employee_id ON "User"("employeeId");
CREATE INDEX IF NOT EXISTS idx_user_work_email ON "User"("workEmail");
CREATE INDEX IF NOT EXISTS idx_user_personal_email ON "User"("personalEmail");

-- RBAC permissions compatibility (legacy + modern columns)
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_key TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS queue TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS label TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS permission_name TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS module_name TEXT;
ALTER TABLE permissions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE permissions
SET permission_key = COALESCE(permission_key, permission_name, concat(COALESCE(module, 'legacy'), ':*:', COALESCE(action, 'read'))),
    permission_name = COALESCE(permission_name, permission_key, label),
    module = COALESCE(module, module_name, 'legacy'),
    module_name = COALESCE(module_name, module, 'legacy'),
    action = COALESCE(action, 'read'),
    label = COALESCE(label, permission_name, permission_key)
WHERE permission_key IS NULL
   OR permission_name IS NULL
   OR module IS NULL
   OR module_name IS NULL
   OR action IS NULL
   OR label IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_permissions_permission_key_unique ON permissions(permission_key);

COMMIT;
