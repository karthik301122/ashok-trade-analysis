/**
 * List login users in the database (not AUTH_USERS env entries).
 *
 * Usage:
 *   node scripts/list-users.mjs
 */
import { loadEnvFile } from '../server/loadEnv.mjs'
import { initDb, sqlAll } from '../server/db.mjs'
import { authEnabled } from '../server/auth.mjs'

loadEnvFile()

if (!authEnabled()) {
  console.error('AUTH_SECRET is not set.')
  process.exit(1)
}

await initDb()
const rows = await sqlAll(
  'SELECT username, created_at, is_admin FROM users ORDER BY username',
)
console.log(`Database users (${rows.length}):`)
for (const row of rows) {
  const created =
    row.created_at != null
      ? new Date(Number(row.created_at)).toISOString().slice(0, 10)
      : '—'
  const admin = row.is_admin ? ' admin' : ''
  console.log(`  ${row.username}  created ${created}${admin}`)
}
if (!rows.length) {
  console.log('  (none — create with: npm run create-user -- email@example.com password)')
}
