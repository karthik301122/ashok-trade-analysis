/**
 * Generate a bcrypt hash for AUTH_USERS.
 *
 * Usage:
 *   node scripts/hash-password.mjs "your-password"
 *
 * Then put in Render env AUTH_USERS:
 *   ashok:$2b$10$....,karthik:$2b$10$....
 */
import bcrypt from 'bcryptjs'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"')
  process.exit(1)
}

const hash = bcrypt.hashSync(password, 10)
console.log(hash)
console.log('\nExample AUTH_USERS entry:')
console.log(`username:${hash}`)
