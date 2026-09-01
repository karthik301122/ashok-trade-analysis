/**
 * Create a login user in the database.
 *
 * Usage:
 *   node scripts/create-user.mjs <username> <password>
 *   node scripts/create-user.mjs <username> <password> --admin
 */
import { loadEnvFile } from '../server/loadEnv.mjs'
import { authEnabled } from '../server/auth.mjs'
import { createDbUser } from '../server/userStore.mjs'
import { dbPath, initDb } from '../server/db.mjs'

loadEnvFile()

if (!authEnabled()) {
  console.error('AUTH_SECRET is not set. Add it to .env first (see DEPLOY.md).')
  process.exit(1)
}

const args = process.argv.slice(2)
const admin = args.includes('--admin')
const positional = args.filter((a) => a !== '--admin')
const username = positional[0]
const password = positional[1]

if (!username || !password) {
  console.error('Usage: node scripts/create-user.mjs <username> <password> [--admin]')
  process.exit(1)
}

await initDb()
const result = await createDbUser(username, password, { isAdmin: admin })
if (!result.ok) {
  console.error(result.error)
  process.exit(1)
}

console.log(`Database: ${dbPath()}`)
console.log(`Created user: ${result.user}${admin ? ' (admin)' : ''}`)
