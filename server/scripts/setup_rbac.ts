#!/usr/bin/env ts-node
import 'dotenv/config'
import { query, queryOne } from '../src/db'
import { ensureRbacSeeded } from '../src/modules/users/rbac.service'

async function main() {
  try {
    await ensureRbacSeeded()

    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@techdesk.local').trim().toLowerCase()
    const admin = await queryOne<{ id: number }>(
      `SELECT "id" FROM "User" WHERE LOWER("email") = LOWER($1)`,
      [adminEmail]
    )
    if (!admin) {
      console.log(`No user with email ${adminEmail} found. Run scripts/create_admin.ts first.`)
      process.exit(0)
    }

    await query('INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING', ['ADMIN'])
    const role = await queryOne<{ role_id: number }>(
      'SELECT role_id FROM roles WHERE role_name = $1',
      ['ADMIN']
    )
    if (!role?.role_id) throw new Error('ADMIN role not found')

    await query(
      `INSERT INTO user_roles (user_id, role_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [admin.id, role.role_id]
    )
    await query(
      `UPDATE "User"
       SET "role" = 'ADMIN', "updatedAt" = NOW()
       WHERE "id" = $1`,
      [admin.id]
    )

    console.log(`Assigned ADMIN role to ${adminEmail}`)
    console.log('RBAC setup completed')
    process.exit(0)
  } catch (err: any) {
    console.error('RBAC setup failed:')
    console.error(err?.stack ?? err)
    process.exit(1)
  }
}

main()
