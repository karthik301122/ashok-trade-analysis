import bcrypt from 'bcryptjs'
import { sqlAll, sqlOne, sqlRun } from './db.mjs'

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeUsername(username) {
  return String(username).trim().toLowerCase()
}

/** @returns {string | null} error message */
export function validateUsername(username) {
  const u = normalizeUsername(username)
  if (EMAIL_RE.test(u) && u.length >= 5 && u.length <= 64) return null
  if (USERNAME_RE.test(u)) return null
  return 'Enter a valid email or username (3–32 letters, numbers, . _ -)'
}

/** @returns {string | null} error message */
export function validatePassword(password) {
  const p = String(password)
  if (p.length < 8) return 'Password must be at least 8 characters'
  if (p.length > 128) return 'Password is too long'
  if (!/[A-Z]/.test(p)) return 'Password must include an uppercase letter'
  if (!/[a-z]/.test(p)) return 'Password must include a lowercase letter'
  if (!/[0-9]/.test(p)) return 'Password must include a number'
  if (!/[^A-Za-z0-9]/.test(p)) return 'Password must include a symbol (e.g. !@#$%)'
  return null
}

export async function countDbUsers() {
  const row = await sqlOne('SELECT COUNT(*) AS n FROM users')
  return Number(row?.n) || 0
}

export async function listDbUsernames() {
  const rows = await sqlAll('SELECT username FROM users ORDER BY username')
  return rows.map((r) => String(r.username))
}

export async function isDbAdmin(username) {
  const row = await sqlOne('SELECT is_admin FROM users WHERE username = ?', [
    normalizeUsername(username),
  ])
  return Boolean(row?.is_admin)
}

export async function verifyDbCredentials(username, password) {
  const u = normalizeUsername(username)
  const row = await sqlOne('SELECT password_hash FROM users WHERE username = ?', [u])
  if (!row?.password_hash) return null
  const ok = await bcrypt.compare(String(password), row.password_hash)
  return ok ? u : null
}

/**
 * @param {string} username
 * @param {string | null} password — omit when passing opts.passwordHash
 * @param {{ isAdmin?: boolean, displayName?: string, passwordHash?: string }} [opts]
 */
export async function createDbUser(username, password, opts = {}) {
  const u = normalizeUsername(username)
  const userErr = validateUsername(u)
  if (userErr) return { ok: false, error: userErr }

  let hash = opts.passwordHash ? String(opts.passwordHash) : ''
  if (!hash) {
    const passErr = validatePassword(password)
    if (passErr) return { ok: false, error: passErr }
    hash = bcrypt.hashSync(String(password), 10)
  }

  const exists = await sqlOne('SELECT username FROM users WHERE username = ?', [u])
  if (exists) return { ok: false, error: 'Username already taken' }

  const displayName = String(opts.displayName || '').trim() || null
  await sqlRun(
    'INSERT INTO users (username, password_hash, created_at, is_admin, display_name) VALUES (?, ?, ?, ?, ?)',
    [u, hash, Date.now(), opts.isAdmin ? 1 : 0, displayName],
  )

  return { ok: true, user: u }
}

/**
 * @param {string} username
 * @returns {Promise<{ username: string, displayName: string | null, isAdmin: boolean } | null>}
 */
export async function getDbUserProfile(username) {
  const u = normalizeUsername(username)
  const row = await sqlOne(
    'SELECT username, display_name, is_admin FROM users WHERE username = ?',
    [u],
  )
  if (!row) return null
  return {
    username: String(row.username),
    displayName: row.display_name != null ? String(row.display_name) : null,
    isAdmin: Boolean(row.is_admin),
  }
}

export async function dbUserExists(username) {
  const row = await sqlOne('SELECT username FROM users WHERE username = ?', [
    normalizeUsername(username),
  ])
  return Boolean(row)
}

/**
 * @param {string} username
 * @param {string} displayName
 */
export async function updateDbDisplayName(username, displayName) {
  const u = normalizeUsername(username)
  const name = String(displayName || '').trim()
  if (name.length < 2) return { ok: false, error: 'Name must be at least 2 characters' }
  if (name.length > 80) return { ok: false, error: 'Name is too long' }
  const exists = await dbUserExists(u)
  if (!exists) return { ok: false, error: 'Account is managed by the server and cannot be edited here' }
  await sqlRun('UPDATE users SET display_name = ? WHERE username = ?', [name, u])
  return { ok: true, displayName: name }
}

/**
 * Rename login username and migrate prefs. Re-issue session on the client.
 * @param {string} currentUsername
 * @param {string} newUsername
 */
export async function updateDbUsername(currentUsername, newUsername) {
  const from = normalizeUsername(currentUsername)
  const to = normalizeUsername(newUsername)
  if (from === to) return { ok: true, user: from }

  const userErr = validateUsername(to)
  if (userErr) return { ok: false, error: userErr }

  const exists = await dbUserExists(from)
  if (!exists) {
    return { ok: false, error: 'Account is managed by the server and cannot be edited here' }
  }

  const taken = await dbUserExists(to)
  if (taken) return { ok: false, error: 'Username already taken' }

  await sqlRun('UPDATE users SET username = ? WHERE username = ?', [to, from])
  await sqlRun('DELETE FROM user_prefs WHERE username = ?', [to])
  await sqlRun('UPDATE user_prefs SET username = ? WHERE username = ?', [to, from])
  await sqlRun('DELETE FROM password_reset_tokens WHERE username = ? OR username = ?', [from, to])

  return { ok: true, user: to }
}

/**
 * @param {string} username
 * @param {string} currentPassword
 * @param {string} newPassword
 */
export async function changeDbPassword(username, currentPassword, newPassword) {
  const u = normalizeUsername(username)
  const row = await sqlOne('SELECT password_hash FROM users WHERE username = ?', [u])
  if (!row?.password_hash) {
    return { ok: false, error: 'Account is managed by the server and cannot be edited here' }
  }
  const ok = await bcrypt.compare(String(currentPassword), row.password_hash)
  if (!ok) return { ok: false, error: 'Current password is incorrect' }

  const passErr = validatePassword(newPassword)
  if (passErr) return { ok: false, error: passErr }

  const hash = bcrypt.hashSync(String(newPassword), 10)
  await sqlRun('UPDATE users SET password_hash = ? WHERE username = ?', [hash, u])
  await sqlRun('DELETE FROM password_reset_tokens WHERE username = ?', [u])
  return { ok: true }
}

/**
 * Set password from a verified reset token (no current password).
 * @param {string} username
 * @param {string} newPassword
 */
export async function setDbPassword(username, newPassword) {
  const u = normalizeUsername(username)
  const exists = await dbUserExists(u)
  if (!exists) return { ok: false, error: 'Account not found' }
  const passErr = validatePassword(newPassword)
  if (passErr) return { ok: false, error: passErr }
  const hash = bcrypt.hashSync(String(newPassword), 10)
  await sqlRun('UPDATE users SET password_hash = ? WHERE username = ?', [hash, u])
  await sqlRun('DELETE FROM password_reset_tokens WHERE username = ?', [u])
  return { ok: true }
}
