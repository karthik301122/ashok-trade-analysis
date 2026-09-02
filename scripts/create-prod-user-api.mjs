/**
 * Create a login on production via the admin API (no direct Postgres from your PC).
 *
 * Requires ADMIN_API_KEY on Azure App Service (Configuration).
 *
 * Usage:
 *   set ADMIN_API_KEY=your-key-from-azure
 *   node scripts/create-prod-user-api.mjs absupermarket198@gmail.com "YourPassword"
 *
 * Optional:
 *   set SITE_URL=https://tradersscope.com
 */
import { loadEnvFile } from '../server/loadEnv.mjs'

loadEnvFile()

const site = process.env.SITE_URL?.trim() || process.env.PUBLIC_SITE_URL?.trim() || 'https://tradersscope.com'
const key = process.env.ADMIN_API_KEY?.trim()
const username = process.argv[2]
const password = process.argv[3]

if (!key) {
  console.error('Set ADMIN_API_KEY (same value as Azure App Service → tradersscope-app → Configuration).')
  process.exit(1)
}
if (!username || !password) {
  console.error('Usage: node scripts/create-prod-user-api.mjs <email> <password>')
  process.exit(1)
}

const url = `${site.replace(/\/$/, '')}/api/admin/users`
const res = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-key': key,
  },
  body: JSON.stringify({ username, password }),
})

const json = await res.json().catch(() => ({}))
if (!res.ok) {
  console.error(`Failed (${res.status}):`, json.error || JSON.stringify(json))
  if (res.status === 403) {
    console.error('Check ADMIN_API_KEY matches Azure app setting exactly.')
  }
  process.exit(1)
}

console.log(`Created on ${site}: ${json.user ?? username}`)
