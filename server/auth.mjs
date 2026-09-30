/**
 * Shared auth helpers for Express (prod) and Vite middleware (dev).
 *
 * Env:
 *   AUTH_SECRET  — required to enable auth (signing key for session cookie)
 *   AUTH_USERS   — "user1:$2b$...,user2:$2b$..." (bcrypt hashes)
 *
 * When either is missing, auth is disabled (open access) — useful for local dev.
 *
 * Sessions are single-device: login / register / password change bumps
 * `auth_sessions.session_version`, which is embedded in the cookie. Older
 * cookies fail verification so prior devices are signed out.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import {
  normalizeUsername,
  verifyDbCredentials,
} from './userStore.mjs'
import { sqlOne, sqlRun } from './db.mjs'
import {
  getAlertEmailMinScore,
  getAlertEmailOptIn,
  getPatternAlertIds,
  getPatternAlertWatches,
  getPatternComboAlerts,
  isEmailLogin,
  setAlertEmailMinScore,
  setAlertEmailOptIn,
  setPatternAlertIds,
  setPatternAlertWatches,
  setPatternComboAlerts,
} from './userPrefs.mjs'

export const COOKIE_NAME = 'asx_sid'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const SESSION_VERSION_CACHE_MS = 3_000

/** @type {Map<string, { v: number, at: number }>} */
const sessionVersionCache = new Map()

/** Clears the in-memory session-version cache (tests only). */
export function clearSessionVersionCache() {
  sessionVersionCache.clear()
}

function authSecret() {
  return process.env.AUTH_SECRET?.trim() || ''
}

/** Auth is on when AUTH_SECRET is set (users from env and/or SQLite). */
export function authEnabled() {
  return Boolean(authSecret())
}

function envBool(name, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return defaultValue
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return defaultValue
}

/** Login required for all API access (production desk default). */
export function authMandatory() {
  return envBool('PRODUCTION_MODE', process.env.NODE_ENV === 'production') || envBool('AUTH_REQUIRED', false)
}

/** Exit or throw if mandatory auth is enabled but AUTH_SECRET is missing. */
export function assertAuthConfigured() {
  if (authMandatory() && !authEnabled()) {
    const msg =
      'Login is mandatory (PRODUCTION_MODE or AUTH_REQUIRED) but AUTH_SECRET is not set. ' +
      'Add AUTH_SECRET to .env / Azure app settings. See DEPLOY.md'
    throw new Error(msg)
  }
}

/** @returns {Map<string, string>} username → bcrypt hash */
export function loadUsers() {
  const map = new Map()
  const raw = process.env.AUTH_USERS || ''
  for (const part of raw.split(',')) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const idx = trimmed.indexOf(':')
    if (idx <= 0) continue
    const user = trimmed.slice(0, idx).trim().toLowerCase()
    // Azure App Settings sometimes escapes $ as $$ in bcrypt hashes.
    const hash = trimmed.slice(idx + 1).trim().replace(/\$\$/g, '$')
    if (user && hash) map.set(user, hash)
  }
  return map
}

export function envUserCount() {
  return loadUsers().size
}

export function authPublicConfig() {
  let stripeConfigured = false
  try {
    // Lazy import avoided — keep config sync for Connect handlers.
    stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY?.trim())
  } catch {
    stripeConfigured = false
  }
  return {
    authRequired: authEnabled(),
    stripeConfigured,
  }
}

export async function verifyCredentials(username, password) {
  if (!username || !password) return null
  const key = normalizeUsername(username)
  const users = loadUsers()
  const envHash = users.get(key)
  if (envHash) {
    try {
      const ok = await bcrypt.compare(String(password), envHash)
      if (ok) return key
    } catch {
      /* malformed AUTH_USERS hash — fall through to database */
    }
  }
  return verifyDbCredentials(username, password)
}

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad
  return Buffer.from(b64, 'base64').toString('utf8')
}

/**
 * Current single-session version for a user (0 if never bumped).
 * @param {string} username
 */
