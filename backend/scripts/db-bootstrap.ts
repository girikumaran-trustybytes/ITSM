import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { Pool } from 'pg'

const initFile = path.resolve(__dirname, '..', 'schema', 'init.sql')
const realtimeFile = path.resolve(__dirname, '..', 'schema', 'realtime.sql')

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const initSql = fs.readFileSync(initFile, 'utf8')
    try {
      await pool.query(initSql)
      console.log(`Applied schema: ${path.basename(initFile)}`)
    } catch (err: any) {
      console.warn(`Skipping ${path.basename(initFile)} due to existing/legacy schema mismatch: ${err?.message || err}`)
    }

    const realtimeSql = fs.readFileSync(realtimeFile, 'utf8')
    await pool.query(realtimeSql)
    console.log(`Applied schema: ${path.basename(realtimeFile)}`)
    console.log('Database bootstrap complete')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error('Database bootstrap failed:', err?.message || err)
  process.exit(1)
})
