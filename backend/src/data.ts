import { query, queryOne } from './db'

export type Asset = {
  id: number
  name: string
  serial?: string
  category: string
  status: string
  supplier?: string
}

export async function getAssets() {
  return query('SELECT * FROM "Asset" ORDER BY "createdAt" DESC')
}

export async function getAssetById(id: string) {
  return queryOne('SELECT * FROM "Asset" WHERE "id" = $1', [Number(id)])
}
