import crypto from 'crypto'
import { sqlOne, sqlRun } from './db.mjs'
import { alertEmailConfigured, sendPasswordResetEmail } from './alertEmail.mjs'
import { isEmailLogin } from './userPrefs.mjs'
import {
  dbUserExists,
  getDbUserProfile,
  normalizeUsername,
  setDbPassword,
  validatePassword,
} from './userStore.mjs'

const TOKEN_TTL_MS = 60 * 60 * 1000
const REQUEST_COOLDOWN_MS = 60 * 1000

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}

/** @param {import('http').IncomingMessage | { headers?: Record<string, string | string[] | undefined> }} [req] */
export function publicAppOrigin(req) {
  const env = process.env.PUBLIC_APP_URL?.trim().replace(/\/$/, '')
  if (env) return env
  const headers = req?.headers || {}
  const hostRaw = headers['x-forwarded-host'] || headers.host
  const host = Array.isArray(hostRaw) ? hostRaw[0] : hostRaw
  const protoRaw = headers['x-forwarded-proto']
  const proto = (Array.isArray(protoRaw) ? protoRaw[0] : protoRaw) || 'https'
  if (host) return `${String(proto).split(',')[0].trim()}://${String(host).split(',')[0].trim()}`
  return 'https://traderscope.com'
}

/**
 * Always returns a generic success message (no account enumeration).
 * @param {{ email?: string }} body
 * @param {import('http').IncomingMessage} [req]
 */
export async function requestPasswordReset(body, req) {
  const generic = {
    ok: true,
    message: 'If an account exists for that email, we sent a reset link.',
  }

  if (!alertEmailConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Email delivery is not configured. Contact support.',
    }
  }

  const email = normalizeUsername(body?.email || '')
  if (!isEmailLogin(email)) {
    return generic
  }

  const exists = await dbUserExists(email)
  if (!exists) return generic

  const recent = await sqlOne(
    'SELECT created_at FROM password_reset_tokens WHERE username = ? ORDER BY created_at DESC LIMIT 1',
    [email],
  )
  if (recent && Date.now() - Number(recent.created_at || 0) < REQUEST_COOLDOWN_MS) {
    return {
      ok: false,
      status: 429,
      error: 'Please wait a minute before requesting another reset email',
    }
  }

  const rawToken = crypto.randomBytes(32).toString('hex')
  const now = Date.now()
  await sqlRun('DELETE FROM password_reset_tokens WHERE username = ?', [email])
  await sqlRun(
    `INSERT INTO password_reset_tokens (token_hash, username, expires_at, created_at)
     VALUES (?, ?, ?, ?)`,
    [hashToken(rawToken), email, now + TOKEN_TTL_MS, now],
  )

  const profile = await getDbUserProfile(email)
  const resetUrl = `${publicAppOrigin(req)}/?reset=${encodeURIComponent(rawToken)}`
  const sent = await sendPasswordResetEmail(email, resetUrl, profile?.displayName || '')
  if (!sent) {
    await sqlRun('DELETE FROM password_reset_tokens WHERE token_hash = ?', [hashToken(rawToken)])
    return {
      ok: false,
      status: 502,
      error: 'Could not send reset email. Try again shortly.',
    }
  }

  return generic
}

/**
 * @param {{ token?: string, password?: string }} body
 */
export async function completePasswordReset(body) {
  const token = String(body?.token || '').trim()
  const password = String(body?.password || '')
  if (!token || token.length < 32) {
    return { ok: false, status: 400, error: 'Invalid or expired reset link' }
  }

  const passErr = validatePassword(password)
  if (passErr) return { ok: false, status: 400, error: passErr }

  const row = await sqlOne(
    'SELECT username, expires_at FROM password_reset_tokens WHERE token_hash = ?',
    [hashToken(token)],
  )
  if (!row) return { ok: false, status: 400, error: 'Invalid or expired reset link' }
  if (Date.now() > Number(row.expires_at || 0)) {
    await sqlRun('DELETE FROM password_reset_tokens WHERE token_hash = ?', [hashToken(token)])
    return { ok: false, status: 400, error: 'Invalid or expired reset link' }
  }

  const username = normalizeUsername(row.username)
  const result = await setDbPassword(username, password)
  if (!result.ok) return { ok: false, status: 400, error: result.error }
  return { ok: true, message: 'Password updated. You can sign in now.' }
}
