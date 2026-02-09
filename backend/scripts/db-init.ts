import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

const sqlPath = path.resolve(__dirname, '..', 'schema', 'init.sql')
const sql = fs.readFileSync(sqlPath, 'utf8')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    await pool.query(sql)
    console.log('Database schema initialized')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Failed to initialize schema:', err)
  process.exit(1)
})
