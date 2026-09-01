/**
 * Shared auth helpers for Express (prod) and Vite middleware (dev).
 *
 * Env:
 *   AUTH_SECRET  — required to enable auth (signing key for session cookie)
 *   AUTH_USERS   — "user1:$2b$...,user2:$2b$..." (bcrypt hashes)
 *
 * When either is missing, auth is disabled (open access) — useful for local dev.
 */
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import {
  normalizeUsername,
  verifyDbCredentials,
} from './userStore.mjs'
import {
  getAlertEmailOptIn,
  getPatternAlertIds,
  isEmailLogin,
  setAlertEmailOptIn,
  setPatternAlertIds,
} from './userPrefs.mjs'

export const COOKIE_NAME = 'asx_sid'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Auth is on when AUTH_SECRET is set (users from env and/or SQLite). */
export function authEnabled() {
  return Boolean(process.env.AUTH_SECRET?.trim())
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
    const hash = trimmed.slice(idx + 1).trim()
    if (user && hash) map.set(user, hash)
  }
  return map
}

export function authPublicConfig() {
  return {
    authRequired: authEnabled(),
  }
}

export async function verifyCredentials(username, password) {
  if (!username || !password) return null
  const users = loadUsers()
  const key = normalizeUsername(username)
  const envHash = users.get(key)
  if (envHash) {
    const ok = await bcrypt.compare(String(password), envHash)
    if (ok) return key
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

export function createSessionToken(username) {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET missing')
  const exp = Date.now() + MAX_AGE_MS
  const payload = b64url(`${username}|${exp}`)
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

/** @returns {string | null} username */
export function verifySessionToken(token) {
  if (!token || !process.env.AUTH_SECRET) return null
  const [payload, sig] = String(token).split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', process.env.AUTH_SECRET).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  try {
    const decoded = fromB64url(payload)
    const [username, expStr] = decoded.split('|')
    const exp = Number(expStr)
    if (!username || !Number.isFinite(exp) || Date.now() > exp) return null
    return username
  } catch {
    return null
  }
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

export function getUserFromRequest(req) {
  if (!authEnabled()) return null
  const cookies = parseCookies(req.headers?.cookie)
  return verifySessionToken(cookies[COOKIE_NAME] || '')
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
    const user = getUserFromRequest(req)
    if (!user) return send(401, { user: null, authRequired: true })
    const canReceiveAlertEmail = isEmailLogin(user)
    const alertEmailOptIn = canReceiveAlertEmail ? await getAlertEmailOptIn(user) : false
    const patternAlertIds = await getPatternAlertIds(user)
    return send(200, {
      user,
      authRequired: true,
      canReceiveAlertEmail,
      alertEmailOptIn,
      patternAlertIds,
    })
  }

  if (path === '/api/auth/pattern-alert-prefs' && method === 'GET') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    const patternAlertIds = await getPatternAlertIds(user)
    return send(200, { patternAlertIds })
  }

  if (path === '/api/auth/pattern-alert-prefs' && method === 'POST') {
    if (!authEnabled()) {
      return send(400, { error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return send(401, { error: 'Unauthorized', authRequired: true })
    let body
    try {
      body = await readJsonBody(req)
    } catch {
      return send(400, { error: 'Invalid JSON' })
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
    const user = getUserFromRequest(req)
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
    const optIn = Boolean(body?.optIn)
    await setAlertEmailOptIn(user, optIn)
    return send(200, { ok: true, alertEmailOptIn: optIn, canReceiveAlertEmail: true })
  }

  if (path === '/api/auth/config' && method === 'GET') {
    return send(200, authPublicConfig())
  }

  if (path === '/api/auth/register' && method === 'POST') {
    return send(403, { error: 'Registration is disabled' })
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
    if (!user) return send(401, { error: 'Invalid username or password' })
    const token = createSessionToken(user)
    return send(200, { user }, { 'Set-Cookie': sessionSetCookieHeader(token) })
  }

  if (path === '/api/auth/logout' && method === 'POST') {
    return send(200, { ok: true }, { 'Set-Cookie': sessionClearCookieHeader() })
  }

  return false
}

/** Returns true if request should be blocked (401 already sent via send). */
export function requireAuthOrSend(req, send) {
  if (!authEnabled()) return false
  const user = getUserFromRequest(req)
  if (user) return false
  send(401, { error: 'Unauthorized', authRequired: true })
  return true
}
