import { query, queryOne } from '../../db'

export const PROTECTED_ADMIN_EMAIL = 'girikumaran@trustybytes.in'

export function normalizeEmail(input: any): string {
  return String(input || '').trim().toLowerCase()
}

export function isProtectedAdminEmail(input: any): boolean {
  return normalizeEmail(input) === PROTECTED_ADMIN_EMAIL
}

export async function isProtectedAdminUserId(userId: number): Promise<boolean> {
  if (!Number.isFinite(userId) || userId <= 0) return false
  const row = await queryOne<{ email: string | null }>(
    'SELECT "email" FROM "User" WHERE "id" = $1',
    [userId]
  )
  return isProtectedAdminEmail(row?.email || '')
}

export async function enforceProtectedAdminRoleByUserId(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return
  const row = await queryOne<{ email: string | null }>(
    'SELECT "email" FROM "User" WHERE "id" = $1',
    [userId]
  )
  if (!isProtectedAdminEmail(row?.email || '')) return

  await query(
    'UPDATE "User" SET "role" = $1, "status" = $2, "updatedAt" = NOW() WHERE "id" = $3',
    ['ADMIN', 'ACTIVE', userId]
  )

  try {
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, role_id
       FROM roles
       WHERE role_name = 'ADMIN'
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId]
    )
  } catch {
    // Legacy installs may not have role tables yet; "User".role remains authoritative fallback.
  }
}

export async function enforceProtectedAdminBaseline(): Promise<void> {
  await query(
    `UPDATE "User"
     SET "role" = 'ADMIN',
         "status" = 'ACTIVE',
         "updatedAt" = NOW()
     WHERE LOWER("email") = LOWER($1)`,
    [PROTECTED_ADMIN_EMAIL]
  )

  try {
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT u."id", r.role_id
       FROM "User" u
       INNER JOIN roles r ON r.role_name = 'ADMIN'
       WHERE LOWER(u."email") = LOWER($1)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [PROTECTED_ADMIN_EMAIL]
    )
  } catch {
    // Legacy installs may not have role tables yet; "User".role remains authoritative fallback.
  }
}
