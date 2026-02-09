#!/usr/bin/env ts-node
import 'dotenv/config'
import bcrypt from 'bcrypt'
import { query } from '../src/db'

async function main() {
  const [email, password, name = 'Administrator'] = process.argv.slice(2)
  if (!email || !password) {
    console.error('Usage: ts-node scripts/create_admin.ts <email> <password> [name]')
    process.exit(1)
  }
  try {
    const saltRounds = 10
    const hash = await bcrypt.hash(password, saltRounds)
    const username = email.split('@')[0]
    const parts = name.trim().split(/\s+/)
    const firstName = parts.shift() || ''
    const lastName = parts.join(' ') || ''

    const sql = `INSERT INTO app_user (username, email, password_hash, first_name, last_name)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name
      RETURNING *`

    const rows = await query(sql, [username, email, hash, firstName, lastName])
    console.log('Admin app_user created/updated:', rows[0])
    process.exit(0)
  } catch (err: any) {
    console.error('Failed to create admin:')
    console.error(err?.stack ?? err)
    process.exit(2)
  }
}

main()
