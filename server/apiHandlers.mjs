/**
 * Shared /api handlers for Vite middleware and Express prod server.
 */
import { authEnabled, handleAuthApi, requireAuthOrSend, getUserFromRequest, authPublicConfig, createSessionToken, sessionSetCookieHeader, verifyCredentials, sessionClearCookieHeader, envUserCount, loadUsers } from './auth.mjs'
import { countDbUsers, createDbUser, listDbUsernames, normalizeUsername } from './userStore.mjs'
import { getCachedSeries, getIntradaySeries, seriesCacheFileCount } from './getSeries.mjs'
import { isAsxIndexSeriesTicker } from './asxIndexes.mjs'
import { buildIndexAnalysis, warmIndexAnalysisSeries } from './indexAnalysis.mjs'
import { readBreadthHistory, upsertBreadthPoint, UNIVERSE_IDS } from './breadthStore.mjs'
import { computeBreadthChartHistory, getIndexBarsForChart } from './breadthHistory.mjs'
import { dbPath, dbStoreLabel, initDb } from './db.mjs'
import {
  getSnapshotJobStatus,
  peekSnapshotJobStatus,
  isSnapshotFresh,
  maybeStartBackgroundSnapshot,
  maybeAutoRetryHighFailures,
  readMarketSnapshotMeta,
  readMarketSnapshotLightMeta,
  readMarketSnapshotRow,
  readMarketSnapshotStocksChunk,
  runAsx200ForceRefresh,
  runUniverseSnapshot,
  runRetryFailedSnapshot,
  runRebuildSnapshotFromCache,
  syncSnapshotPricesFromSeriesMeta,
  peekCachedLastPrices,
  scheduleLastPricesCacheWarm,
  ensureStocksPerfCacheWarm,
  AUTO_RETRY_FAILED_THRESHOLD,
} from './snapshotJob.mjs'
import {
  createAlertRule,
  deleteAlertRule,
  evaluateAlerts,
  listAlertEvents,
  listAlertRules,
} from './alerts.mjs'
import { queryPatternScanState, upsertPatternScanBatch } from './patternScanStore.mjs'
import { alertEmailConfigured, sendMail } from './alertEmail.mjs'
import {
  getAlertEmailMinScore,
  getAlertEmailOptIn,
  getMarketNoteOptIn,
  getPatternAlertIds,
  getPatternAlertWatches,
  getPatternComboAlerts,
  isEmailLogin,
  setAlertEmailMinScore,
  setAlertEmailOptIn,
  setMarketNoteOptIn,
  setPatternAlertIds,
  setPatternAlertWatches,
  setPatternComboAlerts,
} from './userPrefs.mjs'
import { getFundamentals } from './fundamentals.mjs'
import { getFilingsForTicker, getLargestDisclosedBuys } from './asxFilings.mjs'
import { readPatternHitsDay } from './patternHitsStore.mjs'
import { runDeskPatternJob } from './patternJob.mjs'
import { getUserPatternPrefs, saveUserPatternPrefs } from './userPatternsStore.mjs'
import {
  listWatchlists,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
} from './watchlistStore.mjs'
import { createShareLink, getShareLink } from './shareLinkStore.mjs'
import {
  createOrg,
  getOrg,
  listOrgsForUser,
  listMembers,
  getMember,
  createInvite,
  createInvitesFromEmails,
  listInvites,
  getInviteByToken,
  revokeInvite,
  removeMember,
  setMemberRole,
  seatsAvailable,
  acceptInvite,
  getBranding,
  setBranding,
} from './orgStore.mjs'
import { publish as publishTrainerDoc, listForMember as listTrainerPublications } from './trainerPublishStore.mjs'
import {
  createCheckoutSession,
  createIndividualCheckoutSession,
  createBillingPortalSession,
  cancelOrgSubscription,
  abandonOrgCheckout,
  constructWebhookEvent,
  handleStripeWebhookEvent,
} from './stripeBilling.mjs'
import { getDeskEntitlement } from './deskEntitlement.mjs'
import { checkRateLimit, clientKey, log, pruneRateLimitBuckets } from './log.mjs'
import { seriesProviderName, isIntradayInterval } from './fetchSeries.mjs'
import { eodhdOnlyMode } from './eodhd.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import {
  browserUniverseFetchEnabled,
  isAdminRequest,
  isProductionMode,
  readinessFromSnapshot,
  requireAdminOrSend,
  requireSessionOrAdmin,
  seriesRateLimitPerMinute,
  snapshotRateLimitPerMinute,
  snapshotStocksRateLimitPerMinute,
  snapshotRefreshPostLimit,
  snapshotRefreshPostWindowMs,
} from './production.mjs'
import { getLiveQuotesMeta } from './liveQuotes.mjs'
import { runLiveQuoteRefresh } from './liveQuoteJob.mjs'
import { maintenanceEnabled, maintenanceMessage } from './maintenance.mjs'
import { eodhdDailyLimitMeta } from './eodhdLimit.mjs'

const __apiDir = path.dirname(fileURLToPath(import.meta.url))
let universeCountCache = null

function getUniverseCount() {
  if (universeCountCache != null) return universeCountCache
  try {
    const p = path.join(__apiDir, '..', 'src', 'data', 'asxUniverse.json')
    universeCountCache = JSON.parse(fs.readFileSync(p, 'utf8')).length
  } catch {
    universeCountCache = 2000
  }
  return universeCountCache
}

/** Public /api/health — load balancers + desk boot. No DB host, secrets, or internals. */
async function buildPublicHealthPayload(req) {
  let liveQuotes = { enabled: false }
  let admin = false
  try {
    liveQuotes = await withTimeout(getLiveQuotesMeta(), 800)
  } catch {
    /* stub */
  }
  try {
    admin = await withTimeout(isAdminRequest(req), 500)
  } catch {
    /* false */
  }
  return {
    ok: true,
    maintenance: maintenanceEnabled(),
    maintenanceMessage: maintenanceEnabled() ? maintenanceMessage() : undefined,
    productionMode: isProductionMode(),
    browserUniverseFetch: browserUniverseFetchEnabled(),
    isAdmin: admin,
    provider: seriesProviderName(),
    eodhdOnly: eodhdOnlyMode(),
    liveQuotes,
    alertEmailEnabled: alertEmailConfigured(),
    authRequired: authEnabled(),
  }
}

