import { query, queryOne } from '../../db'

function getProtectedAdminEmails(): string[] {
  const configured = [
    process.env.PROTECTED_ADMIN_EMAIL,
    process.env.PROTECTED_ADMIN_EMAILS,
    process.env.ADMIN_EMAIL,
  ]
    .filter((value) => String(value || '').trim().length > 0)
    .join(',')

  const values = configured
    .split(',')
    .map((value) => String(value || '').trim().toLowerCase())
    .filter((value) => value.length > 0)

  if (values.length > 0) return Array.from(new Set(values))
  return ['admin@itsm.local']
}

export function isProtectedAdminEmail(email: string | null | undefined): boolean {
  const normalized = String(email || '').trim().toLowerCase()
  if (!normalized) return false
  return getProtectedAdminEmails().includes(normalized)
}

export async function enforceProtectedAdminRoleByUserId(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return
  const user = await queryOne<{ email: string | null }>(
    'SELECT "email" FROM "User" WHERE "id" = $1',
    [userId]
  )
  if (!isProtectedAdminEmail(user?.email || '')) return

  await query(
    `UPDATE "User"
     SET "role" = 'ADMIN',
         "status" = 'ACTIVE',
         "updatedAt" = NOW()
     WHERE "id" = $1`,
    [userId]
  )
}

export async function enforceProtectedAdminBaseline(): Promise<void> {
  const protectedEmails = getProtectedAdminEmails()
  if (!protectedEmails.length) return

  const rows = await query<{ id: number }>(
    `SELECT "id"
     FROM "User"
     WHERE LOWER("email") = ANY($1::text[])`,
    [protectedEmails]
  )

  for (const row of rows) {
    await enforceProtectedAdminRoleByUserId(Number(row.id))
  }
}