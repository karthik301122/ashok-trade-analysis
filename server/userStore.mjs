import bcrypt from 'bcryptjs'
import { getDb } from './db.mjs'

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i

export function normalizeUsername(username) {
  return String(username).trim().toLowerCase()
}

/** @returns {string | null} error message */
export function validateUsername(username) {
  const u = normalizeUsername(username)
  if (!USERNAME_RE.test(u)) {
    return 'Username must be 3–32 characters (letters, numbers, . _ -)'
  }
  return null
}

/** @returns {string | null} error message */
export function validatePassword(password) {
  const p = String(password)
  if (p.length < 8) return 'Password must be at least 8 characters'
  if (p.length > 128) return 'Password is too long'
  return null
}

export function countDbUsers() {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM users').get()
  return Number(row?.n) || 0
}

export function isDbAdmin(username) {
  const row = getDb()
    .prepare('SELECT is_admin FROM users WHERE username = ?')
    .get(normalizeUsername(username))
  return Boolean(row?.is_admin)
}

export async function verifyDbCredentials(username, password) {
  const u = normalizeUsername(username)
  const row = getDb().prepare('SELECT password_hash FROM users WHERE username = ?').get(u)
  if (!row?.password_hash) return null
  const ok = await bcrypt.compare(String(password), row.password_hash)
  return ok ? u : null
}

/**
 * @param {string} username
 * @param {string} password
 * @param {{ isAdmin?: boolean }} [opts]
 */
export function createDbUser(username, password, opts = {}) {
  const u = normalizeUsername(username)
  const userErr = validateUsername(u)
  if (userErr) return { ok: false, error: userErr }
  const passErr = validatePassword(password)
  if (passErr) return { ok: false, error: passErr }

  const exists = getDb().prepare('SELECT username FROM users WHERE username = ?').get(u)
  if (exists) return { ok: false, error: 'Username already taken' }

  const hash = bcrypt.hashSync(password, 10)
  getDb()
    .prepare('INSERT INTO users (username, password_hash, created_at, is_admin) VALUES (?, ?, ?, ?)')
    .run(u, hash, Date.now(), opts.isAdmin ? 1 : 0)

  return { ok: true, user: u }
}
