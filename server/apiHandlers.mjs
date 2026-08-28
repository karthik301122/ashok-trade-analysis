/**
 * Shared /api handlers for Vite middleware and Express prod server.
 */
import { authEnabled, handleAuthApi, requireAuthOrSend, getUserFromRequest } from './auth.mjs'
import { getCachedSeries, seriesCacheFileCount } from './getSeries.mjs'
import { readBreadthHistory, upsertBreadthPoint, UNIVERSE_IDS } from './breadthStore.mjs'
import { dbPath } from './db.mjs'
import {
  getSnapshotJobStatus,
  isSnapshotFresh,
  maybeStartBackgroundSnapshot,
  readMarketSnapshotRow,
  runUniverseSnapshot,
  runRetryFailedSnapshot,
} from './snapshotJob.mjs'
import {
  createAlertRule,
  deleteAlertRule,
  evaluateAlerts,
  listAlertEvents,
  listAlertRules,
} from './alerts.mjs'
import { getFundamentals } from './fundamentals.mjs'
import { checkRateLimit, clientKey, log, pruneRateLimitBuckets } from './log.mjs'
import { seriesProviderName } from './fetchSeries.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  browserUniverseFetchEnabled,
  isAdminRequest,
  isProductionMode,
  readinessFromSnapshot,
  requireAdminOrSend,
  seriesRateLimitPerMinute,
  snapshotRateLimitPerMinute,
} from './production.mjs'

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

function requireAuthConnect(req, send) {
  return requireAuthOrSend(req, send)
}

