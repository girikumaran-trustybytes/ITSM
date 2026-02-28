#!/usr/bin/env ts-node
import 'dotenv/config'
/**
 * Initialize database with schema and sample data.
 * Usage: npx ts-node scripts/init_db.ts [--seed]
 *   --seed: also load sample data
 */
import fs from 'fs'
import path from 'path'
import { withClient } from '../src/db'

async function main() {
  const runSeed = process.argv.includes('--seed')

  try {
    await withClient(async (client) => {
      const initDir = path.join(__dirname, '../db/init')
      const files = fs.readdirSync(initDir).filter((f) => f.endsWith('.sql'))

      // Execute non-sample SQL files first (schema, rbac, etc.)
      const nonSample = files.filter((f) => !/sample/i.test(f)).sort()
      for (const f of nonSample) {
        const p = path.join(initDir, f)
        const sql = fs.readFileSync(p, 'utf-8')
        console.log(`Executing ${f}...`)
        await client.query(sql)
        console.log(`✓ ${f} applied`)
      }

      // Optionally execute sample files last
      if (runSeed) {
        const sampleFiles = files.filter((f) => /sample/i.test(f)).sort()
        for (const f of sampleFiles) {
          const p = path.join(initDir, f)
          const sql = fs.readFileSync(p, 'utf-8')
          console.log(`Executing ${f}...`)
          await client.query(sql)
          console.log(`✓ ${f} applied`)
        }
      }
    })
    console.log('\nDatabase initialization complete.')
    process.exit(0)
  } catch (err: any) {
    console.error('Failed to initialize database:')
    console.error(err?.stack ?? err)
    process.exit(1)
  }
}

main()
