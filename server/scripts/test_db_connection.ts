#!/usr/bin/env ts-node
import 'dotenv/config'
/**
 * Test database connection and report status.
 * Usage: npx ts-node scripts/test_db_connection.ts
 */
import { query } from '../src/db'

async function main() {
  try {
    console.log('Testing database connection...')
    console.log(`DATABASE_URL: ${process.env.DATABASE_URL}`)
    console.log()

    // Test 1: Simple query
    const result = await query('SELECT now() as current_time')
    console.log('✓ Connection successful')
    console.log(`  Current time: ${result[0].current_time}`)
    console.log()

    // Test 2: Check tables exist
    const tables = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    console.log('✓ Tables in database:')
    if (tables.length === 0) {
      console.log('  (none found - run init_db.ts --seed to initialize)')
    } else {
      for (const t of tables) {
        console.log(`  - ${t.table_name}`)
      }
    }
    console.log()

    // Test 3: Check users table has data
    if (tables.some(t => t.table_name === 'users')) {
      const users = await query('SELECT COUNT(*) as count FROM users')
      console.log(`✓ Users table: ${users[0].count} row(s)`)
    }

    // Test 4: Check tickets table has data
    if (tables.some(t => t.table_name === 'tickets')) {
      const tickets = await query('SELECT COUNT(*) as count FROM tickets')
      console.log(`✓ Tickets table: ${tickets[0].count} row(s)`)
    }

    // Test 5: Check incidents table has data
    if (tables.some(t => t.table_name === 'incidents')) {
      const incidents = await query('SELECT COUNT(*) as count FROM incidents')
      console.log(`✓ Incidents table: ${incidents[0].count} row(s)`)
    }

    console.log()
    console.log('✓ All tests passed!')
    process.exit(0)
  } catch (err: any) {
    console.error('✗ Connection failed:')
    console.error(err?.message ?? err)
    console.error()
    console.error('Full error:')
    console.error(err?.stack ?? err)
    process.exit(1)
  }
}

main()