export async function getSessionVersion(username) {
  const u = normalizeUsername(username)
  const now = Date.now()
  const hit = sessionVersionCache.get(u)
  if (hit && now - hit.at < SESSION_VERSION_CACHE_MS) return hit.v
  try {
    const row = await sqlOne('SELECT session_version FROM auth_sessions WHERE username = ?', [u])
    const v = Number(row?.session_version) || 0
    sessionVersionCache.set(u, { v, at: now })
    return v
  } catch {
    return 0
  }
}

/**
 * Invalidate all existing session cookies for this user; returns the new version.
 * @param {string} username
 */
export async function bumpSessionVersion(username) {
  const u = normalizeUsername(username)
  const now = Date.now()
  const row = await sqlOne('SELECT session_version FROM auth_sessions WHERE username = ?', [u])
  const next = (Number(row?.session_version) || 0) + 1
  if (row) {
    await sqlRun(
      'UPDATE auth_sessions SET session_version = ?, updated_at = ? WHERE username = ?',
      [next, now, u],
    )
  } else {
    await sqlRun(
      'INSERT INTO auth_sessions (username, session_version, updated_at) VALUES (?, ?, ?)',
      [u, next, now],
    )
  }
  sessionVersionCache.set(u, { v: next, at: now })
  return next
}

/**
 * @param {string} username
 * @param {number} [sessionVersion]
 */
export function createSessionToken(username, sessionVersion = 0) {
  const secret = authSecret()
  if (!secret) throw new Error('AUTH_SECRET missing')
  const exp = Date.now() + MAX_AGE_MS
  const sv = Number(sessionVersion) || 0
  const payload = b64url(`${username}|${exp}|${sv}`)
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** Bump session version and return a fresh cookie token (kicks other devices). */
export async function issueSessionToken(username) {
  const sv = await bumpSessionVersion(username)
  return createSessionToken(username, sv)
}

/**
 * @param {string} token
 * @returns {{ username: string, sessionVersion: number } | null}
 */
export function parseSessionToken(token) {
  const secret = authSecret()
  if (!token || !secret) return null
  const [payload, sig] = String(token).split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const decoded = fromB64url(payload)
    const parts = decoded.split('|')
    const username = parts[0]
    const exp = Number(parts[1])
    const sessionVersion = parts.length >= 3 ? Number(parts[2]) : 0
    if (!username || !Number.isFinite(exp) || Date.now() > exp) return null
    return {
      username,
      sessionVersion: Number.isFinite(sessionVersion) ? sessionVersion : 0,
    }
  } catch {
    return null
  }
}

/** @returns {string | null} username (signature + expiry only; no single-session check) */
export function verifySessionToken(token) {
  return parseSessionToken(token)?.username ?? null
}

