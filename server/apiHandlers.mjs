/**
 * Shared /api handlers for Vite middleware and Express prod server.
 */
import { authEnabled, handleAuthApi, requireAuthOrSend, getUserFromRequest, authPublicConfig, createSessionToken, sessionSetCookieHeader, verifyCredentials, sessionClearCookieHeader, envUserCount, loadUsers } from './auth.mjs'
import { countDbUsers, createDbUser, listDbUsernames, normalizeUsername } from './userStore.mjs'
import { getCachedSeries, getIntradaySeries, seriesCacheFileCount } from './getSeries.mjs'
import { readBreadthHistory, upsertBreadthPoint, UNIVERSE_IDS } from './breadthStore.mjs'
import { computeBreadthChartHistory, getIndexBarsForChart } from './breadthHistory.mjs'
import { dbPath, dbStoreLabel, initDb } from './db.mjs'
import {
  getSnapshotJobStatus,
  isSnapshotFresh,
  maybeStartBackgroundSnapshot,
  readBarsAsOf,
  readMarketSnapshotMeta,
  readMarketSnapshotRow,
  readMarketSnapshotStocksChunk,
  runAsx200ForceRefresh,
  runUniverseSnapshot,
  runRetryFailedSnapshot,
  runRebuildSnapshotFromCache,
  syncSnapshotPricesFromSeriesMeta,
  readLastPricesFromBars,
} from './snapshotJob.mjs'
import {
  createAlertRule,
  deleteAlertRule,
  evaluateAlerts,
  listAlertEvents,
  listAlertRules,
} from './alerts.mjs'
import { queryPatternScanState, upsertPatternScanBatch } from './patternScanStore.mjs'
import { alertEmailConfigured } from './alertEmail.mjs'
import {
  getAlertEmailMinScore,
  getAlertEmailOptIn,
  getPatternAlertIds,
  getPatternAlertWatches,
  isEmailLogin,
  setAlertEmailMinScore,
  setAlertEmailOptIn,
  setPatternAlertIds,
  setPatternAlertWatches,
} from './userPrefs.mjs'
import { getFundamentals } from './fundamentals.mjs'
import { getFilingsForTicker, getLargestDisclosedBuys } from './asxFilings.mjs'
import { checkRateLimit, clientKey, log, pruneRateLimitBuckets } from './log.mjs'
import { seriesProviderName, isIntradayInterval } from './fetchSeries.mjs'
import { eodhdOnlyMode } from './eodhd.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  browserUniverseFetchEnabled,
  isAdminRequest,
  isProductionMode,
  readinessFromSnapshot,
  requireAdminOrSend,
  requireSessionOrAdmin,
  seriesRateLimitPerMinute,
  snapshotRateLimitPerMinute,
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

function snapshotStockCount(stocks) {
  if (!stocks) return 0
  if (Array.isArray(stocks)) return stocks.length
  return Object.keys(stocks).length
}

