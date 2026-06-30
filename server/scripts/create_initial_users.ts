#!/usr/bin/env ts-node
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { query } from '../src/db'

interface UserRow {
  id: number
  email: string
  name: string | null
  role: string
  status: string
}

async function upsertUser(email: string, password: string, name: string, role: string) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Email is required')
  const hashed = await bcrypt.hash(password, 12)
  const rows = await query<UserRow>(
    `INSERT INTO "user" ("email", "password", "name", "role", "status", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, 'ACTIVE', NOW(), NOW())
     ON CONFLICT ("email") DO UPDATE SET
       "password" = EXCLUDED."password",
       "name" = EXCLUDED."name",
       "role" = EXCLUDED."role",
       "status" = 'ACTIVE',
       "updatedAt" = NOW()
     RETURNING "id", "email", "name", "role"::text AS "role", "status"`,
    [normalizedEmail, hashed, name, role]
  )
  return rows[0]
}

async function ensureAdminRole() {
  await query(`INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING`, ['ADMIN'])
}

async function ensureUserRole(userId: number) {
  await query(`INSERT INTO user_roles (user_id, role_id)
    SELECT $1, role_id FROM roles WHERE role_name = 'ADMIN'
    ON CONFLICT (user_id, role_id) DO NOTHING`, [userId])
}

async function main() {
  await ensureAdminRole()

  const superAdmin = await upsertUser('superadmin@itsm.com', 'admin1234', 'Super Admin', 'ADMIN')
  await ensureUserRole(superAdmin.id)
  console.log('Super admin created/updated:', superAdmin)

  const admin = await upsertUser('admin@itsm.com', 'admin1234', 'Administrator', 'ADMIN')
  await ensureUserRole(admin.id)
  console.log('Admin created/updated:', admin)

  const user = await upsertUser('user@itsm.com', 'user1234', 'User', 'USER')
  console.log('User created/updated:', user)
}

main().catch((err: any) => {
  console.error('Failed to create initial users:')
  console.error(err?.stack || err)
  process.exit(1)
})
