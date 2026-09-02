/**
 * Copy login users from local SQLite into PostgreSQL (production).
 * Password hashes are copied as-is — same passwords work after sync.
 *
 * Usage:
 *   $env:DATABASE_URL = "postgresql://..."   # from Azure App Service → Configuration
 *   npm run sync-users
 *
 * Optional:
 *   SQLITE_PATH=./data/asx.sqlite
 */
import fs from 'fs'
import path from 'path'
import { DatabaseSync } from 'node:sqlite'
import { loadEnvFile } from '../server/loadEnv.mjs'
import { initDb, sqlRun } from '../server/db.mjs'

loadEnvFile()

const sqlitePath = process.env.SQLITE_PATH || path.join('data', 'asx.sqlite')
if (!process.env.DATABASE_URL?.trim()) {
  console.error('Set DATABASE_URL to your Azure PostgreSQL connection string.')
  console.error('Azure Portal → tradersscope-app → Configuration → DATABASE_URL')
  process.exit(1)
}
if (!fs.existsSync(sqlitePath)) {
  console.error(`SQLite file not found: ${sqlitePath}`)
  process.exit(1)
}

const sqlite = new DatabaseSync(sqlitePath)
const rows = sqlite.prepare('SELECT username, password_hash, created_at, is_admin FROM users').all()
if (!rows.length) {
  console.error('No users in local SQLite. Create with: npm run create-user -- email password')
  process.exit(1)
}

try {
  await initDb()
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('\nCould not connect to Azure PostgreSQL from your PC.')
  console.error('This is usually the firewall — your home IP is not allowed yet.\n')
  console.error('Fix (Azure Portal):')
  console.error('  1. Open tradersscope-db → Settings → Networking')
  console.error('  2. Check "Allow public access"')
  console.error('  3. Click "+ Add current client IP address"')
  console.error('  4. Save, wait 1 minute, run this script again.\n')
  console.error('Or create one user without Postgres access:')
  console.error('  set ADMIN_API_KEY=<from Azure app Configuration>')
  console.error('  node scripts/create-prod-user-api.mjs email@example.com "password"\n')
  console.error('Details:', msg)
  process.exit(1)
}

let upserted = 0
for (const row of rows) {
  await sqlRun(
    `INSERT INTO users (username, password_hash, created_at, is_admin)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(username) DO UPDATE SET
       password_hash = excluded.password_hash,
       is_admin = excluded.is_admin,
       created_at = excluded.created_at`,
    [row.username, row.password_hash, row.created_at, row.is_admin ? 1 : 0],
  )
  upserted++
  console.log(`  synced ${row.username}${row.is_admin ? ' (admin)' : ''}`)
}

console.log(`\nDone — ${upserted} user(s) synced to PostgreSQL.`)