function requireAuthConnect(req, send) {
  return requireAuthOrSend(req, send)
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
    if (rateLimitOrSend(req, send, 'series', seriesRateLimitPerMinute())) return true
    try {
      const ticker = decodeURIComponent(url.pathname.replace('/api/series/', '')).toUpperCase()
      if (!ticker || !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
        send(400, { error: 'Invalid ticker' })
        return true
      }
      const skipForce = false
      const result = await loadSeriesForTicker(ticker, url.searchParams, {
        skipForceRefresh: skipForce,
      })
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
      log('info', 'series.ok', {
        ticker,
        bars: data.closes?.length,
        cache: data.meta?.cache,
        interval: data.meta?.interval,
        ms: Date.now() - started,
      })
      send(200, data)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'series.error', { message, ms: Date.now() - started })
      send(500, { error: message })
      return true
    }
  }

  if (url.pathname === '/api/snapshot/meta' && req.method === 'GET') {
    if (rateLimitOrSend(req, send, 'snapshot', snapshotRateLimitPerMinute())) return true
    // Never block meta on price sync / bars scan — that timed out production loads.
    void syncSnapshotPricesFromSeriesMeta()
    const meta = await readMarketSnapshotMeta()
    if (!meta) {
      void maybeStartBackgroundSnapshot()
      send(404, {
        error: 'No snapshot yet',
        job: await getSnapshotJobStatus(),
        hint: 'POST /api/snapshot/refresh or wait for background build',
      })
      return true
    }
    send(
      200,
      {
        ...meta,
        lastPrices: await readLastPricesFromBars(),
        browserUniverseFetch: browserUniverseFetchEnabled(),
        productionMode: isProductionMode(),
      },
      { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' },
    )
    return true
  }

  if (url.pathname === '/api/snapshot/stocks' && req.method === 'GET') {
    if (rateLimitOrSend(req, send, 'snapshot', snapshotRateLimitPerMinute())) return true
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || 500)
    const chunk = await readMarketSnapshotStocksChunk(offset, limit)
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
      const row = await readMarketSnapshotRow()
      if (!row) {
        void maybeStartBackgroundSnapshot()
        send(404, {
          error: 'No snapshot yet',
          job: await getSnapshotJobStatus(),
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
        lastPrices: await readLastPricesFromBars(),
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
      const row = await readMarketSnapshotRow()
      send(
        200,
        {
          job: await getSnapshotJobStatus(),
          snapshot: row
            ? {
                builtAt: row.builtAt,
                loaded: row.loaded,
                failed: row.failed,
                fresh: isSnapshotFresh(row.builtAt),
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
      if (status.status === 'running' && !deskPriority && !force) {
        log('info', 'snapshot.refresh', { alreadyRunning: true, force, priority })
        send(202, { ok: true, job: status })
        return true
      }
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
      log('info', 'snapshot.retry_failed', { started: true, via: 'asx200-force' })
      void runAsx200ForceRefresh().catch((err) => {
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

  if (url.pathname === '/api/health') {
    const snap = await readMarketSnapshotRow()
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
    const admin = await isAdminRequest(req)
    const barsAsOf = await readBarsAsOf()
    send(200, {
      ok: true,
      provider: seriesProviderName(),
      eodhd: Boolean(process.env.EODHD_API_TOKEN?.trim()),
      eodhdOnly: eodhdOnlyMode(),
      productionMode: isProductionMode(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      isAdmin: admin,
      barsAsOf: barsAsOf?.iso ?? null,
      barsAsOfLabel: barsAsOf?.label ?? null,
      rateLimits: {
        seriesPerMinute: seriesRateLimitPerMinute(),
        snapshotPerMinute: snapshotRateLimitPerMinute(),
      },
      readiness,
      authRequired: authEnabled(),
      authDbUserCount: authEnabled() ? await countDbUsers() : 0,
      authEnvUserCount: authEnabled() ? envUserCount() : 0,
      ...(admin
        ? { authUsernames: await listDbUsernames() }
        : {}),
      maintenance: maintenanceEnabled(),
      maintenanceMessage: maintenanceEnabled() ? maintenanceMessage() : undefined,
      eodhdDailyLimit: eodhdDailyLimitMeta(),
      seriesCached: await seriesCacheFileCount(),
      store: dbStoreLabel(),
      database: dbPath(),
      snapshot: snapMeta,
      job: await getSnapshotJobStatus(),
      liveQuotes: await getLiveQuotesMeta(),
      alertEmailEnabled: alertEmailConfigured(),
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

  app.get('/api/health', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    const snap = await readMarketSnapshotRow()
    const universeTotal = getUniverseCount()
    const snapMeta = snap
      ? {
          builtAt: snap.builtAt,
          loaded: snap.loaded,
          failed: snap.failed,
          fresh: isSnapshotFresh(snap.builtAt),
        }
      : null
    const readiness = readinessFromSnapshot(snapMeta || {}, universeTotal)
    const admin = await isAdminRequest(req)
    const barsAsOf = await readBarsAsOf()
    res.json({
      ok: true,
      provider: seriesProviderName(),
      eodhd: Boolean(process.env.EODHD_API_TOKEN?.trim()),
      eodhdOnly: eodhdOnlyMode(),
      productionMode: isProductionMode(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      isAdmin: admin,
      barsAsOf: barsAsOf?.iso ?? null,
      barsAsOfLabel: barsAsOf?.label ?? null,
      rateLimits: {
        seriesPerMinute: seriesRateLimitPerMinute(),
        snapshotPerMinute: snapshotRateLimitPerMinute(),
      },
      readiness,
      authRequired: authEnabled(),
      authDbUserCount: authEnabled() ? await countDbUsers() : 0,
      authEnvUserCount: authEnabled() ? envUserCount() : 0,
      ...(admin
        ? { authUsernames: await listDbUsernames() }
        : {}),
      maintenance: maintenanceEnabled(),
      maintenanceMessage: maintenanceEnabled() ? maintenanceMessage() : undefined,
      eodhdDailyLimit: eodhdDailyLimitMeta(),
      seriesCached: await seriesCacheFileCount(),
      store: dbStoreLabel(),
      database: dbPath(),
      snapshot: snapMeta,
      job: await getSnapshotJobStatus(),
      liveQuotes: await getLiveQuotesMeta(),
      alertEmailEnabled: alertEmailConfigured(),
    })
  })

  app.get('/api/auth/me', async (req, res) => {
    if (!authEnabled()) {
      return res.json({ user: null, authRequired: false })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ user: null, authRequired: true })
    const canReceiveAlertEmail = isEmailLogin(user)
    const alertEmailOptIn = canReceiveAlertEmail ? await getAlertEmailOptIn(user) : false
    const alertEmailMinScore = canReceiveAlertEmail ? await getAlertEmailMinScore(user) : 80
    const patternAlertIds = await getPatternAlertIds(user)
    const patternAlertWatches = await getPatternAlertWatches(user)
    return res.json({
      user,
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

  app.get('/api/auth/pattern-alert-prefs', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    return res.json({
      patternAlertIds: await getPatternAlertIds(user),
      patternAlertWatches: await getPatternAlertWatches(user),
    })
  })

  app.post('/api/auth/pattern-alert-prefs', async (req, res) => {
    if (!authEnabled()) {
      return res.status(400).json({ error: 'Auth is not configured on this server' })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ error: 'Unauthorized', authRequired: true })
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

  app.post('/api/auth/register', (_req, res) => {
    return res.status(403).json({ error: 'Registration is disabled' })
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
    if (seriesRateLimitOrExpress(req, res)) {
      return
    }
    try {
      const ticker = decodeURIComponent(req.params.ticker).toUpperCase()
      if (!ticker || !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
        return res.status(400).json({ error: 'Invalid ticker' })
      }
      const result = await loadSeriesForTicker(ticker, req.query, { skipForceRefresh: false })
      if (result.status === 404) {
        log('info', 'series.miss', { ticker, ms: Date.now() - started })
        return res.status(404).json(result.body)
      }
      if (result.status === 400) {
        return res.status(400).json(result.body)
      }
      const data = result.body
      log('info', 'series.ok', {
        ticker,
        bars: data.closes?.length,
        cache: data.meta?.cache,
        interval: data.meta?.interval,
        ms: Date.now() - started,
      })
      return res.json(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'series.error', { message, ms: Date.now() - started })
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
    // Never block meta on price sync — large stocks_perf JSON + bars scan timed out loads.
    void syncSnapshotPricesFromSeriesMeta()
    const meta = await readMarketSnapshotMeta()
    if (!meta) {
      void maybeStartBackgroundSnapshot()
      return res.status(404).json({
        error: 'No snapshot yet',
        job: await getSnapshotJobStatus(),
        hint: 'POST /api/snapshot/refresh or wait for background build',
      })
    }
    return res.json({
      ...meta,
      lastPrices: await readLastPricesFromBars(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      productionMode: isProductionMode(),
    })
  })

  app.get('/api/snapshot/stocks', async (req, res) => {
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
    const offset = Number(req.query.offset || 0)
    const limit = Number(req.query.limit || 500)
    const chunk = await readMarketSnapshotStocksChunk(offset, limit)
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
    const row = await readMarketSnapshotRow()
    if (!row) {
      void maybeStartBackgroundSnapshot()
      return res.status(404).json({
        error: 'No snapshot yet',
        job: await getSnapshotJobStatus(),
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
      lastPrices: await readLastPricesFromBars(),
      store: dbStoreLabel(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      productionMode: isProductionMode(),
    })
  })

  app.get('/api/snapshot/refresh', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    res.setHeader('Pragma', 'no-cache')
    const row = await readMarketSnapshotRow()
    return res.json({
      job: await getSnapshotJobStatus(),
      snapshot: row
        ? {
            builtAt: row.builtAt,
            loaded: row.loaded,
            failed: row.failed,
            fresh: isSnapshotFresh(row.builtAt),
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
    if (status.status === 'running' && !deskPriority && !force) {
      log('info', 'snapshot.refresh', { alreadyRunning: true, force, priority })
      return res.status(202).json({ ok: true, job: status })
    }
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
    // Prefer ASX200 force refresh — "retry failed" alone does nothing when all names are loaded but stale.
    log('info', 'snapshot.retry_failed', { started: true, via: 'asx200-force' })
    if (status.status === 'running') {
      // Still allow ASX200 supersede path
    }
    void runAsx200ForceRefresh().catch((err) => {
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
