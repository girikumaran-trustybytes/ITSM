#!/usr/bin/env ts-node
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { query } from '../src/db'

type CreatedAdmin = {
  id: number
  email: string
  name: string | null
  role: string
  status: string
}

async function main() {
  const [emailArg, password, nameArg = 'Administrator'] = process.argv.slice(2)
  const email = String(emailArg || '').trim().toLowerCase()
  const name = String(nameArg || '').trim() || 'Administrator'
  if (!email || !password) {
    console.error('Usage: ts-node scripts/create_admin.ts <email> <password> [name]')
    process.exit(1)
  }

  try {
    const hash = await bcrypt.hash(password, 12)
    const rows = await query<CreatedAdmin>(
      `INSERT INTO "user" ("email", "password", "name", "role", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'ADMIN', 'ACTIVE', NOW(), NOW())
       ON CONFLICT ("email") DO UPDATE SET
         "password" = EXCLUDED."password",
         "name" = EXCLUDED."name",
         "role" = 'ADMIN',
         "status" = 'ACTIVE',
         "updatedAt" = NOW()
       RETURNING "id", "email", "name", "role"::text AS "role", "status"`,
      [email, hash, name]
    )
    const admin = rows[0]

    await query('INSERT INTO roles (role_name) VALUES ($1) ON CONFLICT (role_name) DO NOTHING', ['ADMIN'])
    await query(
      `INSERT INTO user_roles (user_id, role_id)
       SELECT $1, role_id
       FROM roles
       WHERE role_name = 'ADMIN'
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [admin.id]
    )

    console.log('Admin user created/updated:', admin)
    process.exit(0)
  } catch (err: any) {
    console.error('Failed to create admin:')
    console.error(err?.stack ?? err)
    process.exit(2)
  }
}

main()