export function parseCookies(cookieHeader) {
  /** @type {Record<string, string>} */
  const out = {}
  if (!cookieHeader) return out
  for (const part of String(cookieHeader).split(';')) {
    const idx = part.indexOf('=')
    if (idx < 0) continue
    const k = part.slice(0, idx).trim()
    const v = part.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}

/** @returns {Promise<string | null>} */
export async function getUserFromRequest(req) {
  if (!authEnabled()) return null
  const cookies = parseCookies(req.headers?.cookie)
  const parsed = parseSessionToken(cookies[COOKIE_NAME] || '')
  if (!parsed) return null
  const current = await getSessionVersion(parsed.username)
  if (parsed.sessionVersion !== current) return null
  return parsed.username
}

/** Invalidate the session version for whoever owns this request cookie (best-effort). */
export async function invalidateRequestSession(req) {
  if (!authEnabled()) return
  const cookies = parseCookies(req.headers?.cookie)
  const parsed = parseSessionToken(cookies[COOKIE_NAME] || '')
  if (!parsed?.username) return
  try {
    await bumpSessionVersion(parsed.username)
  } catch {
    /* ignore */
  }
}

function secureCookiesEnabled() {
  if (process.env.RENDER === 'true') return true
  if (process.env.FORCE_SECURE_COOKIES === 'true') return true
  return process.env.NODE_ENV === 'production'
}

export function sessionSetCookieHeader(token) {
  const secure = secureCookiesEnabled()
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`,
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionClearCookieHeader() {
  const secure = secureCookiesEnabled()
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

/** Read JSON body from Node IncomingMessage (Vite / raw http). */
export function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        if (!raw) return resolve({})
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

/**
 * Handle /api/auth/* routes. Returns true if handled.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {(status: number, body: unknown, headers?: Record<string, string>) => void} send
 */
export async function handleAuthApi(req, res, send) {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname
  const method = (req.method || 'GET').toUpperCase()

  if (path === '/api/auth/me' && method === 'GET') {
    if (!authEnabled()) {
      return send(200, { user: null, authRequired: false })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(200, { user: null, authRequired: true })
    const canReceiveAlertEmail = isEmailLogin(user)
    const alertEmailOptIn = canReceiveAlertEmail ? await getAlertEmailOptIn(user) : false
    const alertEmailMinScore = canReceiveAlertEmail ? await getAlertEmailMinScore(user) : 80
    const patternAlertIds = await getPatternAlertIds(user)
    const patternAlertWatches = await getPatternAlertWatches(user)
    const { getDbUserProfile } = await import('./userStore.mjs')
    const profile = await getDbUserProfile(user)
    return send(200, {
      user,
      displayName: profile?.displayName || null,
      authRequired: true,
      canReceiveAlertEmail,
      alertEmailOptIn,
      alertEmailMinScore,
      patternAlertIds,
      patternAlertWatches,
    })
  }

  if (path === '/api/auth/pattern-alert-prefs' && method === 'GET') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    return send(200, {
      patternAlertIds: await getPatternAlertIds(user),
      patternAlertWatches: await getPatternAlertWatches(user),
      patternComboAlerts: await getPatternComboAlerts(user),
    })
  }

  if (path === '/api/auth/pattern-alert-prefs' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const rawCombos = body?.combos ?? body?.patternComboAlerts
    if (Array.isArray(rawCombos)) {
      const saved = await setPatternComboAlerts(user, rawCombos)
      return send(200, {
        ok: true,
        patternComboAlerts: saved,
        patternAlertIds: await getPatternAlertIds(user),
      })
    }
    const rawWatches = body?.watches ?? body?.patternAlertWatches
    if (Array.isArray(rawWatches)) {
      const saved = await setPatternAlertWatches(user, rawWatches)
      return send(200, {
        ok: true,
        patternAlertWatches: saved,
        patternAlertIds: await getPatternAlertIds(user),
      })
    }
    const raw = body?.patternIds ?? body?.patternAlertIds
    const patternIds = Array.isArray(raw) ? raw : []
    const saved = await setPatternAlertIds(user, patternIds)
    return send(200, { ok: true, patternAlertIds: saved })
  }

  if (path === '/api/auth/alert-email-opt-in' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    if (!isEmailLogin(user)) {
      return send(400, {
        error: 'Alert email requires logging in with an email address (not a username only).',
      })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    if (body?.optIn != null) {
      await setAlertEmailOptIn(user, Boolean(body.optIn))
    }
    let alertEmailMinScore = await getAlertEmailMinScore(user)
    if (body?.minScore != null || body?.alertEmailMinScore != null) {
      alertEmailMinScore = await setAlertEmailMinScore(
        user,
        body.minScore ?? body.alertEmailMinScore,
      )
    }
    return send(200, {
      ok: true,
      alertEmailOptIn: await getAlertEmailOptIn(user),
      alertEmailMinScore,
      canReceiveAlertEmail: true,
    })
  }

  if (path === '/api/auth/config' && method === 'GET') {
    return send(200, authPublicConfig())
  }

  if (path === '/api/auth/register' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { startRegistration } = await import('./registration.mjs')
    const result = await startRegistration(body)
    if (!result.ok) return send(result.status || 400, { error: result.error })
    return send(200, {
      ok: true,
      email: result.email,
      expiresInSec: result.expiresInSec,
      message: result.message,
    })
  }

  if (path === '/api/auth/verify-registration' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { verifyRegistration } = await import('./registration.mjs')
    const result = await verifyRegistration(body)
    if (!result.ok) return send(result.status || 400, { error: result.error })
    const token = await issueSessionToken(result.user)
    return send(
      200,
      { ok: true, user: result.user, displayName: result.displayName },
      { 'Set-Cookie': sessionSetCookieHeader(token) },
    )
  }

  if (path === '/api/auth/resend-registration-otp' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { resendRegistrationOtp } = await import('./registration.mjs')
    const result = await resendRegistrationOtp(body)
    if (!result.ok) return send(result.status || 400, { error: result.error })
    return send(200, {
      ok: true,
      email: result.email,
      expiresInSec: result.expiresInSec,
      message: result.message,
    })
  }

  if (path === '/api/auth/login' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const user = await verifyCredentials(body.username, body.password)
    if (!user) {
      const { log } = await import('./log.mjs')
      const { countDbUsers } = await import('./userStore.mjs')
      const dbCount = await countDbUsers()
      log('warn', 'auth.login.fail', {
        username: normalizeUsername(body.username || ''),
        envUser: loadUsers().has(normalizeUsername(body.username || '')),
        dbUserCount: dbCount,
      })
      return send(401, { error: 'Invalid username or password' })
    }
    const token = await issueSessionToken(user)
    return send(200, { user }, { 'Set-Cookie': sessionSetCookieHeader(token) })
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    await invalidateRequestSession(req)
    return send(200, { ok: true }, { 'Set-Cookie': sessionClearCookieHeader() })
  }

  if (path === '/api/auth/forgot-password' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { requestPasswordReset } = await import('./passwordReset.mjs')
    const result = await requestPasswordReset(body, req)
    if (!result.ok) return send(result.status || 400, { error: result.error })
    return send(200, { ok: true, message: result.message })
  }

  if (path === '/api/auth/reset-password' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { completePasswordReset } = await import('./passwordReset.mjs')
    const result = await completePasswordReset(body)
    if (!result.ok) return send(result.status || 400, { error: result.error })
    return send(200, { ok: true, message: result.message })
  }

  if (path === '/api/auth/profile' && method === 'GET') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    const { getDbUserProfile } = await import('./userStore.mjs')
    const profile = await getDbUserProfile(user)
    return send(200, {
      user,
      displayName: profile?.displayName || null,
      canEditProfile: Boolean(profile),
      canReceiveAlertEmail: isEmailLogin(user),
    })
  }

  if (path === '/api/auth/profile' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { updateDbDisplayName, updateDbUsername, getDbUserProfile } = await import(
      './userStore.mjs'
    )
    let current = user
    if (body?.displayName != null) {
      const r = await updateDbDisplayName(current, body.displayName)
      if (!r.ok) return send(400, { error: r.error })
    }
    if (body?.username != null && normalizeUsername(body.username) !== normalizeUsername(current)) {
      const r = await updateDbUsername(current, body.username)
      if (!r.ok) return send(400, { error: r.error })
      current = r.user
    }
    const profile = await getDbUserProfile(current)
    const token = await issueSessionToken(current)
    return send(
      200,
      {
        ok: true,
        user: current,
        displayName: profile?.displayName || null,
        canEditProfile: Boolean(profile),
        canReceiveAlertEmail: isEmailLogin(current),
      },
      { 'Set-Cookie': sessionSetCookieHeader(token) },
    )
  }

  if (path === '/api/auth/change-password' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = await getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
    }
    const { changeDbPassword } = await import('./userStore.mjs')
    const result = await changeDbPassword(user, body?.currentPassword, body?.newPassword)
    if (!result.ok) return send(400, { error: result.error })
    const token = await issueSessionToken(user)
    return send(
      200,
      { ok: true, message: 'Password updated' },
      { 'Set-Cookie': sessionSetCookieHeader(token) },
    )
  }

  return false
}

/** Returns true if request should be blocked (401 already sent via send). */
export async function requireAuthOrSend(req, send) {
  if (!authEnabled()) return false
  const user = await getUserFromRequest(req)
  if (user) return false
  send(401, { error: 'Unauthorized', authRequired: true })
  return true
}
