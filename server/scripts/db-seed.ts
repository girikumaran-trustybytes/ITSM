import 'dotenv/config'
import { Pool } from 'pg'
import bcrypt from 'bcrypt'

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()
    const password = String(process.env.ADMIN_PASSWORD || '')
    if (!email || !password) {
      console.warn('ADMIN_EMAIL or ADMIN_PASSWORD not set; skipping admin seed')
      return
    }

    const hashed = await bcrypt.hash(password, 12)
    await pool.query(
      'INSERT INTO "User" ("email", "password", "role", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT ("email") DO NOTHING',
      [email, hashed, 'ADMIN', 'ACTIVE']
    )

    console.log('Seed complete')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Failed to seed database:', err)
  process.exit(1)
})
