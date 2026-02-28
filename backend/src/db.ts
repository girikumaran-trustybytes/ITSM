import { Pool, PoolClient, QueryResult } from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  // Avoid hard failure at import time; server will surface error on first query.
  // This keeps behavior closer to previous Prisma init when env was missing.
  console.warn('DATABASE_URL is not set')
}

const pool = new Pool({
  connectionString,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS || 5000),
})

pool.on('error', (err) => {
  console.error('Unexpected pg pool error', err)
})

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result: QueryResult = await pool.query(text, params)
  return result.rows as T[]
}

export async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(text, params)
  return rows[0] ?? null
}

export async function withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export default pool