function rateLimitOrSend(req, send, route, limit) {
  pruneRateLimitBuckets()
  const key = `${clientKey(req)}:${route}`
  const result = checkRateLimit(key, { limit, windowMs: 60_000 })
  if (!result.ok) {
    log('warn', 'rate_limited', { route, key: clientKey(req), retryAfterMs: result.retryAfterMs })
    send(429, {
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
      const from = url.searchParams.get('from') || defaultFromIso()
      let forceRefresh = url.searchParams.get('refresh') === '1'
      if (forceRefresh && isProductionMode() && !isAdminRequest(req)) {
        forceRefresh = false
      }
      const data = await getCachedSeries(ticker, from, { forceRefresh })
      if (!data) {
        log('info', 'series.miss', { ticker, from, ms: Date.now() - started })
        send(404, { error: 'No series', ticker })
        return true
      }
      log('info', 'series.ok', {
        ticker,
        from,
        bars: data.closes?.length,
        cache: data.meta?.cache,
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

  if (url.pathname === '/api/snapshot') {
    if (requireAuthConnect(req, send)) return true
    if (req.method === 'GET') {
      if (rateLimitOrSend(req, send, 'snapshot', snapshotRateLimitPerMinute())) return true
      const row = readMarketSnapshotRow()
      if (!row) {
        maybeStartBackgroundSnapshot()
        send(404, {
          error: 'No snapshot yet',
          job: getSnapshotJobStatus(),
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
        store: 'sqlite',
        browserUniverseFetch: browserUniverseFetchEnabled(),
        productionMode: isProductionMode(),
      })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/snapshot/refresh') {
    if (requireAuthConnect(req, send)) return true
    if (req.method === 'POST') {
      if (requireAdminOrSend(req, send)) return true
      const force = url.searchParams.get('force') === '1'
      // Kick async; return job status immediately if already running
      const status = getSnapshotJobStatus()
      if (status.status === 'running') {
        log('info', 'snapshot.refresh', { alreadyRunning: true, force })
        send(202, { ok: true, job: status })
        return true
      }
      log('info', 'snapshot.refresh', { started: true, force })
      void runUniverseSnapshot({ force }).catch((err) => {
        log('error', 'snapshot.refresh.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
      send(202, { ok: true, started: true, job: getSnapshotJobStatus() })
      return true
    }
    if (req.method === 'GET') {
      const row = readMarketSnapshotRow()
      send(200, {
        job: getSnapshotJobStatus(),
        snapshot: row
          ? {
              builtAt: row.builtAt,
              loaded: row.loaded,
              failed: row.failed,
              fresh: isSnapshotFresh(row.builtAt),
            }
          : null,
      })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/snapshot/retry-failed') {
    if (requireAuthConnect(req, send)) return true
    if (req.method === 'POST') {
      if (requireAdminOrSend(req, send)) return true
      const status = getSnapshotJobStatus()
      if (status.status === 'running') {
        log('info', 'snapshot.retry_failed', { alreadyRunning: true })
        send(202, { ok: true, job: status })
        return true
      }
      log('info', 'snapshot.retry_failed', { started: true })
      void runRetryFailedSnapshot().catch((err) => {
        log('error', 'snapshot.retry_failed.error', {
          message: err instanceof Error ? err.message : String(err),
        })
      })
      send(202, { ok: true, started: true, job: getSnapshotJobStatus() })
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
      send(200, { universe, points: readBreadthHistory(universe), store: 'sqlite' })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const universe = String(body?.universe || '')
      if (!UNIVERSE_IDS.has(universe)) {
        send(400, { error: 'Invalid universe' })
        return true
      }
      const points = upsertBreadthPoint(universe, body)
      send(200, { universe, points, store: 'sqlite' })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/health') {
    const snap = readMarketSnapshotRow()
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
    send(200, {
      ok: true,
      provider: seriesProviderName(),
      eodhd: Boolean(process.env.EODHD_API_TOKEN?.trim()),
      productionMode: isProductionMode(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      isAdmin: isAdminRequest(req),
      rateLimits: {
        seriesPerMinute: seriesRateLimitPerMinute(),
        snapshotPerMinute: snapshotRateLimitPerMinute(),
      },
      readiness,
      authRequired: authEnabled(),
      seriesCached: seriesCacheFileCount(),
      store: 'sqlite',
      database: dbPath(),
      snapshot: snapMeta,
      job: getSnapshotJobStatus(),
    })
    return true
  }

  if (url.pathname === '/api/alerts/rules') {
    if (requireAuthConnect(req, send)) return true
    if (req.method === 'GET') {
      send(200, { rules: listAlertRules() })
      return true
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      const rule = createAlertRule(body)
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
      deleteAlertRule(id)
      send(200, { ok: true })
      return true
    }
    send(405, { error: 'Method not allowed' })
    return true
  }

  if (url.pathname === '/api/alerts/events' && req.method === 'GET') {
    if (requireAuthConnect(req, send)) return true
    send(200, { events: listAlertEvents(50) })
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

  return false
}

/**
 * @param {import('express').Express} app
 */
export function mountExpressApi(app) {
  app.get('/api/health', (req, res) => {
    const snap = readMarketSnapshotRow()
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
    res.json({
      ok: true,
      provider: seriesProviderName(),
      eodhd: Boolean(process.env.EODHD_API_TOKEN?.trim()),
      productionMode: isProductionMode(),
      browserUniverseFetch: browserUniverseFetchEnabled(),
      isAdmin: isAdminRequest(req),
      rateLimits: {
        seriesPerMinute: seriesRateLimitPerMinute(),
        snapshotPerMinute: snapshotRateLimitPerMinute(),
      },
      readiness,
      authRequired: authEnabled(),
      seriesCached: seriesCacheFileCount(),
      store: 'sqlite',
      database: dbPath(),
      snapshot: snapMeta,
      job: getSnapshotJobStatus(),
    })
  })

  app.get('/api/auth/me', (req, res) => {
    if (!authEnabled()) {
      return res.json({ user: null, authRequired: false })
    }
    const user = getUserFromRequest(req)
    if (!user) return res.status(401).json({ user: null, authRequired: true })
    return res.json({ user, authRequired: true })
  })

  app.get('/api/series/:ticker', async (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const started = Date.now()
    if (
      rateLimitOrSend(
        req,
        (status, body) => res.status(status).json(body),
        'series',
        seriesRateLimitPerMinute(),
      )
    ) {
      return
    }
    try {
      const ticker = decodeURIComponent(req.params.ticker).toUpperCase()
      if (!ticker || !/^[A-Z0-9.^=-]{1,20}$/.test(ticker)) {
        return res.status(400).json({ error: 'Invalid ticker' })
      }
      const from = typeof req.query.from === 'string' ? req.query.from : defaultFromIso()
      let forceRefresh = req.query.refresh === '1'
      if (forceRefresh && isProductionMode() && !isAdminRequest(req)) {
        forceRefresh = false
      }
      const data = await getCachedSeries(ticker, from, { forceRefresh })
      if (!data) {
        log('info', 'series.miss', { ticker, from, ms: Date.now() - started })
        return res.status(404).json({ error: 'No series', ticker })
      }
      log('info', 'series.ok', {
        ticker,
        from,
        bars: data.closes?.length,
        cache: data.meta?.cache,
        ms: Date.now() - started,
      })
      return res.json(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      log('error', 'series.error', { message, ms: Date.now() - started })
      return res.status(500).json({ error: message })
    }
  })

  app.get('/api/snapshot', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
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
    const row = readMarketSnapshotRow()
    if (!row) {
      maybeStartBackgroundSnapshot()
      return res.status(404).json({
        error: 'No snapshot yet',
        job: getSnapshotJobStatus(),
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
      store: 'sqlite',
      browserUniverseFetch: browserUniverseFetchEnabled(),
      productionMode: isProductionMode(),
    })
  })

  app.get('/api/snapshot/refresh', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const row = readMarketSnapshotRow()
    return res.json({
      job: getSnapshotJobStatus(),
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

  app.post('/api/snapshot/refresh', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    if (isProductionMode() && !isAdminRequest(req)) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    const force = req.query.force === '1'
    const status = getSnapshotJobStatus()
    if (status.status === 'running') {
      log('info', 'snapshot.refresh', { alreadyRunning: true, force })
      return res.status(202).json({ ok: true, job: status })
    }
    log('info', 'snapshot.refresh', { started: true, force })
    void runUniverseSnapshot({ force }).catch((err) => {
      log('error', 'snapshot.refresh.error', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return res.status(202).json({ ok: true, started: true, job: getSnapshotJobStatus() })
  })

  app.post('/api/snapshot/retry-failed', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    if (isProductionMode() && !isAdminRequest(req)) {
      return res.status(403).json({
        error: 'Admin only in production mode',
        hint: 'Set ADMIN_USERS or call with x-admin-key header',
      })
    }
    const status = getSnapshotJobStatus()
    if (status.status === 'running') {
      log('info', 'snapshot.retry_failed', { alreadyRunning: true })
      return res.status(202).json({ ok: true, job: status })
    }
    log('info', 'snapshot.retry_failed', { started: true })
    void runRetryFailedSnapshot().catch((err) => {
      log('error', 'snapshot.retry_failed.error', {
        message: err instanceof Error ? err.message : String(err),
      })
    })
    return res.status(202).json({ ok: true, started: true, job: getSnapshotJobStatus() })
  })

  app.get('/api/breadth/daily', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    const universe = typeof req.query.universe === 'string' ? req.query.universe : 'asx200'
    if (!UNIVERSE_IDS.has(universe)) {
      return res.status(400).json({ error: 'Invalid universe' })
    }
    return res.json({ universe, points: readBreadthHistory(universe), store: 'sqlite' })
  })

  app.post('/api/breadth/daily', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    try {
      const universe = String(req.body?.universe || '')
      if (!UNIVERSE_IDS.has(universe)) {
        return res.status(400).json({ error: 'Invalid universe' })
      }
      const points = upsertBreadthPoint(universe, req.body || {})
      return res.json({ universe, points, store: 'sqlite' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return res.status(400).json({ error: message })
    }
  })

  app.get('/api/alerts/rules', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    return res.json({ rules: listAlertRules() })
  })

  app.post('/api/alerts/rules', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    return res.status(201).json({ rule: createAlertRule(req.body || {}) })
  })

  app.delete('/api/alerts/rules/:id', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    deleteAlertRule(Number(req.params.id))
    return res.json({ ok: true })
  })

  app.get('/api/alerts/events', (req, res) => {
    if (authEnabled() && !getUserFromRequest(req)) {
      return res.status(401).json({ error: 'Unauthorized', authRequired: true })
    }
    return res.json({ events: listAlertEvents(50) })
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
}

export function defaultFromIso() {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - 2)
  return d.toISOString().slice(0, 10)
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
