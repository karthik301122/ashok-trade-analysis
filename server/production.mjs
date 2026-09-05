import { getUserFromRequest, authEnabled } from './auth.mjs'
import { eodhdOnlyMode } from './eodhd.mjs'
import { isDbAdmin } from './userStore.mjs'

function envBool(name, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return defaultValue
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return defaultValue
}

/** Production desk mode — disables browser universe crawl by default. */
export function isProductionMode() {
  return envBool('PRODUCTION_MODE', process.env.NODE_ENV === 'production')
}

export function browserUniverseFetchEnabled() {
  if (eodhdOnlyMode()) return false
  if (envBool('ALLOW_BROWSER_UNIVERSE_FETCH', false)) return true
  if (isProductionMode()) return false
  return true
}

function adminUserSet() {
  const raw = process.env.ADMIN_USERS?.trim()
  if (!raw) return new Set()
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}

export async function isAdminUser(username) {
  if (!username) return false
  const key = String(username).trim().toLowerCase()
  const admins = adminUserSet()
  if (admins.size && admins.has(key)) return true
  return await isDbAdmin(username)
}

/**
 * Admin via session user list or `x-admin-key` header (cron / ops).
 * @param {import('http').IncomingMessage} req
 */
export async function isAdminRequest(req) {
  const key = process.env.ADMIN_API_KEY?.trim()
  if (key && req.headers?.['x-admin-key'] === key) return true
  const user = getUserFromRequest(req)
  return await isAdminUser(user)
}

/** Cron / ops: signed-in user or valid `x-admin-key` when auth is enabled. */
export async function requireSessionOrAdmin(req, send) {
  if (!authEnabled()) return false
  if (getUserFromRequest(req) || (await isAdminRequest(req))) return false
  send(401, { error: 'Unauthorized', authRequired: true })
  return true
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {(status: number, body: unknown) => void} send
 */
export async function requireAdminOrSend(req, send) {
  if (!isProductionMode()) return false
  if (await isAdminRequest(req)) return false
  send(403, {
    error: 'Admin only in production mode',
    hint: 'Set ADMIN_USERS or call with x-admin-key header',
  })
  return true
}

export function seriesRateLimitPerMinute() {
  const n = Number(process.env.SERIES_RATE_LIMIT ?? process.env.API_RATE_LIMIT)
  if (Number.isFinite(n) && n > 0) return n
  return isProductionMode() ? 2000 : 180
}

export function snapshotRateLimitPerMinute() {
  const n = Number(process.env.SNAPSHOT_RATE_LIMIT)
  if (Number.isFinite(n) && n > 0) return n
  // Chunked desk load needs meta + ~ceil(N/400) stock pages; 60/min was too low and
  // caused the wait-loop to rate-limit itself into a permanent 96% spinner.
  return isProductionMode() ? 300 : 180
}

/** Higher ceiling for paginated /api/snapshot/stocks (many small GETs per page load). */
export function snapshotStocksRateLimitPerMinute() {
  const n = Number(process.env.SNAPSHOT_STOCKS_RATE_LIMIT)
  if (Number.isFinite(n) && n > 0) return n
  return isProductionMode() ? 600 : 300
}

export function minSnapshotStockRatio() {
  const n = Number(process.env.SNAPSHOT_MIN_STOCK_RATIO)
  if (Number.isFinite(n) && n > 0 && n <= 1) return n
  return isProductionMode() ? 0.35 : 0.5
}

/**
 * @param {{ builtAt?: number, loaded?: number, failed?: number, fresh?: boolean }} snap
 * @param {number} universeTotal
 */
export function readinessFromSnapshot(snap, universeTotal) {
  const loaded = Number(snap?.loaded) || 0
  const failed = Number(snap?.failed) || 0
  const total = universeTotal || loaded + failed
  const ratio = total > 0 ? loaded / total : 0
  const minRatio = minSnapshotStockRatio()
  return {
    snapshotFresh: Boolean(snap?.fresh),
    snapshotLoaded: loaded,
    snapshotFailed: failed,
    snapshotTotal: total,
    snapshotCoverage: Math.round(ratio * 1000) / 10,
    snapshotAcceptable: loaded > 0 && ratio >= minRatio,
    multiUserReady:
      isProductionMode() &&
      browserUniverseFetchEnabled() === false &&
      Boolean(snap?.fresh) &&
      ratio >= 0.9,
  }
}
