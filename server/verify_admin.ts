import 'dotenv/config'
import { query } from './src/db'

type AdminRow = {
  id: number
  name: string | null
  email: string
  role: string
  status: string
  assigned_roles: string[] | null
}

async function verify() {
  try {
    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@techdesk.local').trim().toLowerCase()
    const rows = await query<AdminRow>(
      `SELECT
         u."id",
         u."name",
         u."email",
         u."role"::text AS "role",
         u."status",
         ARRAY_REMOVE(ARRAY_AGG(r.role_name), NULL) AS assigned_roles
       FROM "user" u
       LEFT JOIN user_roles ur ON ur.user_id = u."id"
       LEFT JOIN roles r ON r.role_id = ur.role_id
       WHERE LOWER(u."email") = LOWER($1)
       GROUP BY u."id", u."name", u."email", u."role", u."status"`,
      [adminEmail]
    )

    console.log('Admin User Details:')
    console.log(JSON.stringify(rows, null, 2))

    const hasAdmin = rows.some((row) => {
      const primaryRole = String(row.role || '').toUpperCase()
      const assigned = Array.isArray(row.assigned_roles)
        ? row.assigned_roles.map((role) => String(role || '').toUpperCase())
        : []
      return primaryRole === 'ADMIN' || assigned.includes('ADMIN')
    })

    if (hasAdmin) {
      console.log(`\n${adminEmail} is configured as ADMIN`)
    } else {
      console.log(`\n${adminEmail} exists but is not mapped to ADMIN role`)
    }
    process.exit(0)
  } catch (err: any) {
    console.error('Error:', err?.message || String(err))
    process.exit(1)
  }
}

verify()
