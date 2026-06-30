import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

// Prefer backend/.env when server is started from repo root.
// Fallback to cwd/.env when started inside backend/.
const candidatePaths = [
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(process.cwd(), '.env'),
]

for (const envPath of candidatePaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath })
    break
  }
}

