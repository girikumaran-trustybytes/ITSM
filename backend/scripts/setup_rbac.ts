#!/usr/bin/env ts-node
import 'dotenv/config'
import { query } from '../src/db'

async function main() {
  try {
    // Create roles
    const roles = ['ADMIN', 'AGENT', 'USER']
    for (const r of roles) {
      await query('INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING', [r])
    }

    // Example permissions - extend as needed
    const permissions = [
      { name: 'tickets:create', module: 'tickets' },
      { name: 'tickets:update', module: 'tickets' },
      { name: 'incidents:manage', module: 'incidents' },
    ]
    for (const p of permissions) {
      await query('INSERT INTO permissions (permission_name, module_name) VALUES ($1,$2) ON CONFLICT (permission_name) DO NOTHING', [p.name, p.module])
    }

    // Assign ADMIN role to admin user if present
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@itsm.com'
    const user = await query('SELECT user_id FROM app_user WHERE email = $1', [adminEmail])
    if (user.length === 0) {
      console.log(`No app_user with email ${adminEmail} found — create admin user first`)
    } else {
      const userId = user[0].user_id
      const roleRow = await query('SELECT role_id FROM roles WHERE role_name = $1', ['ADMIN'])
      if (roleRow.length === 0) {
        throw new Error('ADMIN role not found')
      }
      const roleId = roleRow[0].role_id
      await query('INSERT INTO user_roles (user_id, role_id) VALUES ($1,$2) ON CONFLICT (user_id, role_id) DO NOTHING', [userId, roleId])
      console.log(`Assigned ADMIN role to ${adminEmail}`)
    }

    console.log('RBAC setup completed')
    process.exit(0)
  } catch (err: any) {
    console.error('RBAC setup failed:')
    console.error(err?.stack ?? err)
    process.exit(1)
  }
}

main()
