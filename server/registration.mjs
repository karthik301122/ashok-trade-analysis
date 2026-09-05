import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { sqlOne, sqlRun } from './db.mjs'
import {
  createDbUser,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from './userStore.mjs'
import { alertEmailConfigured, sendOtpEmail } from './alertEmail.mjs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const OTP_TTL_MS = 15 * 60 * 1000
const OTP_MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000

/** @returns {string | null} */
export function validateDisplayName(name) {
  const n = String(name || '').trim()
  if (n.length < 2) return 'Name must be at least 2 characters'
  if (n.length > 80) return 'Name is too long'
  return null
}

/** @returns {string | null} */
export function validateRegisterEmail(email) {
  const e = normalizeUsername(email)
  if (!EMAIL_RE.test(e) || e.length < 5 || e.length > 64) {
    return 'Enter a valid email address'
  }
  return null
}

function generateOtp() {
  return String(crypto.randomInt(100000, 999999))
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex')
}

/**
 * Start registration: validate, store pending row, email a 6-digit OTP.
 * @param {{ name: string, email: string, password: string }} body
 */
export async function startRegistration(body) {
  if (!alertEmailConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Email delivery is not configured. Contact support.',
    }
  }

  const name = String(body?.name || '').trim()
  const email = normalizeUsername(body?.email || '')
  const password = String(body?.password || '')

  const nameErr = validateDisplayName(name)
  if (nameErr) return { ok: false, status: 400, error: nameErr }
  const emailErr = validateRegisterEmail(email)
  if (emailErr) return { ok: false, status: 400, error: emailErr }
  const userErr = validateUsername(email)
  if (userErr) return { ok: false, status: 400, error: userErr }
  const passErr = validatePassword(password)
  if (passErr) return { ok: false, status: 400, error: passErr }

  const exists = await sqlOne('SELECT username FROM users WHERE username = ?', [email])
  if (exists) return { ok: false, status: 409, error: 'An account with this email already exists' }

  const existingPending = await sqlOne(
    'SELECT created_at FROM registration_otps WHERE email = ?',
    [email],
  )
  if (existingPending) {
    const age = Date.now() - Number(existingPending.created_at || 0)
    if (age < RESEND_COOLDOWN_MS) {
      return {
        ok: false,
        status: 429,
        error: 'Please wait a minute before requesting another code',
      }
    }
  }

  const otp = generateOtp()
  const passwordHash = bcrypt.hashSync(password, 10)
  const now = Date.now()
  await sqlRun(
    `INSERT INTO registration_otps (email, display_name, password_hash, otp_hash, expires_at, attempts, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       display_name = excluded.display_name,
       password_hash = excluded.password_hash,
       otp_hash = excluded.otp_hash,
       expires_at = excluded.expires_at,
       attempts = 0,
       created_at = excluded.created_at`,
    [email, name, passwordHash, hashOtp(otp), now + OTP_TTL_MS, now],
  )

  const sent = await sendOtpEmail(email, otp, name)
  if (!sent) {
    await sqlRun('DELETE FROM registration_otps WHERE email = ?', [email])
    return {
      ok: false,
      status: 502,
      error: 'Could not send verification email. Try again shortly.',
    }
  }

  return {
    ok: true,
    email,
    expiresInSec: Math.round(OTP_TTL_MS / 1000),
    message: 'We sent a 6-digit code to your email',
  }
}

/**
 * Verify OTP and create the user account.
 * @param {{ email: string, otp: string }} body
 * @returns {Promise<{ ok: true, user: string, displayName: string } | { ok: false, status: number, error: string }>}
 */
export async function verifyRegistration(body) {
  const email = normalizeUsername(body?.email || '')
  const otp = String(body?.otp || '').trim().replace(/\s+/g, '')

  const emailErr = validateRegisterEmail(email)
  if (emailErr) return { ok: false, status: 400, error: emailErr }
  if (!/^\d{6}$/.test(otp)) return { ok: false, status: 400, error: 'Enter the 6-digit code' }

  const row = await sqlOne('SELECT * FROM registration_otps WHERE email = ?', [email])
  if (!row) {
    return { ok: false, status: 400, error: 'No pending registration for this email. Start again.' }
  }

  if (Number(row.expires_at) < Date.now()) {
    await sqlRun('DELETE FROM registration_otps WHERE email = ?', [email])
    return { ok: false, status: 400, error: 'Code expired. Register again to get a new code.' }
  }

  const attempts = Number(row.attempts) || 0
  if (attempts >= OTP_MAX_ATTEMPTS) {
    await sqlRun('DELETE FROM registration_otps WHERE email = ?', [email])
    return { ok: false, status: 429, error: 'Too many attempts. Register again.' }
  }

  if (hashOtp(otp) !== String(row.otp_hash)) {
    await sqlRun('UPDATE registration_otps SET attempts = ? WHERE email = ?', [
      attempts + 1,
      email,
    ])
    return { ok: false, status: 400, error: 'Incorrect code' }
  }

  const exists = await sqlOne('SELECT username FROM users WHERE username = ?', [email])
  if (exists) {
    await sqlRun('DELETE FROM registration_otps WHERE email = ?', [email])
    return { ok: false, status: 409, error: 'An account with this email already exists' }
  }

  const created = await createDbUser(email, null, {
    passwordHash: String(row.password_hash),
    displayName: String(row.display_name || ''),
  })
  await sqlRun('DELETE FROM registration_otps WHERE email = ?', [email])

  if (!created.ok) {
    return { ok: false, status: 400, error: created.error || 'Could not create account' }
  }

  return {
    ok: true,
    user: created.user,
    displayName: String(row.display_name || ''),
  }
}

/**
 * Resend OTP for an existing pending registration (same password/name).
 * @param {{ email: string }} body
 */
export async function resendRegistrationOtp(body) {
  if (!alertEmailConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Email delivery is not configured. Contact support.',
    }
  }

  const email = normalizeUsername(body?.email || '')
  const emailErr = validateRegisterEmail(email)
  if (emailErr) return { ok: false, status: 400, error: emailErr }

  const row = await sqlOne('SELECT * FROM registration_otps WHERE email = ?', [email])
  if (!row) {
    return { ok: false, status: 400, error: 'No pending registration. Start again.' }
  }

  const age = Date.now() - Number(row.created_at || 0)
  if (age < RESEND_COOLDOWN_MS) {
    return {
      ok: false,
      status: 429,
      error: 'Please wait a minute before requesting another code',
    }
  }

  const otp = generateOtp()
  const now = Date.now()
  await sqlRun(
    `UPDATE registration_otps SET otp_hash = ?, expires_at = ?, attempts = 0, created_at = ? WHERE email = ?`,
    [hashOtp(otp), now + OTP_TTL_MS, now, email],
  )

  const sent = await sendOtpEmail(email, otp, String(row.display_name || ''))
  if (!sent) {
    return {
      ok: false,
      status: 502,
      error: 'Could not send verification email. Try again shortly.',
    }
  }

  return {
    ok: true,
    email,
    expiresInSec: Math.round(OTP_TTL_MS / 1000),
    message: 'We sent a new code to your email',
  }
}