/** Admin-only internals previously exposed on public /api/health. */
async function buildHealthDetailPayload(req) {
  const base = await buildPublicHealthPayload(req)
  let snap = null
  let job = { status: 'unknown', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
  try {
    snap = await withTimeout(readMarketSnapshotLightMeta(), 800)
  } catch {
    /* null */
  }
  try {
    job = await withTimeout(peekSnapshotJobStatus(), 800)
  } catch {
    /* stub */
  }
  const universeTotal = getUniverseCount()
  const snapMeta = snap
    ? {
        builtAt: snap.builtAt,
        loaded: snap.loaded,
        failed: snap.failed,
        fresh: isSnapshotFresh(snap.builtAt),
      }
    : null
  const readiness = readinessFromSnapshot(
    snapMeta ? { ...snapMeta, fresh: snapMeta.fresh } : {},
    universeTotal,
  )
  return {
    ...base,
    eodhd: Boolean(process.env.EODHD_API_TOKEN?.trim()),
    barsAsOf: null,
    barsAsOfLabel: null,
    rateLimits: {
      seriesPerMinute: seriesRateLimitPerMinute(),
      snapshotPerMinute: snapshotRateLimitPerMinute(),
    },
    readiness,
    authDbUserCount: await countDbUsers().catch(() => 0),
    authEnvUserCount: authEnabled() ? envUserCount() : 0,
    eodhdDailyLimit: eodhdDailyLimitMeta(),
    seriesCached: 0,
    store: dbStoreLabel(),
    database: dbPath(),
    snapshot: snapMeta,
    job,
    autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
  }
}

function snapshotStockCount(stocks) {
  if (!stocks) return 0
  if (Array.isArray(stocks)) return stocks.length
  return Object.keys(stocks).length
}

/** Hard deadline for DB work on boot/critical paths. */
async function withTimeout(p, ms) {
  let timer
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Cap concurrent /api/series work so chart storms cannot starve meta/health. */
let seriesInFlight = 0
/** After slow series responses, briefly refuse new series so snapshot/meta can recover. */
let seriesShedUntil = 0
/** Last time snapshot meta timed out — keep series shed until meta recovers. */
let lastMetaTimeoutAt = 0
/** @type {number[]} */
const seriesRecentMs = []
/** Per-IP series stamps — used to kill leftover browser-universe crawls. */
/** @type {Map<string, number[]>} */
const seriesHitsByIp = new Map()
/** @type {Map<string, number>} */
const seriesBanUntilByIp = new Map()

function seriesMaxInFlight() {
  const n = Number(process.env.SERIES_MAX_IN_FLIGHT)
  if (Number.isFinite(n) && n > 0) return n
  // Pattern scans + charts must not compete; 1 keeps meta/health alive on Azure.
  return isProductionMode() ? 1 : 8
}

function seriesKillSwitchEnabled() {
  const raw = process.env.SERIES_KILL_SWITCH?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/**
 * Production requires desk=1 (current client). Old browser-universe crawls omit it,
 * so we can refuse them without anyone closing remote tabs.
 */
function seriesHasDeskToken(req) {
  try {
    const url = new URL(req.url || '/', 'http://localhost')
    if (url.searchParams.get('desk') === '1') return true
  } catch {
    /* ignore */
  }
  const header = req.headers?.['x-traderscope-desk']
  return header === '1' || header === 'true'
}

function seriesClientAllowed(req) {
  if (!isProductionMode()) return true
  const raw = process.env.SERIES_REQUIRE_DESK_TOKEN?.trim().toLowerCase()
  // Default ON in production — set SERIES_REQUIRE_DESK_TOKEN=0 to disable.
  if (raw === '0' || raw === 'false' || raw === 'no') return true
  return seriesHasDeskToken(req)
}

/** Refuse /api/series globally for a while (does not close browser tabs; rejects their calls). */
function killSeriesTraffic(reason, ms = 180_000) {
  const until = Date.now() + Math.max(5_000, ms)
  seriesShedUntil = Math.max(seriesShedUntil, until)
  log('warn', 'series.killed', { reason, untilMs: until - Date.now() })
}

function noteSeriesLatency(ms) {
  const n = Number(ms)
  if (!Number.isFinite(n) || n < 0) return
  seriesRecentMs.push(n)
  if (seriesRecentMs.length > 20) seriesRecentMs.shift()
  // Cold EODHD index pulls often take 3–8s — do not shed the whole desk on one slow miss.
  // Only shed when the pool is clearly congested (very slow request or elevated p50).
  if (n >= 12_000) {
    killSeriesTraffic('slow-series', 90_000)
  } else if (seriesRecentMs.length >= 6) {
    const sorted = seriesRecentMs.slice().sort((a, b) => a - b)
    const p50 = sorted[Math.floor(sorted.length / 2)]
    if (p50 >= 800) killSeriesTraffic('series-p50-high', 60_000)
  }
}

function noteSeriesHitFromIp(ip, opts = {}) {
  const key = String(ip || 'unknown')
  const now = Date.now()
  const banUntil = seriesBanUntilByIp.get(key) || 0
  if (banUntil > now) return 'ip-banned'

  let hits = seriesHitsByIp.get(key)
  if (!hits) {
    hits = []
    seriesHitsByIp.set(key, hits)
  }
  hits.push(now)
  // Keep ~2 minutes of hits.
  while (hits.length && now - hits[0] > 120_000) hits.shift()
  // Desk Index Analysis alone needs ~15 series; allow more when desk=1 is present.
  // Anonymous / old crawls stay on the tight 25/2min cap.
  const maxHits = opts.desk ? 80 : 25
  if (isProductionMode() && hits.length >= maxHits) {
    seriesBanUntilByIp.set(key, now + 5 * 60_000)
    log('warn', 'series.ip_banned', { ip: key, hits: hits.length, banMs: 5 * 60_000, desk: Boolean(opts.desk) })
    killSeriesTraffic('crawl-detected', 120_000)
    return 'ip-banned'
  }
  return null
}

function seriesAdmissionBlocked(req) {
  if (seriesKillSwitchEnabled()) return 'kill-switch'
  if (seriesInFlight >= seriesMaxInFlight()) return 'busy'
  if (Date.now() < seriesShedUntil) return 'shedding'
  if (lastMetaTimeoutAt && Date.now() - lastMetaTimeoutAt < 120_000) return 'meta-recovering'
  const ipBlock = noteSeriesHitFromIp(clientKey(req), { desk: seriesHasDeskToken(req) })
  if (ipBlock) return ipBlock
  return null
}

/** Short-lived meta payload so concurrent desk loads share one DB round-trip. */
let snapshotMetaPayloadCache = /** @type {{ at: number, body: object } | null} */ (null)
const SNAPSHOT_META_CACHE_MS = 2_000
/** Last-good meta for emergency serve when DB is wedged. */
let snapshotMetaLastGood = /** @type {{ at: number, body: object } | null} */ (null)

function seriesHandlerTimeoutMs(ticker) {
  const n = Number(process.env.SERIES_HANDLER_TIMEOUT_MS)
  if (Number.isFinite(n) && n > 0) return n
  // Cold EODHD sector-index pulls often need >6s; keep equities tight.
  if (ticker && isAsxIndexSeriesTicker(ticker)) return isProductionMode() ? 30_000 : 45_000
  return isProductionMode() ? 6_000 : 30_000
}

/**
 * Fail-fast snapshot meta for desk boot. Never awaits full lastPrices DB scan or
 * job recover/reconcile — those run in the background after the response.
 */
async function buildSnapshotMetaPayload() {
  const now = Date.now()
  if (snapshotMetaPayloadCache && now - snapshotMetaPayloadCache.at < SNAPSHOT_META_CACHE_MS) {
    return snapshotMetaPayloadCache.body
  }

  const metaMs = Number(process.env.SNAPSHOT_META_DB_MS)
  const budget = Number.isFinite(metaMs) && metaMs > 0 ? metaMs : 2_500

  let meta
  try {
    meta = await withTimeout(readMarketSnapshotMeta(), budget)
  } catch (err) {
    // Prefer last-good over failing the desk boot loop while series wedged Postgres.
    if (snapshotMetaLastGood?.body) {
      log('warn', 'snapshot.meta.stale_ok', {
        ageMs: now - snapshotMetaLastGood.at,
        message: err instanceof Error ? err.message : String(err),
      })
      return {
        ...snapshotMetaLastGood.body,
        metaStale: true,
        metaStaleAgeMs: now - snapshotMetaLastGood.at,
      }
    }
    throw err
  }
  if (!meta) {
    if (snapshotMetaLastGood?.body) {
      return {
        ...snapshotMetaLastGood.body,
        metaStale: true,
        metaStaleAgeMs: now - snapshotMetaLastGood.at,
      }
    }
    return null
  }

  scheduleLastPricesCacheWarm()
  void syncSnapshotPricesFromSeriesMeta()
  void maybeStartBackgroundSnapshot()
  void maybeAutoRetryHighFailures()
  // Warm stock map off the request path so later /stocks pages and mapTotal are accurate.
  void ensureStocksPerfCacheWarm().catch(() => {})

  let job = {
    status: 'idle',
    autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
    trigger: null,
  }
  try {
    job = await withTimeout(peekSnapshotJobStatus(), 600)
  } catch {
    /* stub */
  }

  const body = {
    ...meta,
    lastPrices: peekCachedLastPrices(),
    browserUniverseFetch: browserUniverseFetchEnabled(),
    productionMode: isProductionMode(),
    job,
    autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
  }
  snapshotMetaPayloadCache = { at: Date.now(), body }
  snapshotMetaLastGood = { at: Date.now(), body }
  return body
}

function requireAuthConnect(req, send) {
  return requireAuthOrSend(req, send)
}

/** Auth gate that also requires a resolved session user (for user-scoped stores). */
function requireUserOrSend(req, send) {
  if (requireAuthOrSend(req, send)) return null
  const user = getUserFromRequest(req)
  if (!user) {
    send(401, { error: 'Unauthorized', authRequired: true })
    return null
  }
  return user
}

function expressSend(res) {
  return (status, body) => {
    res.status(status).json(body)
  }
}

function requireUserExpress(req, res) {
  return requireUserOrSend(req, expressSend(res))
}

function publicAppUrl() {
  return String(process.env.PUBLIC_APP_URL || 'https://tradersscope.com').replace(/\/$/, '')
}

function absoluteInviteUrl(invite) {
  const path =
    invite?.inviteUrlPath ||
    (invite?.token ? `/invite?token=${encodeURIComponent(invite.token)}` : null)
  return path ? `${publicAppUrl()}${path}` : null
}

async function sendOrgInviteMail(invite, orgName) {
  const inviteUrl = absoluteInviteUrl(invite)
  if (!inviteUrl || !invite?.email) return false
  const name = orgName || 'an organisation'
  return sendMail({
    to: invite.email,
    subject: `You're invited to join ${name} on Traders Scope`,
    text: [
      `You've been invited to join ${name} on Traders Scope.`,
      '',
      'Open this link, sign in with this email address, and join using your school seat:',
      inviteUrl,
      '',
      'This invite expires in 7 days. No individual subscription is required.',
    ].join('\n'),
    html: [
      `<p>You've been invited to join <strong>${name}</strong> on Traders Scope.</p>`,
      `<p><a href="${inviteUrl}">Open invite and join</a></p>`,
      `<p style="font-size:12px;color:#666">Sign in with ${invite.email}. Uses a school seat — no individual plan. Invite expires in 7 days.</p>`,
    ].join(''),
  })
}

function parseInviteEmailsFromBody(body) {
  if (Array.isArray(body?.emails)) {
    return body.emails.map((e) => String(e || '').trim()).filter(Boolean)
  }
  const csv = String(body?.csv || body?.text || '').trim()
  if (!csv) return []
  return csv
    .split(/[\n,;]+/)
    .map((e) => e.trim().replace(/^["']|["']$/g, ''))
    .filter((e) => e.includes('@'))
}

function rateLimitOrSend(req, send, route, limit) {
  pruneRateLimitBuckets()
  const key = `${clientKey(req)}:${route}`
  const result = checkRateLimit(key, { limit, windowMs: 60_000 })
  if (!result.ok) {
    log('warn', 'rate_limited', { route, key: clientKey(req), retryAfterMs: result.retryAfterMs })
    const retrySec = Math.max(1, Math.ceil((result.retryAfterMs ?? 10_000) / 1000))
    send(
      429,
      {
        error: 'Too many requests',
        retryAfterMs: result.retryAfterMs,
      },
      { 'Retry-After': String(retrySec) },
    )
    return true
  }
  return false
}

function seriesRateLimitOrExpress(req, res) {
  pruneRateLimitBuckets()
  const key = `${clientKey(req)}:series`
  const result = checkRateLimit(key, { limit: seriesRateLimitPerMinute(), windowMs: 60_000 })
  if (!result.ok) {
    const retrySec = Math.max(1, Math.ceil((result.retryAfterMs ?? 10_000) / 1000))
    log('warn', 'rate_limited', { route: 'series', key: clientKey(req), retryAfterMs: result.retryAfterMs })
    res.setHeader('Retry-After', String(retrySec))
    res.status(429).json({
      error: 'Too many requests',
      retryAfterMs: result.retryAfterMs,
    })
    return true
  }
  return false
}

/** How long a running job must age before force=1 may supersede it (hung recovery). */
function snapshotRefreshSupersedeAfterMs() {
  const n = Number(process.env.SNAPSHOT_REFRESH_SUPERSEDE_MS)
  if (Number.isFinite(n) && n > 0) return n
  return 40 * 60_000
}

/**
 * True when we should reject starting another rebuild (spam / mid-job restart).
 * force=1 only supersedes after the job looks hung.
 */
function shouldBlockSnapshotRefreshStart(status, { force = false } = {}) {
  if (status?.status !== 'running') return false
  const started = Number(status.startedAt) || 0
  const age = started > 0 ? Date.now() - started : 0
  if (force && age >= snapshotRefreshSupersedeAfterMs()) return false
  return true
}

function snapshotRefreshPostRateLimitOrSend(req, send) {
  pruneRateLimitBuckets()
  const key = `${clientKey(req)}:snapshot-refresh-post`
  const result = checkRateLimit(key, {
    limit: snapshotRefreshPostLimit(),
    windowMs: snapshotRefreshPostWindowMs(),
  })
  if (!result.ok) {
    const retrySec = Math.max(1, Math.ceil((result.retryAfterMs ?? 60_000) / 1000))
    log('warn', 'rate_limited', {
      route: 'snapshot-refresh-post',
      key: clientKey(req),
      retryAfterMs: result.retryAfterMs,
    })
    send(
      429,
      {
        error: 'Refresh cooldown — wait before starting another rebuild',
        retryAfterMs: result.retryAfterMs,
      },
      { 'Retry-After': String(retrySec) },
    )
    return true
  }
  return false
}

function snapshotRefreshPostRateLimitOrExpress(req, res) {
  pruneRateLimitBuckets()
  const key = `${clientKey(req)}:snapshot-refresh-post`
  const result = checkRateLimit(key, {
    limit: snapshotRefreshPostLimit(),
    windowMs: snapshotRefreshPostWindowMs(),
  })
  if (!result.ok) {
    const retrySec = Math.max(1, Math.ceil((result.retryAfterMs ?? 60_000) / 1000))
    log('warn', 'rate_limited', {
      route: 'snapshot-refresh-post',
      key: clientKey(req),
      retryAfterMs: result.retryAfterMs,
    })
    res.setHeader('Retry-After', String(retrySec))
    res.status(429).json({
      error: 'Refresh cooldown — wait before starting another rebuild',
      retryAfterMs: result.retryAfterMs,
    })
    return true
  }
  return false
}

/**
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {(status: number, body: unknown, headers?: Record<string, string>) => void} send
 */
export async function handleConnectApi(req, res, send) {
  await initDb()
  const url = new URL(req.url || '/', 'http://localhost')
  if (!url.pathname.startsWith('/api/')) return false
  const started = Date.now()

  const authHandled = await handleAuthApi(req, res, send)
  if (authHandled !== false) return true

  if (url.pathname.startsWith('/api/series/')) {
    if (requireAuthConnect(req, send)) return true
    if (!seriesClientAllowed(req)) {
      log('warn', 'series.rejected_legacy_client', { key: clientKey(req) })
      send(403, {
        error: 'Legacy client blocked',
        hint: 'Hard-refresh TradersScope on this device — old tabs cannot crawl /api/series',
      })
      return true
    }
    if (rateLimitOrSend(req, send, 'series', seriesRateLimitPerMinute())) return true
    const blocked = seriesAdmissionBlocked(req)
    if (blocked) {
      send(
        503,
        { error: 'Series busy', reason: blocked, retryAfterMs: 2000 },
        { 'Retry-After': '2' },
      )
      return true
    }
    seriesInFlight += 1
    let ticker = ''
    try {
      ticker = decodeURIComponent(url.pathname.replace('/api/series/', '')).toUpperCase()
      if (!ticker || !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
        send(400, { error: 'Invalid ticker' })
        return true
      }
      const result = await withTimeout(
        loadSeriesForTicker(ticker, url.searchParams, {
          skipForceRefresh: true,
        }),
        seriesHandlerTimeoutMs(ticker),
      )
      if (result.status === 404) {
        log('info', 'series.miss', { ticker, ms: Date.now() - started })
        send(404, result.body)
        return true
      }
      if (result.status === 400) {
        send(400, result.body)
        return true
      }
      const data = result.body
      const ms = Date.now() - started
      noteSeriesLatency(ms)
      log('info', 'series.ok', {
        ticker,
        bars: data.closes?.length,
        cache: data.meta?.cache,
        interval: data.meta?.interval,
        ms,
      })
      send(200, data)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const ms = Date.now() - started
      if (message === 'timeout') {
        noteSeriesLatency(ms)
        // Index cold-fills are slow by nature — don't shed Markets/Patterns for them.
        if (!isAsxIndexSeriesTicker(ticker)) {
          killSeriesTraffic('series-timeout', 90_000)
        }
        log('warn', 'series.timeout', { ms, ticker, index: isAsxIndexSeriesTicker(ticker) })
        send(
          503,
          { error: 'Series busy', reason: 'timeout', retryAfterMs: 5000 },
          { 'Retry-After': '5' },
        )
        return true
      }
      log('error', 'series.error', { message, ms })
      send(500, { error: message })
      return true
    } finally {
      seriesInFlight -= 1
    }
  }

  if (url.pathname === '/api/index-analysis' && req.method === 'GET') {
    if (requireAuthConnect(req, send)) return true
    try {
      const body = await buildIndexAnalysis()
      if (body.missed > 0) warmIndexAnalysisSeries()
      send(200, body)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'index-analysis.error', { message })
      send(500, { error: message })
      return true
    }
  }

  if (url.pathname === '/api/snapshot/meta' && req.method === 'GET') {
    if (rateLimitOrSend(req, send, 'snapshot', snapshotRateLimitPerMinute())) return true
    try {
      const body = await buildSnapshotMetaPayload()
      if (!body) {
        void maybeStartBackgroundSnapshot()
        let job = { status: 'idle', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
        try {
          job = await withTimeout(peekSnapshotJobStatus(), 600)
        } catch {
          /* stub */
        }
        send(404, {
          error: 'No snapshot yet',
          job,
          hint: 'POST /api/snapshot/refresh or wait for background build',
        })
        return true
      }
      send(200, body, {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        Pragma: 'no-cache',
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'snapshot.meta.error', { message, ms: Date.now() - started })
      lastMetaTimeoutAt = Date.now()
      killSeriesTraffic('meta-timeout', 180_000)
      if (snapshotMetaLastGood?.body) {
        send(
          200,
          {
            ...snapshotMetaLastGood.body,
            metaStale: true,
            metaStaleAgeMs: Date.now() - snapshotMetaLastGood.at,
          },
          { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
        )
        return true
      }
      send(503, {
        error: 'Snapshot meta temporarily unavailable',
        hint: 'Retry in a few seconds',
      })
      return true
    }
  }

  if (url.pathname === '/api/snapshot/stocks' && req.method === 'GET') {
    if (rateLimitOrSend(req, send, 'snapshot-stocks', snapshotStocksRateLimitPerMinute())) return true
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || 500)
    const prefer = url.searchParams.get('prefer') || ''
    const chunk = await readMarketSnapshotStocksChunk(offset, limit, { prefer })
    if (!chunk) {
      send(404, { error: 'No snapshot yet', job: await getSnapshotJobStatus() })
      return true
    }
    send(200, chunk, { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' })
    return true
  }

  if (url.pathname === '/api/snapshot') {
    if (req.method === 'GET') {
      if (rateLimitOrSend(req, send, 'snapshot', snapshotRateLimitPerMinute())) return true
      void syncSnapshotPricesFromSeriesMeta()
      scheduleLastPricesCacheWarm()
      const row = await readMarketSnapshotRow()
      if (!row) {
        void maybeStartBackgroundSnapshot()
        let job = { status: 'idle', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
        try {
          job = await withTimeout(peekSnapshotJobStatus(), 600)
        } catch {
          /* stub */
        }
        send(404, {
          error: 'No snapshot yet',
          job,
          hint: 'POST /api/snapshot/refresh or wait for background build',
        })
        return true
      }
      send(200, {
        builtAt: row.builtAt,
        asOf: row.asOf,
        loaded: row.loaded,
        failed: row.failed,
        fresh: isSnapshotFresh(row.builtAt),
        indexPerf: row.indexPerf,
        stocks: row.stocks,
        lastPrices: peekCachedLastPrices(),
        store: dbStoreLabel(),
        browserUniverseFetch: browserUniverseFetchEnabled(),
        productionMode: isProductionMode(),
      })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/snapshot/refresh') {
    if (req.method === 'GET') {
      // Poll path — must stay cheap. Never await recover/reconcile here (hangs desk load).
      let snap = null
      let job = { status: 'idle', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
      try {
        snap = await withTimeout(readMarketSnapshotLightMeta(), 800)
      } catch {
        /* null */
      }
      try {
        job = await withTimeout(peekSnapshotJobStatus(), 800)
      } catch {
        /* stub */
      }
      send(
        200,
        {
          job,
          autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
          snapshot: snap
            ? {
                builtAt: snap.builtAt,
                loaded: snap.loaded,
                failed: snap.failed,
                fresh: isSnapshotFresh(snap.builtAt),
              }
            : null,
        },
        { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
      )
      return true
    }
    if (await requireSessionOrAdmin(req, send)) return true
    if (req.method === 'POST') {
      if (await requireAdminOrSend(req, send)) return true
      const force = url.searchParams.get('force') === '1'
      const priority = url.searchParams.get('priority')
      const deskPriority = priority === 'asx200' || priority === 'desk'
      const status = await getSnapshotJobStatus()
      if (shouldBlockSnapshotRefreshStart(status, { force })) {
        log('info', 'snapshot.refresh', {
          alreadyRunning: true,
          force,
          priority,
          startedAt: status.startedAt,
        })
        send(202, {
          ok: true,
          alreadyRunning: true,
          job: status,
          hint: 'A refresh is already running — wait for it to finish',
        })
        return true
      }
      if (snapshotRefreshPostRateLimitOrSend(req, send)) return true
      log('info', 'snapshot.refresh', { started: true, force, priority })
      if (deskPriority) {
        void runAsx200ForceRefresh().catch((err) => {
          log('error', 'snapshot.refresh.error', {
            message: err instanceof Error ? err.message : String(err),
          })
        })
      } else {
        void runUniverseSnapshot({ force }).catch((err) => {
          log('error', 'snapshot.refresh.error', {
            message: err instanceof Error ? err.message : String(err),
          })
        })
      }
      send(202, { ok: true, started: true, job: await getSnapshotJobStatus() })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/snapshot/retry-failed') {
    if (await requireSessionOrAdmin(req, send)) return true
    if (req.method === 'POST') {
      if (await requireAdminOrSend(req, send)) return true
      const status = await getSnapshotJobStatus()
      if (status.status === 'running') {
        log('info', 'snapshot.retry_failed', { alreadyRunning: true, message: status.message })
        send(202, { ok: true, job: status, alreadyRunning: true })
        return true
      }
      log('info', 'snapshot.retry_failed', { started: true, via: 'missing-only' })
      void runRetryFailedSnapshot().catch((err) => {
        log('error', 'snapshot.retry_failed.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
      send(202, { ok: true, started: true, job: await getSnapshotJobStatus() })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/snapshot/rebuild-cache') {
    if (await requireSessionOrAdmin(req, send)) return true
    if (req.method === 'POST') {
      if (await requireAdminOrSend(req, send)) return true
      const status = await getSnapshotJobStatus()
      if (status.status === 'running') {
        log('info', 'snapshot.rebuild_cache', { alreadyRunning: true })
        send(202, { ok: true, job: status })
        return true
      }
      log('info', 'snapshot.rebuild_cache', { started: true, via: 'desk-force' })
      void runRebuildSnapshotFromCache().catch((err) => {
        log('error', 'snapshot.rebuild_cache.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
      send(202, { ok: true, started: true, via: 'desk-force', job: await getSnapshotJobStatus() })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/breadth/daily') {
    if (requireAuthConnect(req, send)) return true
    if (req.method === 'GET') {
      const universe = url.searchParams.get('universe') || 'asx200'
      if (!UNIVERSE_IDS.has(universe)) {
        send(400, { error: 'Invalid universe' })
        return true
      }
      const snap = await readMarketSnapshotRow()
      const builtAt = snap?.builtAt ?? 0
      const chartHistory = await computeBreadthChartHistory(
        universe,
        snap?.stocks ?? {},
        builtAt,
      )
      const indexBars = await getIndexBarsForChart(universe)
      send(200, {
        universe,
        points: await readBreadthHistory(universe),
        chartHistory,
        indexBars,
        store: dbStoreLabel(),
      }, { 'Cache-Control': 'no-store' })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const universe = String(body?.universe || '')
      if (!UNIVERSE_IDS.has(universe)) {
        send(400, { error: 'Invalid universe' })
        return true
      }
      const points = await upsertBreadthPoint(universe, body)
      send(200, { universe, points, store: dbStoreLabel() })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/live-quotes/refresh') {
    if (await requireSessionOrAdmin(req, send)) return true
    if (req.method === 'POST') {
      if (await requireAdminOrSend(req, send)) return true
      log('info', 'live_quotes.refresh', { started: true })
      void runLiveQuoteRefresh().catch((err) => {
        log('error', 'live_quotes.refresh.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
      send(202, { ok: true, started: true, liveQuotes: await getLiveQuotesMeta() })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/health/detail') {
    if (req.method !== 'GET') {
      send(405, { error: 'Method not allowed' })
      return true
    }
    if (await requireAdminOrSend(req, send)) return true
    send(200, await buildHealthDetailPayload(req), {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    })
    return true
  }

  if (url.pathname === '/api/health') {
    // Public: desk boot + LB probes only. Internals live on /api/health/detail.
    send(200, await buildPublicHealthPayload(req), {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      Pragma: 'no-cache',
    })
    return true
  }

  if (url.pathname === '/api/alerts/rules') {
    if (requireAuthConnect(req, send)) return true
    if (req.method === 'GET') {
      send(200, { rules: await listAlertRules() })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const rule = await createAlertRule(body)
      send(201, { rule })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname.startsWith('/api/alerts/rules/')) {
    if (requireAuthConnect(req, send)) return true
    const id = Number(url.pathname.replace('/api/alerts/rules/', ''))
    if (!Number.isFinite(id)) {
      send(400, { error: 'Invalid id' })
      return true
    }
    if (req.method === 'DELETE') {
      await deleteAlertRule(id)
      send(200, { ok: true })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/pattern-scan/batch' && req.method === 'POST') {
    if (requireAuthConnect(req, send)) return true
    const body = await readJsonBody(req)
    const upserted = await upsertPatternScanBatch(body?.rows)
    const alerts = await evaluateAlerts()
    send(200, { upserted, fired: alerts.fired?.length ?? 0, alerts })
    return true
  }

  if (url.pathname === '/api/pattern-scan/state' && req.method === 'GET') {
    if (requireAuthConnect(req, send)) return true
    const ticker = String(url.searchParams.get('ticker') || '')
      .trim()
      .toUpperCase()
    const patternId = String(url.searchParams.get('patternId') || '').trim()
    const minScore = Number(url.searchParams.get('minScore') ?? 0)
    const score = Number.isFinite(minScore) ? minScore : 0

    if (ticker) {
      if (!/^[A-Z0-9]{1,6}$/.test(ticker)) {
        send(400, { error: 'Invalid ticker' })
        return true
      }
      const rows = await queryPatternScanState({ ticker, patternId: patternId || null, minScore: score })
      send(200, { ticker, patternId: patternId || null, rows })
      return true
    }

    if (patternId) {
      const rows = await queryPatternScanState({ patternId, minScore: score })
      send(200, { ticker: null, patternId, rows })
      return true
    }

    send(400, { error: 'Provide ticker or patternId' })
    return true
  }

  if (url.pathname === '/api/alerts/events' && req.method === 'GET') {
    if (requireAuthConnect(req, send)) return true
    const user = getUserFromRequest(req)
    send(200, { events: await listAlertEvents(50, user) })
    return true
  }

  if (url.pathname === '/api/alerts/evaluate' && req.method === 'POST') {
    if (requireAuthConnect(req, send)) return true
    const result = await evaluateAlerts()
    send(200, result)
    return true
  }

  if (url.pathname.startsWith('/api/fundamentals/')) {
    if (requireAuthConnect(req, send)) return true
    const ticker = decodeURIComponent(url.pathname.replace('/api/fundamentals/', '')).toUpperCase()
    if (!ticker || !/^[A-Z0-9]{1,6}$/.test(ticker)) {
      send(400, { error: 'Invalid ticker' })
      return true
    }
    const forceRefresh = url.searchParams.get('refresh') === '1'
    const data = await getFundamentals(ticker, { forceRefresh })
    if (!data) {
      send(404, { error: 'No fundamentals', ticker })
      return true
    }
    send(200, data)
    return true
  }

  if (url.pathname === '/api/filings/buys') {
    if (requireAuthConnect(req, send)) return true
    const window = url.searchParams.get('window') === 'today' ? 'today' : 'week'
    send(200, await getLargestDisclosedBuys(window))
    return true
  }

  if (url.pathname.startsWith('/api/filings/')) {
    if (requireAuthConnect(req, send)) return true
    const ticker = decodeURIComponent(url.pathname.replace('/api/filings/', '')).toUpperCase()
    if (!ticker || !/^[A-Z0-9]{1,6}$/.test(ticker)) {
      send(400, { error: 'Invalid ticker' })
      return true
    }
    send(200, await getFilingsForTicker(ticker, { forceRefresh: url.searchParams.get('refresh') === '1' }))
    return true
  }

  // --- Patterns / watchlists / share / orgs (connect) ---
  if (url.pathname === '/api/patterns/hits' && req.method === 'GET') {
    if (isProductionMode() && authEnabled() && !getUserFromRequest(req)) {
      send(401, { error: 'Unauthorized', authRequired: true })
      return true
    }
    const asOf = url.searchParams.get('as_of') || 'latest'
    const day = await readPatternHitsDay(asOf)
    if (!day) {
      // 200 + empty so the desk does not treat a pending job as a broken endpoint.
      send(200, {
        asOf: asOf === 'latest' ? new Date().toISOString().slice(0, 10) : asOf,
        builtAt: 0,
        universe: 'none',
        hits: [],
        counts: {},
        pending: true,
      })
      return true
    }
    send(200, day)
    return true
  }

  if (url.pathname === '/api/patterns/job' && req.method === 'POST') {
    if (await requireAdminOrSend(req, send)) return true
    const body = await readJsonBody(req).catch(() => ({}))
    const result = await runDeskPatternJob(body || {})
    send(202, { ok: true, ...result })
    return true
  }

  if (url.pathname === '/api/patterns/prefs') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    if (req.method === 'GET') {
      send(200, { prefs: (await getUserPatternPrefs(user)) || null })
      return true
    }
    if (req.method === 'PUT') {
      const body = await readJsonBody(req)
      const prefs = await saveUserPatternPrefs(user, body?.prefs ?? body)
      send(200, { ok: true, prefs })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/watchlists') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    if (req.method === 'GET') {
      send(200, { watchlists: await listWatchlists(user) })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      try {
        const wl = await createWatchlist(user, body?.name, body?.tickers)
        send(201, { watchlist: wl })
      } catch (err) {
        send(400, { error: err instanceof Error ? err.message : String(err) })
      }
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname.startsWith('/api/watchlists/')) {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const id = decodeURIComponent(url.pathname.replace('/api/watchlists/', ''))
    if (req.method === 'PATCH') {
      const body = await readJsonBody(req)
      const wl = await updateWatchlist(id, user, body || {})
      if (!wl) {
        send(404, { error: 'Watchlist not found' })
        return true
      }
      send(200, { watchlist: wl })
      return true
    }
    if (req.method === 'DELETE') {
      const ok = await deleteWatchlist(id, user)
      if (!ok) {
        send(404, { error: 'Watchlist not found' })
        return true
      }
      send(200, { ok: true })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/share-links' && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const body = await readJsonBody(req)
    const id = await createShareLink(user, body?.payload ?? body)
    send(201, { id })
    return true
  }

  if (url.pathname.startsWith('/api/share-links/') && req.method === 'GET') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const id = decodeURIComponent(url.pathname.replace('/api/share-links/', ''))
    const link = await getShareLink(id)
    if (!link) {
      send(404, { error: 'Share link not found' })
      return true
    }
    send(200, link)
    return true
  }

  if (url.pathname === '/api/entitlement' && req.method === 'GET') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    send(200, await getDeskEntitlement(user))
    return true
  }

  if (url.pathname === '/api/billing/individual/checkout' && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const body = await readJsonBody(req).catch(() => ({}))
    const result = await createIndividualCheckoutSession({
      username: user,
      successUrl: body?.successUrl || `${publicAppUrl()}/?billing=success`,
      cancelUrl: body?.cancelUrl || `${publicAppUrl()}/?billing=cancel`,
      customerEmail: body?.customerEmail || (user.includes('@') ? user : undefined),
    })
    if (!result.ok) {
      send(400, { error: result.error })
      return true
    }
    send(200, { id: result.id, url: result.url })
    return true
  }

  const invitePreview = url.pathname.match(/^\/api\/orgs\/invite\/([^/]+)$/)
  if (invitePreview && req.method === 'GET') {
    const token = decodeURIComponent(invitePreview[1])
    const invite = await getInviteByToken(token)
    if (!invite) {
      send(404, { error: 'Invite not found' })
      return true
    }
    const { tokenHash: _th, ...safe } = invite
    send(200, {
      invite: {
        ...safe,
        inviteUrl: absoluteInviteUrl({ token: invite.token, inviteUrlPath: invite.inviteUrlPath }),
      },
    })
    return true
  }

  const inviteJoin = url.pathname.match(/^\/api\/orgs\/invite\/([^/]+)\/(?:join|checkout)$/)
  if (inviteJoin && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const token = decodeURIComponent(inviteJoin[1])
    const preview = await getInviteByToken(token)
    if (!preview) {
      send(404, { error: 'Invite not found' })
      return true
    }
    if (normalizeUsername(user) !== normalizeUsername(preview.email)) {
      send(403, { error: 'Sign in with the invited email address to join' })
      return true
    }
    try {
      const result = await acceptInvite(token, user)
      send(200, { ok: true, ...result })
    } catch (err) {
      send(400, { error: err instanceof Error ? err.message : String(err) })
    }
    return true
  }

  if (url.pathname === '/api/orgs/accept-invite' && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const body = await readJsonBody(req)
    try {
      const result = await acceptInvite(body?.token, user)
      send(200, { ok: true, ...result })
    } catch (err) {
      send(400, { error: err instanceof Error ? err.message : String(err) })
    }
    return true
  }

  if (url.pathname === '/api/orgs') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    if (req.method === 'GET') {
      send(200, { orgs: await listOrgsForUser(user) })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      try {
        const org = await createOrg(body?.name, user)
        send(201, { org })
      } catch (err) {
        send(400, { error: err instanceof Error ? err.message : String(err) })
      }
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  const orgInvitesCsv = url.pathname.match(/^\/api\/orgs\/([^/]+)\/invites\/csv$/)
  if (orgInvitesCsv && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgId = decodeURIComponent(orgInvitesCsv[1])
    const member = await getMember(orgId, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      send(403, { error: 'Owner/admin required' })
      return true
    }
    const body = await readJsonBody(req).catch(() => ({}))
    const emails = parseInviteEmailsFromBody(body)
    const org = await getOrg(orgId)
    const { created, errors } = await createInvitesFromEmails(orgId, emails, {
      role: body?.role || 'student',
      cohort: body?.cohort ?? null,
    })
    for (const invite of created) {
      try {
        await sendOrgInviteMail(invite, org?.name)
      } catch {
        /* best-effort */
      }
    }
    send(201, {
      created: created.map((invite) => ({
        ...invite,
        inviteUrl: absoluteInviteUrl(invite),
      })),
      errors,
    })
    return true
  }

  const orgInvitesRevoke = url.pathname.match(/^\/api\/orgs\/([^/]+)\/invites\/revoke$/)
  if (orgInvitesRevoke && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgId = decodeURIComponent(orgInvitesRevoke[1])
    const member = await getMember(orgId, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      send(403, { error: 'Owner/admin required' })
      return true
    }
    const body = await readJsonBody(req).catch(() => ({}))
    if (!body?.email) {
      send(400, { error: 'email required' })
      return true
    }
    await revokeInvite(orgId, body.email)
    send(200, { ok: true })
    return true
  }

  const orgMemberRemove = url.pathname.match(/^\/api\/orgs\/([^/]+)\/members\/remove$/)
  if (orgMemberRemove && (req.method === 'POST' || req.method === 'DELETE')) {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgId = decodeURIComponent(orgMemberRemove[1])
    const member = await getMember(orgId, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      send(403, { error: 'Owner/admin required' })
      return true
    }
    const body = await readJsonBody(req).catch(() => ({}))
    if (!body?.username) {
      send(400, { error: 'username required' })
      return true
    }
    try {
      await removeMember(orgId, body.username)
      send(200, { ok: true })
    } catch (err) {
      send(400, { error: err instanceof Error ? err.message : String(err) })
    }
    return true
  }

  const orgMemberRole = url.pathname.match(/^\/api\/orgs\/([^/]+)\/members\/role$/)
  if (orgMemberRole && req.method === 'PATCH') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgId = decodeURIComponent(orgMemberRole[1])
    const member = await getMember(orgId, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      send(403, { error: 'Owner/admin required' })
      return true
    }
    const body = await readJsonBody(req).catch(() => ({}))
    try {
      const updated = await setMemberRole(orgId, body?.username, body?.role)
      send(200, { member: updated })
    } catch (err) {
      send(400, { error: err instanceof Error ? err.message : String(err) })
    }
    return true
  }

  const orgCheckoutAbandon = url.pathname.match(/^\/api\/orgs\/([^/]+)\/checkout\/abandon$/)
  if (orgCheckoutAbandon && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgId = decodeURIComponent(orgCheckoutAbandon[1])
    const member = await getMember(orgId, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      send(403, { error: 'Owner/admin required' })
      return true
    }
    const result = await abandonOrgCheckout(orgId)
    if (!result.ok) {
      send(400, { error: result.error })
      return true
    }
    send(200, result)
    return true
  }

  if (url.pathname === '/api/orgs/checkout/abandon' && req.method === 'POST') {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgs = await listOrgsForUser(user)
    const results = []
    for (const org of orgs) {
      if (!['owner', 'admin'].includes(String(org.role || ''))) continue
      results.push({ orgId: org.id, ...(await abandonOrgCheckout(org.id)) })
    }
    send(200, { results })
    return true
  }

  const orgPath = url.pathname.match(
    /^\/api\/orgs\/([^/]+)(?:\/(invites|checkout|billing-portal|cancel-subscription|branding|publications))?$/,
  )
  if (orgPath) {
    const user = requireUserOrSend(req, send)
    if (!user) return true
    const orgId = decodeURIComponent(orgPath[1])
    const sub = orgPath[2] || null

    if (!sub && req.method === 'GET') {
      const org = await getOrg(orgId)
      if (!org) {
        send(404, { error: 'Org not found' })
        return true
      }
      const member = await getMember(orgId, user)
      send(200, {
        org,
        members: await listMembers(orgId),
        member,
        seatsAvailable: await seatsAvailable(orgId),
      })
      return true
    }

    if (sub === 'invites' && req.method === 'GET') {
      const member = await getMember(orgId, user)
      if (!member || !['owner', 'admin'].includes(member.role)) {
        send(403, { error: 'Owner/admin required' })
        return true
      }
      send(200, { invites: await listInvites(orgId) })
      return true
    }

    if (sub === 'invites' && req.method === 'POST') {
      const member = await getMember(orgId, user)
      if (!member || !['owner', 'admin'].includes(member.role)) {
        send(403, { error: 'Owner/admin required' })
        return true
      }
      const body = await readJsonBody(req)
      try {
        const invite = await createInvite(orgId, body || {})
        const org = await getOrg(orgId)
        const inviteUrl = absoluteInviteUrl(invite)
        if (body?.sendEmail !== false) {
          try {
            await sendOrgInviteMail(invite, org?.name)
          } catch {
            /* best-effort */
          }
        }
        send(201, { invite: { ...invite, inviteUrl } })
      } catch (err) {
        send(400, { error: err instanceof Error ? err.message : String(err) })
      }
      return true
    }

    if (sub === 'checkout' && req.method === 'POST') {
      const member = await getMember(orgId, user)
      if (!member || !['owner', 'admin'].includes(member.role)) {
        send(403, { error: 'Owner/admin required' })
        return true
      }
      const body = await readJsonBody(req)
      const result = await createCheckoutSession({
        orgId,
        priceId: body?.priceId,
        seats: body?.seats,
        successUrl: body?.successUrl,
        cancelUrl: body?.cancelUrl,
        customerEmail: body?.customerEmail || (user.includes('@') ? user : undefined),
      })
      if (!result.ok) {
        send(400, { error: result.error })
        return true
      }
      send(200, { id: result.id, url: result.url })
      return true
    }

    if (sub === 'billing-portal' && req.method === 'POST') {
      const member = await getMember(orgId, user)
      if (!member || !['owner', 'admin'].includes(member.role)) {
        send(403, { error: 'Owner/admin required' })
        return true
      }
      const body = await readJsonBody(req)
      const result = await createBillingPortalSession({
        orgId,
        returnUrl: body?.returnUrl || '/',
      })
      if (!result.ok) {
        send(400, { error: result.error })
        return true
      }
      send(200, { url: result.url })
      return true
    }

    if (sub === 'cancel-subscription' && req.method === 'POST') {
      const member = await getMember(orgId, user)
      if (!member || !['owner', 'admin'].includes(member.role)) {
        send(403, { error: 'Owner/admin required' })
        return true
      }
      const body = await readJsonBody(req)
      const result = await cancelOrgSubscription({
        orgId,
        immediately: Boolean(body?.immediately),
      })
      if (!result.ok) {
        send(400, { error: result.error })
        return true
      }
      send(200, result)
      return true
    }

    if (sub === 'branding') {
      const member = await getMember(orgId, user)
      if (!member) {
        send(403, { error: 'Org membership required' })
        return true
      }
      if (req.method === 'GET') {
        send(200, { branding: await getBranding(orgId) })
        return true
      }
      if (req.method === 'PUT') {
        if (!['owner', 'admin'].includes(member.role)) {
          send(403, { error: 'Owner/admin required' })
          return true
        }
        const body = await readJsonBody(req)
        const branding = await setBranding(orgId, body?.branding ?? body)
        send(200, { ok: true, branding })
        return true
      }
      send(405, { error: 'Method not allowed' })
      return true
    }

    if (sub === 'publications') {
      const member = await getMember(orgId, user)
      if (!member) {
        send(403, { error: 'Org membership required' })
        return true
      }
      if (req.method === 'GET') {
        const cohort = url.searchParams.get('cohort') || member.cohort
        send(200, { publications: await listTrainerPublications(orgId, cohort) })
        return true
      }
      if (req.method === 'POST') {
        if (!['owner', 'admin', 'trainer'].includes(member.role)) {
          send(403, { error: 'Trainer/admin required' })
          return true
        }
        const body = await readJsonBody(req)
        try {
          const doc = await publishTrainerDoc(orgId, user, body || {})
          send(201, { publication: doc })
        } catch (err) {
          send(400, { error: err instanceof Error ? err.message : String(err) })
        }
        return true
      }
      send(405, { error: 'Method not allowed' })
      return true
    }
  }

  // Stripe webhook: connect may skip (no reliable raw body).
  if (url.pathname === '/api/billing/webhook' && req.method === 'POST') {
    send(501, {
      error: 'Stripe webhook requires Express raw body — use production server',
      hint: 'POST /api/billing/webhook on the Express prod server',
    })
    return true
  }

  return false
}

/**
 * @param {import('express').Express} app
 */
export function mountExpressApi(app) {
  app.use(async (_req, _res, next) => {
    try {
      await initDb()
      next()
    } catch (err) {
      next(err)
    }
  })

  app.get('/api/ping', (_req, res) => {
    res.status(200).json({ ok: true })
  })

  app.get('/api/health/detail', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    if (await requireAdminOrSend(req, (status, body) => res.status(status).json(body))) return
    return res.status(200).json(await buildHealthDetailPayload(req))
  })

  app.get('/api/health', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    return res.status(200).json(await buildPublicHealthPayload(req))
  })

  app.get('/api/auth/me', async (req, res) => {
    if (!authEnabled()) {
      return res.json({ user: null, authRequired: false })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.json({ user: null, authRequired: true })
    const canReceiveAlertEmail = isEmailLogin(user)
    const alertEmailOptIn = canReceiveAlertEmail ? await getAlertEmailOptIn(user) : false
    const alertEmailMinScore = canReceiveAlertEmail ? await getAlertEmailMinScore(user) : 80
    const patternAlertIds = await getPatternAlertIds(user)
    const patternAlertWatches = await getPatternAlertWatches(user)
    const { getDbUserProfile } = await import('./userStore.mjs')
    const profile = await getDbUserProfile(user)
    return res.json({
      user,
      displayName: profile?.displayName || null,
      authRequired: true,
      canReceiveAlertEmail,
      alertEmailOptIn,
      alertEmailMinScore,
      patternAlertIds,
      patternAlertWatches,
    })
  })

  app.post('/api/auth/alert-email-opt-in', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    if (!isEmailLogin(user)) {
      return res.status(400).json({
        error: 'Alert email requires logging in with an email address (not a username only).',
      })
    }
    if (req.body?.optIn != null) {
      await setAlertEmailOptIn(user, Boolean(req.body.optIn))
    }
    let alertEmailMinScore = await getAlertEmailMinScore(user)
    if (req.body?.minScore != null || req.body?.alertEmailMinScore != null) {
      alertEmailMinScore = await setAlertEmailMinScore(
        user,
        req.body.minScore ?? req.body.alertEmailMinScore,
      )
    }
    return res.json({
      ok: true,
      alertEmailOptIn: await getAlertEmailOptIn(user),
      alertEmailMinScore,
      canReceiveAlertEmail: true,
    })
  })

  app.get('/api/auth/market-note-opt-in', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    return res.json({
      marketNoteOptIn: await getMarketNoteOptIn(user),
      canReceiveMarketNote: isEmailLogin(user),
    })
  })

  app.post('/api/auth/market-note-opt-in', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    if (!isEmailLogin(user)) {
      return res.status(400).json({
        error: 'Market notes require logging in with an email address.',
      })
    }
    const optIn = await setMarketNoteOptIn(user, Boolean(req.body?.optIn))
    return res.json({ ok: true, marketNoteOptIn: optIn, canReceiveMarketNote: true })
  })

  app.get('/api/auth/pattern-alert-prefs', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    return res.json({
      patternAlertIds: await getPatternAlertIds(user),
      patternAlertWatches: await getPatternAlertWatches(user),
      patternComboAlerts: await getPatternComboAlerts(user),
    })
  })

  app.post('/api/auth/pattern-alert-prefs', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    const rawCombos = req.body?.combos ?? req.body?.patternComboAlerts
    if (Array.isArray(rawCombos)) {
      const saved = await setPatternComboAlerts(user, rawCombos)
      return res.json({
        ok: true,
        patternComboAlerts: saved,
        patternAlertIds: await getPatternAlertIds(user),
      })
    }
    const rawWatches = req.body?.watches ?? req.body?.patternAlertWatches
    if (Array.isArray(rawWatches)) {
      const saved = await setPatternAlertWatches(user, rawWatches)
      return res.json({
        ok: true,
        patternAlertWatches: saved,
        patternAlertIds: await getPatternAlertIds(user),
      })
    }
    const raw = req.body?.patternIds ?? req.body?.patternAlertIds
    const patternIds = Array.isArray(raw) ? raw : []
    const saved = await setPatternAlertIds(user, patternIds)
    return res.json({ ok: true, patternAlertIds: saved })
  })

  app.get('/api/auth/config', (_req, res) => {
    return res.json(authPublicConfig())
  })

  app.post('/api/auth/register', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const { startRegistration } = await import('./registration.mjs')
    const result = await startRegistration(req.body || {})
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error })
    return res.json({
      ok: true,
      email: result.email,
      expiresInSec: result.expiresInSec,
      message: result.message,
    })
  })

  app.post('/api/auth/verify-registration', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const { verifyRegistration } = await import('./registration.mjs')
    const result = await verifyRegistration(req.body || {})
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error })
    const token = createSessionToken(result.user)
    res.setHeader('Set-Cookie', sessionSetCookieHeader(token))
    return res.json({ ok: true, user: result.user, displayName: result.displayName })
  })

  app.post('/api/auth/resend-registration-otp', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const { resendRegistrationOtp } = await import('./registration.mjs')
    const result = await resendRegistrationOtp(req.body || {})
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error })
    return res.json({
      ok: true,
      email: result.email,
      expiresInSec: result.expiresInSec,
      message: result.message,
    })
  })

  app.post('/api/auth/login', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = await verifyCredentials(req.body?.username, req.body?.password)
    if (!user) {
      const { log } = await import('./log.mjs')
      const username = normalizeUsername(req.body?.username || '')
      log('warn', 'auth.login.fail', {
        username,
        envUser: loadUsers().has(username),
        dbUserCount: await countDbUsers(),
      })
      return res.status(401).json({ error: 'Invalid username or password' })
    }
    const token = createSessionToken(user)
    res.setHeader('Set-Cookie', sessionSetCookieHeader(token))
    return res.json({ user })
  })

  app.post('/api/auth/logout', (_req, res) => {
    res.setHeader('Set-Cookie', sessionClearCookieHeader())
    return res.json({ ok: true })
  })

  app.post('/api/auth/forgot-password', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const { requestPasswordReset } = await import('./passwordReset.mjs')
    const result = await requestPasswordReset(req.body || {}, req)
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error })
    return res.json({ ok: true, message: result.message })
  })

  app.post('/api/auth/reset-password', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const { completePasswordReset } = await import('./passwordReset.mjs')
    const result = await completePasswordReset(req.body || {})
    if (!result.ok) return res.status(result.status || 400).json({ error: result.error })
    return res.json({ ok: true, message: result.message })
  })

  app.get('/api/auth/profile', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    const { getDbUserProfile } = await import('./userStore.mjs')
    const profile = await getDbUserProfile(user)
    return res.json({
      user,
      displayName: profile?.displayName || null,
      canEditProfile: Boolean(profile),
      canReceiveAlertEmail: isEmailLogin(user),
    })
  })

  app.post('/api/auth/profile', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    const { updateDbDisplayName, updateDbUsername, getDbUserProfile } = await import(
      './userStore.mjs'
    )
    let current = user
    if (req.body?.displayName != null) {
      const r = await updateDbDisplayName(current, req.body.displayName)
      if (!r.ok) return res.status(400).json({ error: r.error })
    }
    if (
      req.body?.username != null &&
      normalizeUsername(req.body.username) !== normalizeUsername(current)
    ) {
      const r = await updateDbUsername(current, req.body.username)
      if (!r.ok) return res.status(400).json({ error: r.error })
      current = r.user
    }
    const profile = await getDbUserProfile(current)
    const token = createSessionToken(current)
    res.setHeader('Set-Cookie', sessionSetCookieHeader(token))
    return res.json({
      ok: true,
      user: current,
      displayName: profile?.displayName || null,
      canEditProfile: Boolean(profile),
      canReceiveAlertEmail: isEmailLogin(current),
    })
  })

  app.post('/api/auth/change-password', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    const { changeDbPassword } = await import('./userStore.mjs')
    const result = await changeDbPassword(user, req.body?.currentPassword, req.body?.newPassword)
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.json({ ok: true, message: 'Password updated' })
  })

  app.get('/api/admin/users', async (req, res) => {
    if (await requireSessionOrAdmin(req, (status, body) => res.status(status).json(body))) return
    if (isProductionMode() && !(await isAdminRequest(req))) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    return res.json({ users: await listDbUsernames(), count: await countDbUsers() })
  })

  app.post('/api/admin/users', async (req, res) => {
    if (await requireSessionOrAdmin(req, (status, body) => res.status(status).json(body))) return
    if (isProductionMode() && !(await isAdminRequest(req))) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    const result = await createDbUser(req.body?.username, req.body?.password, {
      isAdmin: Boolean(req.body?.isAdmin),
    })
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.status(201).json({ ok: true, user: result.user })
  })

  app.get('/api/series/:ticker', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const started = Date.now()
    if (!seriesClientAllowed(req)) {
      log('warn', 'series.rejected_legacy_client', { key: clientKey(req) })
      return res.status(403).json({
        error: 'Legacy client blocked',
        hint: 'Hard-refresh TradersScope on this device — old tabs cannot crawl /api/series',
      })
    }
    if (seriesRateLimitOrExpress(req, res)) {
      return
    }
    const blocked = seriesAdmissionBlocked(req)
    if (blocked) {
      res.setHeader('Retry-After', '2')
      return res.status(503).json({ error: 'Series busy', reason: blocked, retryAfterMs: 2000 })
    }
    seriesInFlight += 1
    let ticker = ''
    try {
      ticker = decodeURIComponent(req.params.ticker).toUpperCase()
      if (!ticker || !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
        return res.status(400).json({ error: 'Invalid ticker' })
      }
      const result = await withTimeout(
        loadSeriesForTicker(ticker, req.query, { skipForceRefresh: true }),
        seriesHandlerTimeoutMs(ticker),
      )
      if (result.status === 404) {
        log('info', 'series.miss', { ticker, ms: Date.now() - started })
        return res.status(404).json(result.body)
      }
      if (result.status === 400) {
        return res.status(400).json(result.body)
      }
      const data = result.body
      const ms = Date.now() - started
      noteSeriesLatency(ms)
      log('info', 'series.ok', {
        ticker,
        bars: data.closes?.length,
        cache: data.meta?.cache,
        interval: data.meta?.interval,
        ms,
      })
      return res.json(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const ms = Date.now() - started
      if (message === 'timeout') {
        noteSeriesLatency(ms)
        if (!isAsxIndexSeriesTicker(ticker)) {
          killSeriesTraffic('series-timeout', 90_000)
        }
        log('warn', 'series.timeout', { ms, ticker, index: isAsxIndexSeriesTicker(ticker) })
        res.setHeader('Retry-After', '5')
        return res.status(503).json({ error: 'Series busy', reason: 'timeout', retryAfterMs: 5000 })
      }
      log('error', 'series.error', { message, ms })
      return res.status(500).json({ error: message })
    } finally {
      seriesInFlight -= 1
    }
  })

  app.get('/api/index-analysis', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    try {
      const body = await buildIndexAnalysis()
      // Warm any remaining misses in the background for the next visit.
      if (body.missed > 0) warmIndexAnalysisSeries()
      return res.json(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'index-analysis.error', { message })
      return res.status(500).json({ error: message })
    }
  })

  app.get('/api/snapshot/meta', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    if (
      rateLimitOrSend(
        req,
        (status, body) => res.status(status).json(body),
        'snapshot',
        snapshotRateLimitPerMinute(),
      )
    ) {
      return
    }
    try {
      const body = await buildSnapshotMetaPayload()
      if (!body) {
        void maybeStartBackgroundSnapshot()
        let job = { status: 'idle', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
        try {
          job = await withTimeout(peekSnapshotJobStatus(), 600)
        } catch {
          /* stub */
        }
        return res.status(404).json({
          error: 'No snapshot yet',
          job,
          hint: 'POST /api/snapshot/refresh or wait for background build',
        })
      }
      return res.json(body)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'snapshot.meta.error', { message })
      lastMetaTimeoutAt = Date.now()
      killSeriesTraffic('meta-timeout', 180_000)
      if (snapshotMetaLastGood?.body) {
        return res.json({
          ...snapshotMetaLastGood.body,
          metaStale: true,
          metaStaleAgeMs: Date.now() - snapshotMetaLastGood.at,
        })
      }
      return res.status(503).json({
        error: 'Snapshot meta temporarily unavailable',
        hint: 'Retry in a few seconds',
      })
    }
  })

  app.get('/api/snapshot/stocks', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    if (
      rateLimitOrSend(
        req,
        (status, body) => res.status(status).json(body),
        'snapshot-stocks',
        snapshotStocksRateLimitPerMinute(),
      )
    ) {
      return
    }
    const offset = Number(req.query.offset || 0)
    const limit = Number(req.query.limit || 500)
    const prefer = typeof req.query.prefer === 'string' ? req.query.prefer : ''
    const chunk = await readMarketSnapshotStocksChunk(offset, limit, { prefer })
    if (!chunk) {
      return res.status(404).json({ error: 'No snapshot yet', job: await getSnapshotJobStatus() })
    }
    return res.json(chunk)
  })

  app.get('/api/snapshot', async (req, res) => {
    if (
      rateLimitOrSend(
        req,
        (status, body) => res.status(status).json(body),
        'snapshot',
        snapshotRateLimitPerMinute(),
      )
    ) {
      return
    }
    void syncSnapshotPricesFromSeriesMeta()
    scheduleLastPricesCacheWarm()
    const row = await readMarketSnapshotRow()
    if (!row) {
      void maybeStartBackgroundSnapshot()
      let job = { status: 'idle', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
      try {
        job = await withTimeout(peekSnapshotJobStatus(), 600)
      } catch {
        /* stub */
      }
      return res.status(404).json({
        error: 'No snapshot yet',
        job,
        hint: 'POST /api/snapshot/refresh or run npm run snapshot',
      })
    }
    return res.json({
      builtAt: row.builtAt,
      asOf: row.asOf,
      loaded: row.loaded,
      failed: row.failed,
      fresh: isSnapshotFresh(row.builtAt),
      indexPerf: row.indexPerf,
      stocks: row.stocks,
      lastPrices: peekCachedLastPrices(),
      store: dbStoreLabel(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      productionMode: isProductionMode(),
    })
  })

  app.get('/api/snapshot/refresh', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    // Poll path — peek only. getSnapshotJobStatus recover/reconcile wedged this for minutes.
    let snap = null
    let job = { status: 'idle', autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD, trigger: null }
    try {
      snap = await withTimeout(readMarketSnapshotLightMeta(), 800)
    } catch {
      /* null */
    }
    try {
      job = await withTimeout(peekSnapshotJobStatus(), 800)
    } catch {
      /* stub */
    }
    return res.json({
      job,
      autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
      snapshot: snap
        ? {
            builtAt: snap.builtAt,
            loaded: snap.loaded,
            failed: snap.failed,
            fresh: isSnapshotFresh(snap.builtAt),
          }
        : null,
    })
  })

  app.post('/api/snapshot/refresh', async (req, res) => {
    if (await requireSessionOrAdmin(req, (status, body) => res.status(status).json(body))) return
    if (isProductionMode() && !(await isAdminRequest(req))) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    const force = req.query.force === '1'
    const priority = typeof req.query.priority === 'string' ? req.query.priority : ''
    const deskPriority = priority === 'asx200' || priority === 'desk'
    const status = await getSnapshotJobStatus()
    if (shouldBlockSnapshotRefreshStart(status, { force })) {
      log('info', 'snapshot.refresh', {
        alreadyRunning: true,
        force,
        priority,
        startedAt: status.startedAt,
      })
      return res.status(202).json({
        ok: true,
        alreadyRunning: true,
        job: status,
        hint: 'A refresh is already running — wait for it to finish',
      })
    }
    if (snapshotRefreshPostRateLimitOrExpress(req, res)) return
    log('info', 'snapshot.refresh', { started: true, force, priority })
    if (deskPriority) {
      void runAsx200ForceRefresh().catch((err) => {
        log('error', 'snapshot.refresh.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
    } else {
      void runUniverseSnapshot({ force }).catch((err) => {
        log('error', 'snapshot.refresh.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
    }
    return res.status(202).json({ ok: true, started: true, job: await getSnapshotJobStatus() })
  })

  app.post('/api/snapshot/retry-failed', async (req, res) => {
    if (await requireSessionOrAdmin(req, (status, body) => res.status(status).json(body))) return
    if (isProductionMode() && !(await isAdminRequest(req))) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    const status = await getSnapshotJobStatus()
    // Only re-fetch missing names — do not restart a full desk pull (that can run 20–40+ min).
    if (status.status === 'running') {
      log('info', 'snapshot.retry_failed', { alreadyRunning: true, message: status.message })
      return res.status(202).json({ ok: true, job: status, alreadyRunning: true })
    }
    log('info', 'snapshot.retry_failed', { started: true, via: 'missing-only' })
    void runRetryFailedSnapshot().catch((err) => {
      log('error', 'snapshot.retry_failed.error', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return res.status(202).json({ ok: true, started: true, job: await getSnapshotJobStatus() })
  })

  app.post('/api/snapshot/rebuild-cache', async (req, res) => {
    if (await requireSessionOrAdmin(req, (status, body) => res.status(status).json(body))) return
    if (isProductionMode() && !(await isAdminRequest(req))) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    const status = await getSnapshotJobStatus()
    if (status.status === 'running') {
      log('info', 'snapshot.rebuild_cache', { alreadyRunning: true })
      return res.status(202).json({ ok: true, job: status })
    }
    log('info', 'snapshot.rebuild_cache', { started: true, via: 'desk-force' })
    void runRebuildSnapshotFromCache().catch((err) => {
      log('error', 'snapshot.rebuild_cache.error', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return res.status(202).json({
      ok: true,
      started: true,
      via: 'desk-force',
      job: await getSnapshotJobStatus(),
    })
  })

  app.post('/api/live-quotes/refresh', async (req, res) => {
    if (await requireSessionOrAdmin(req, (status, body) => res.status(status).json(body))) return
    if (isProductionMode() && !(await isAdminRequest(req))) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    log('info', 'live_quotes.refresh', { started: true })
    void runLiveQuoteRefresh().catch((err) => {
      log('error', 'live_quotes.refresh.error', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return res.status(202).json({ ok: true, started: true, liveQuotes: await getLiveQuotesMeta() })
  })

  app.get('/api/breadth/daily', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const universe = typeof req.query.universe === 'string' ? req.query.universe : 'asx200'
    if (!UNIVERSE_IDS.has(universe)) {
      return res.status(400).json({ error: 'Invalid universe' })
    }
    const points = await readBreadthHistory(universe)
    let chartHistory = []
    let indexBars = []
    try {
      const snap = await readMarketSnapshotRow()
      const builtAt = snap?.builtAt ?? 0
      chartHistory = await computeBreadthChartHistory(universe, snap?.stocks ?? {}, builtAt)
      indexBars = await getIndexBarsForChart(universe)
    } catch {
      /* optional */
    }
    res.setHeader('Cache-Control', 'no-store')
    return res.json({ universe, points, chartHistory, indexBars, store: dbStoreLabel() })
  })

  app.post('/api/breadth/daily', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    try {
      const universe = String(req.body?.universe || '')
      if (!UNIVERSE_IDS.has(universe)) {
        return res.status(400).json({ error: 'Invalid universe' })
      }
      const points = await upsertBreadthPoint(universe, req.body || {})
      return res.json({ universe, points, store: dbStoreLabel() })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(400).json({ error: message })
    }
  })

  app.get('/api/alerts/rules', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    return res.json({ rules: await listAlertRules() })
  })

  app.post('/api/alerts/rules', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    return res.status(201).json({ rule: await createAlertRule(req.body || {}) })
  })

  app.delete('/api/alerts/rules/:id', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    await deleteAlertRule(Number(req.params.id))
    return res.json({ ok: true })
  })

  app.post('/api/pattern-scan/batch', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const upserted = await upsertPatternScanBatch(req.body?.rows)
    const alerts = await evaluateAlerts()
    return res.json({ upserted, fired: alerts.fired?.length ?? 0, alerts })
  })

  app.get('/api/pattern-scan/state', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const ticker = String(req.query.ticker || '')
      .trim()
      .toUpperCase()
    const patternId = String(req.query.patternId || '').trim()
    const minScore = Number(req.query.minScore ?? 0)
    const score = Number.isFinite(minScore) ? minScore : 0

    if (ticker) {
      if (!/^[A-Z0-9]{1,6}$/.test(ticker)) {
        return res.status(400).json({ error: 'Invalid ticker' })
      }
      const rows = await queryPatternScanState({
        ticker,
        patternId: patternId || null,
        minScore: score,
      })
      return res.json({ ticker, patternId: patternId || null, rows })
    }

    if (patternId) {
      const rows = await queryPatternScanState({ patternId, minScore: score })
      return res.json({ ticker: null, patternId, rows })
    }

    return res.status(400).json({ error: 'Provide ticker or patternId' })
  })

  app.get('/api/alerts/events', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const user = getUserFromRequest(req)
    return res.json({ events: await listAlertEvents(50, user) })
  })

  app.post('/api/alerts/evaluate', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const result = await evaluateAlerts()
    return res.json(result)
  })

  app.get('/api/fundamentals/:ticker', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const ticker = decodeURIComponent(req.params.ticker).toUpperCase()
    if (!ticker || !/^[A-Z0-9]{1,6}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker' })
    }
    const data = await getFundamentals(ticker, { forceRefresh: req.query.refresh === '1' })
    if (!data) return res.status(404).json({ error: 'No fundamentals', ticker })
    return res.json(data)
  })

  app.get('/api/filings/buys', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const window = req.query.window === 'today' ? 'today' : 'week'
    return res.json(await getLargestDisclosedBuys(window))
  })

  app.get('/api/filings/:ticker', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const ticker = decodeURIComponent(req.params.ticker).toUpperCase()
    if (!ticker || !/^[A-Z0-9]{1,6}$/.test(ticker)) {
      return res.status(400).json({ error: 'Invalid ticker' })
    }
    return res.json(
      await getFilingsForTicker(ticker, { forceRefresh: req.query.refresh === '1' }),
    )
  })

  app.get('/api/patterns/hits', async (req, res) => {
    if (isProductionMode() && authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const asOf = typeof req.query.as_of === 'string' ? req.query.as_of : 'latest'
    const day = await readPatternHitsDay(asOf)
    if (!day) {
      return res.json({
        asOf: asOf === 'latest' ? new Date().toISOString().slice(0, 10) : asOf,
        builtAt: 0,
        universe: 'none',
        hits: [],
        counts: {},
        pending: true,
      })
    }
    return res.json(day)
  })

  app.post('/api/patterns/job', async (req, res) => {
    if (await requireAdminOrSend(req, (status, body) => res.status(status).json(body))) return
    const result = await runDeskPatternJob(req.body || {})
    return res.status(202).json({ ok: true, ...result })
  })

  app.get('/api/patterns/prefs', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    return res.json({ prefs: (await getUserPatternPrefs(user)) || null })
  })

  app.put('/api/patterns/prefs', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const prefs = await saveUserPatternPrefs(user, req.body?.prefs ?? req.body)
    return res.json({ ok: true, prefs })
  })

  app.get('/api/watchlists', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    return res.json({ watchlists: await listWatchlists(user) })
  })

  app.post('/api/watchlists', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    try {
      const wl = await createWatchlist(user, req.body?.name, req.body?.tickers)
      return res.status(201).json({ watchlist: wl })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.patch('/api/watchlists/:id', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const wl = await updateWatchlist(req.params.id, user, req.body || {})
    if (!wl) return res.status(404).json({ error: 'Watchlist not found' })
    return res.json({ watchlist: wl })
  })

  app.delete('/api/watchlists/:id', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const ok = await deleteWatchlist(req.params.id, user)
    if (!ok) return res.status(404).json({ error: 'Watchlist not found' })
    return res.json({ ok: true })
  })

  app.post('/api/share-links', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const id = await createShareLink(user, req.body?.payload ?? req.body)
    return res.status(201).json({ id })
  })

  app.get('/api/share-links/:id', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const link = await getShareLink(req.params.id)
    if (!link) return res.status(404).json({ error: 'Share link not found' })
    return res.json(link)
  })

  app.get('/api/entitlement', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    return res.json(await getDeskEntitlement(user))
  })

  app.post('/api/billing/individual/checkout', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const result = await createIndividualCheckoutSession({
      username: user,
      successUrl: req.body?.successUrl || `${publicAppUrl()}/?billing=success`,
      cancelUrl: req.body?.cancelUrl || `${publicAppUrl()}/?billing=cancel`,
      customerEmail: req.body?.customerEmail || (user.includes('@') ? user : undefined),
    })
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.json({ id: result.id, url: result.url })
  })

  app.get('/api/orgs', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    return res.json({ orgs: await listOrgsForUser(user) })
  })

  app.post('/api/orgs', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    try {
      const org = await createOrg(req.body?.name, user)
      return res.status(201).json({ org })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.get('/api/orgs/invite/:token', async (req, res) => {
    const invite = await getInviteByToken(req.params.token)
    if (!invite) return res.status(404).json({ error: 'Invite not found' })
    const { tokenHash: _th, ...safe } = invite
    return res.json({
      invite: {
        ...safe,
        inviteUrl: absoluteInviteUrl({ token: invite.token }),
      },
    })
  })

  app.post('/api/orgs/invite/:token/join', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const token = String(req.params.token || '')
    const preview = await getInviteByToken(token)
    if (!preview) return res.status(404).json({ error: 'Invite not found' })
    if (normalizeUsername(user) !== normalizeUsername(preview.email)) {
      return res.status(403).json({ error: 'Sign in with the invited email address to join' })
    }
    try {
      const result = await acceptInvite(token, user)
      return res.json({ ok: true, ...result })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // Legacy path — same as join (org seat only; no individual Checkout).
  app.post('/api/orgs/invite/:token/checkout', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const token = String(req.params.token || '')
    const preview = await getInviteByToken(token)
    if (!preview) return res.status(404).json({ error: 'Invite not found' })
    if (normalizeUsername(user) !== normalizeUsername(preview.email)) {
      return res.status(403).json({ error: 'Sign in with the invited email address to join' })
    }
    try {
      const result = await acceptInvite(token, user)
      return res.json({ ok: true, ...result })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post('/api/orgs/accept-invite', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    try {
      const result = await acceptInvite(req.body?.token, user)
      return res.json({ ok: true, ...result })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.get('/api/orgs/:id', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const org = await getOrg(req.params.id)
    if (!org) return res.status(404).json({ error: 'Org not found' })
    const member = await getMember(req.params.id, user)
    return res.json({
      org,
      members: await listMembers(req.params.id),
      member,
      seatsAvailable: await seatsAvailable(req.params.id),
    })
  })

  app.get('/api/orgs/:id/invites', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    return res.json({ invites: await listInvites(req.params.id) })
  })

  app.post('/api/orgs/:id/invites', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    try {
      const invite = await createInvite(req.params.id, req.body || {})
      const org = await getOrg(req.params.id)
      const inviteUrl = absoluteInviteUrl(invite)
      if (req.body?.sendEmail !== false) {
        try {
          await sendOrgInviteMail(invite, org?.name)
        } catch {
          /* best-effort */
        }
      }
      return res.status(201).json({ invite: { ...invite, inviteUrl } })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post('/api/orgs/:id/invites/csv', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    const emails = parseInviteEmailsFromBody(req.body || {})
    const org = await getOrg(req.params.id)
    const { created, errors } = await createInvitesFromEmails(req.params.id, emails, {
      role: req.body?.role || 'student',
      cohort: req.body?.cohort ?? null,
    })
    for (const invite of created) {
      try {
        await sendOrgInviteMail(invite, org?.name)
      } catch {
        /* best-effort */
      }
    }
    return res.status(201).json({
      created: created.map((invite) => ({
        ...invite,
        inviteUrl: absoluteInviteUrl(invite),
      })),
      errors,
    })
  })

  app.post('/api/orgs/:id/invites/revoke', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    if (!req.body?.email) return res.status(400).json({ error: 'email required' })
    await revokeInvite(req.params.id, req.body.email)
    return res.json({ ok: true })
  })

  app.post('/api/orgs/:id/members/remove', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    try {
      await removeMember(req.params.id, req.body?.username)
      return res.json({ ok: true })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.delete('/api/orgs/:id/members/remove', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    try {
      await removeMember(req.params.id, req.body?.username)
      return res.json({ ok: true })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.patch('/api/orgs/:id/members/role', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    try {
      const updated = await setMemberRole(req.params.id, req.body?.username, req.body?.role)
      return res.json({ member: updated })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post('/api/orgs/checkout/abandon', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const orgs = await listOrgsForUser(user)
    const results = []
    for (const org of orgs) {
      if (!['owner', 'admin'].includes(String(org.role || ''))) continue
      results.push({ orgId: org.id, ...(await abandonOrgCheckout(org.id)) })
    }
    return res.json({ results })
  })

  app.post('/api/orgs/:id/checkout', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    const result = await createCheckoutSession({
      orgId: req.params.id,
      priceId: req.body?.priceId,
      seats: req.body?.seats,
      successUrl: req.body?.successUrl,
      cancelUrl: req.body?.cancelUrl,
      customerEmail: req.body?.customerEmail || (user.includes('@') ? user : undefined),
    })
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.json({ id: result.id, url: result.url })
  })

  app.post('/api/orgs/:id/checkout/abandon', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    const result = await abandonOrgCheckout(req.params.id)
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.json(result)
  })

  app.post('/api/orgs/:id/billing-portal', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    const result = await createBillingPortalSession({
      orgId: req.params.id,
      returnUrl: req.body?.returnUrl || `${req.protocol}://${req.get('host')}/`,
    })
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.json({ url: result.url })
  })

  app.post('/api/orgs/:id/cancel-subscription', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    const result = await cancelOrgSubscription({
      orgId: req.params.id,
      immediately: Boolean(req.body?.immediately),
    })
    if (!result.ok) return res.status(400).json({ error: result.error })
    return res.json(result)
  })

  app.get('/api/orgs/:id/branding', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member) return res.status(403).json({ error: 'Org membership required' })
    return res.json({ branding: await getBranding(req.params.id) })
  })

  app.put('/api/orgs/:id/branding', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin'].includes(member.role)) {
      return res.status(403).json({ error: 'Owner/admin required' })
    }
    const branding = await setBranding(req.params.id, req.body?.branding ?? req.body)
    return res.json({ ok: true, branding })
  })

  app.get('/api/orgs/:id/publications', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member) return res.status(403).json({ error: 'Org membership required' })
    const cohort =
      typeof req.query.cohort === 'string' ? req.query.cohort : member.cohort
    return res.json({ publications: await listTrainerPublications(req.params.id, cohort) })
  })

  app.post('/api/orgs/:id/publications', async (req, res) => {
    const user = requireUserExpress(req, res)
    if (!user) return
    const member = await getMember(req.params.id, user)
    if (!member || !['owner', 'admin', 'trainer'].includes(member.role)) {
      return res.status(403).json({ error: 'Trainer/admin required' })
    }
    try {
      const doc = await publishTrainerDoc(req.params.id, user, req.body || {})
      return res.status(201).json({ publication: doc })
    } catch (err) {
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  // Raw body required — prod.mjs skips express.json for this path.
  app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature']
    try {
      const event = await constructWebhookEvent(req.body, signature)
      await handleStripeWebhookEvent(event)
      return res.json({ received: true })
    } catch (err) {
      log('warn', 'stripe.webhook.error', {
        message: err instanceof Error ? err.message : String(err),
      })
      return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
    }
  })
}

export function defaultFromIso() {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

/**
 * @param {string} ticker
 * @param {URLSearchParams | Record<string, string | undefined>} params
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function loadSeriesForTicker(ticker, params, opts = {}) {
  const get = (key) => {
    if (params instanceof URLSearchParams) return params.get(key)
    const v = params[key]
    return typeof v === 'string' ? v : undefined
  }

  const interval = get('interval')
  if (interval && isIntradayInterval(interval)) {
    const fromTs = Number(get('from_ts'))
    const toTs = Number(get('to_ts'))
    if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) {
      return { status: 400, body: { error: 'Intraday requires valid from_ts and to_ts (unix seconds)' } }
    }
    const data = await getIntradaySeries(ticker, interval, fromTs, toTs)
    if (!data) return { status: 404, body: { error: 'No intraday series', ticker, interval } }
    return { status: 200, body: data }
  }

  const from = get('from') || defaultFromIso()
  let forceRefresh = get('refresh') === '1'
  if (forceRefresh && opts.skipForceRefresh) forceRefresh = false
  const staleOk = get('stale_ok') === '1' || get('staleOk') === '1'
  const data = await getCachedSeries(ticker, from, { forceRefresh, staleOk })
  if (!data) return { status: 404, body: { error: 'No series', ticker } }
  return { status: 200, body: data }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? JSON.parse(raw) : {})
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}
