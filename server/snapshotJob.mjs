import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Worker } from 'worker_threads'
import { sqlAll, sqlOne, sqlRun } from './db.mjs'
import { dbStoreLabel } from './db.mjs'
import { getCachedSeries } from './getSeries.mjs'
import { eodhdEnabled } from './eodhd.mjs'
import { seriesToCachedPerf, mapPool } from './perfMath.mjs'
import { applyLiveQuotesToStockMap, getLiveQuotesMeta, stripLiveOverlayFromPerf } from './liveQuotes.mjs'
import { clearBreadthChartCache } from './breadthHistory.mjs'
import { readinessFromSnapshot } from './production.mjs'
import { isEodhdDailyLimitExceeded } from './eodhdLimit.mjs'
import { tickersForUniverseId } from './eodhdIndexMembers.mjs'
import { readSeriesCache, isoFromUnix, isLastBarAcceptable } from './seriesStore.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')
const stocksPerfWorkerPath = path.join(__dirname, 'stocksPerfParseWorker.mjs')

/** Clock window only — also require last AXJO bar current before skipping rebuilds. */
export const SNAPSHOT_FRESH_MS = 4 * 60 * 60 * 1000
const RETRY_COOLDOWN_MS = 30_000
/** Abandon in-process / orphaned jobs older than this so Refresh is never permanently stuck. */
const JOB_MAX_AGE_MS = () => {
  const n = Number(process.env.SNAPSHOT_JOB_MAX_AGE_MS)
  return Number.isFinite(n) && n > 0 ? n : 40 * 60 * 1000
}
/** Auto-start missing-ticker retry when failed count exceeds this. Opt-in: SNAPSHOT_AUTO_RETRY=1 */
export const AUTO_RETRY_FAILED_THRESHOLD = 300
function autoRetryEnabled() {
  const raw = process.env.SNAPSHOT_AUTO_RETRY?.trim().toLowerCase()
  if (!raw) return false
  return raw === '1' || raw === 'true' || raw === 'yes'
}
/** Min time between automatic high-failure retries (avoids meta-poll spam). */
const AUTO_RETRY_INTERVAL_MS = () => {
  const n = Number(process.env.SNAPSHOT_AUTO_RETRY_INTERVAL_MS)
  return Number.isFinite(n) && n > 0 ? n : 15 * 60 * 1000
}

/** @type {number} */
let lastAutoRetryAt = 0
/** @type {'auto-failed' | 'manual' | null} */
let lastJobTrigger = null

/** @type {Promise<unknown> | null} */
let runningJob = null
/** Bumped to cancel a hung in-process job so a new refresh can start. */
let jobEpoch = 0

/** If the DB says "running" but this process has no job (or the job is hung), clear it. */
export async function recoverStaleSnapshotJob() {
  const row = await sqlOne('SELECT * FROM snapshot_job WHERE id = 1')
  if (!row || row.status !== 'running') return false
  const age = Date.now() - Number(row.started_at || 0)
  const maxAge = JOB_MAX_AGE_MS()
  if (runningJob && Number.isFinite(age) && age < maxAge) return false
  if (runningJob) {
    jobEpoch += 1
    runningJob = null
    console.warn('[snapshot] abandoned hung in-process job', {
      ageMin: Math.round(age / 60000),
    })
  }
  await setJob('error', {
    started_at: row.started_at,
    finished_at: Date.now(),
    message:
      age >= maxAge
        ? 'Interrupted (hung job) — tap Refresh to rebuild'
        : 'Interrupted (server restart) — tap Refresh to rebuild',
    loaded: row.loaded,
    failed: row.failed,
    total: row.total,
  })
  console.warn('[snapshot] cleared stale running job from previous process')
  return true
}

function loadAsx200Tickers() {
  return loadUniverseSlice('asx200')
}

function loadUniverseSlice(universeId) {
  const fromMembers = tickersForUniverseId(universeId)
  if (fromMembers.length >= 50) return fromMembers
  const ranked = loadUniverse()
    .slice()
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  if (universeId === 'asx200') return ranked.slice(0, 200).map((u) => u.ticker)
  if (universeId === 'mid') return ranked.slice(200, 500).map((u) => u.ticker)
  return ranked.slice(500).map((u) => u.ticker)
}

/** ASX200 + mid + small membership (deduped, ASX200 first). */
function loadDeskBreadthTickers() {
  const seen = new Set()
  const out = []
  for (const id of ['asx200', 'mid', 'small']) {
    for (const t of loadUniverseSlice(id)) {
      if (seen.has(t)) continue
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

function snapshotNeedsMoreWork(existing) {
  if (!existing) return true
  const universe = loadUniverse()
  const readiness = readinessFromSnapshot(
    { ...existing, fresh: isSnapshotFresh(existing.builtAt) },
    universe.length,
  )
  return !readiness.snapshotAcceptable
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadUniverse() {
  return JSON.parse(fs.readFileSync(universePath, 'utf8'))
}

async function setJob(status, fields = {}) {
  await sqlRun(
    `INSERT INTO snapshot_job (id, status, started_at, finished_at, message, loaded, failed, total)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       status = excluded.status,
       started_at = COALESCE(excluded.started_at, snapshot_job.started_at),
       finished_at = excluded.finished_at,
       message = excluded.message,
       loaded = excluded.loaded,
       failed = excluded.failed,
       total = excluded.total`,
    [
      status,
      fields.started_at ?? null,
      fields.finished_at ?? null,
      fields.message ?? null,
      fields.loaded ?? 0,
      fields.failed ?? 0,
      fields.total ?? 0,
    ],
  )
}

export async function reconcileAcceptableSnapshotJob() {
  const row = await sqlOne('SELECT * FROM snapshot_job WHERE id = 1')
  if (!row || row.status !== 'error') return false
  // Counts only — never parse stocks_perf_json on the health/job status path.
  const existing = await readMarketSnapshotLightMeta()
  if (!existing || snapshotNeedsMoreWork(existing)) return false
  await setJob('done', {
    started_at: row.started_at,
    finished_at: existing.builtAt,
    message:
      existing.failed > 0
        ? `ok · ${existing.failed} still missing after retry`
        : 'ok',
    loaded: existing.loaded,
    failed: existing.failed,
    total: row.total,
  })
  console.log('[snapshot] reconciled error job — snapshot already acceptable')
  return true
}

export async function getSnapshotJobStatus() {
  await recoverStaleSnapshotJob()
  await reconcileAcceptableSnapshotJob()
  return peekSnapshotJobStatus()
}

/** Cheap job status for /api/health — no recover/reconcile side effects. */
export async function peekSnapshotJobStatus() {
  const row = await sqlOne('SELECT * FROM snapshot_job WHERE id = 1')
  if (!row) {
    return {
      status: 'idle',
      autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
      trigger: null,
    }
  }
  const status = row.status
  return {
    status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    message: row.message,
    loaded: row.loaded,
    failed: row.failed,
    total: row.total,
    autoRetryThreshold: AUTO_RETRY_FAILED_THRESHOLD,
    trigger: status === 'running' ? lastJobTrigger : null,
  }
}

export async function readMarketSnapshotDbRow() {
  const row = await sqlOne('SELECT * FROM market_snapshot WHERE id = 1')
  if (!row) return null
  const builtAt = Number(row.built_at)
  let stocks = stocksPerfCache && stocksPerfBuiltAt === builtAt ? stocksPerfCache : null
  if (!stocks && row.stocks_perf_json) {
    stocks = await parseStocksPerfInWorker(builtAt, row.stocks_perf_json)
    stocksPerfCache = stocks
    stocksPerfBuiltAt = builtAt
  }
  return {
    builtAt,
    asOf: row.as_of,
    loaded: Number(row.loaded),
    failed: Number(row.failed),
    indexPerf: JSON.parse(row.index_perf_json),
    stocks: stocks || {},
  }
}

/** Counts / freshness only — safe for /api/health and auto-retry gates. */
export async function readMarketSnapshotLightMeta() {
  const row = await sqlOne(
    'SELECT built_at, as_of, loaded, failed FROM market_snapshot WHERE id = 1',
  )
  if (!row) return null
  return {
    builtAt: Number(row.built_at),
    asOf: row.as_of,
    loaded: Number(row.loaded),
    failed: Number(row.failed),
  }
}

export async function readMarketSnapshotRow() {
  const row = await readMarketSnapshotDbRow()
  if (!row) return null
  return {
    ...row,
    stocks: await applyLiveQuotesToStockMap(row.stocks),
  }
}

/** In-memory cache so chunked stock reads don't re-parse the full JSON blob each time. */
let stocksPerfCache = null
let stocksPerfBuiltAt = 0
/** @type {Promise<boolean> | null} */
let stocksPerfWarmPromise = null

/** Parse stocks_perf JSON in a worker so the HTTP event loop stays responsive. */
function parseStocksPerfInWorker(builtAt, stocksJson) {
  return new Promise((resolve, reject) => {
    let settled = false
    const worker = new Worker(stocksPerfWorkerPath, {
      workerData: { builtAt, json: stocksJson },
    })
    const finish = (fn, arg) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void worker.terminate()
      fn(arg)
    }
    const timer = setTimeout(() => {
      finish(reject, new Error('stocks_perf worker timeout'))
    }, 120_000)
    worker.on('message', (msg) => {
      if (!msg?.ok) {
        finish(reject, new Error(msg?.error || 'stocks_perf worker failed'))
        return
      }
      finish(resolve, msg.map)
    })
    worker.on('error', (err) => finish(reject, err))
    worker.on('exit', (code) => {
      if (code !== 0) finish(reject, new Error(`stocks_perf worker exited ${code}`))
    })
  })
}

export function clearStocksPerfCache() {
  stocksPerfCache = null
  stocksPerfBuiltAt = 0
  stocksPerfWarmPromise = null
  lastPricesCache = null
}

/**
 * Apply batched ticker→lastPrice updates using the warm in-memory map only.
 * Skips entirely when cache is cold (UI still has lastPrices overlay).
 * @param {string[]} batch entries like "CBA|185.2"
 */
export async function applyLastPricePatchesFromWarmCache(batch) {
  if (!stocksPerfCache || !Array.isArray(batch) || !batch.length) return { updated: 0 }
  let updated = 0
  const next = { ...stocksPerfCache }
  for (const entry of batch) {
    const [ticker, priceRaw] = String(entry).split('|')
    const price = Number(priceRaw)
    if (!ticker || !Number.isFinite(price) || price <= 0) continue
    const perf = next[ticker]
    if (!perf || typeof perf !== 'object') continue
    const rounded = Math.round(price * 10000) / 10000
    if (Math.round(Number(perf.lastPrice) * 10000) === Math.round(rounded * 10000)) continue
    next[ticker] = { ...perf, lastPrice: rounded }
    updated++
  }
  if (!updated) return { updated: 0 }
  await sqlRun('UPDATE market_snapshot SET stocks_perf_json = ? WHERE id = 1', [
    JSON.stringify(next),
  ])
  stocksPerfCache = next
  lastPricesCache = null
  return { updated }
}

/**
 * Parse stocks_perf_json once per process (shared across concurrent chunk requests).
 * Uses a worker thread — never sync-JSON.parses the giant blob on the request thread.
 * @returns {Promise<boolean>}
 */
export async function ensureStocksPerfCacheWarm() {
  if (stocksPerfCache) return true
  if (stocksPerfWarmPromise) return stocksPerfWarmPromise
  stocksPerfWarmPromise = (async () => {
    try {
      const row = await sqlOne('SELECT built_at, stocks_perf_json FROM market_snapshot WHERE id = 1')
      if (!row?.stocks_perf_json) return false
      const builtAt = Number(row.built_at)
      if (stocksPerfCache && stocksPerfBuiltAt === builtAt) return true
      const t0 = Date.now()
      const map = await parseStocksPerfInWorker(builtAt, row.stocks_perf_json)
      stocksPerfCache = map
      stocksPerfBuiltAt = builtAt
      console.log(
        `[snapshot] worker-parsed stocks_perf (${Object.keys(map).length} names) in ${Date.now() - t0}ms`,
      )
      return true
    } catch (err) {
      console.warn(
        '[snapshot] stocks_perf warm failed:',
        err instanceof Error ? err.message : String(err),
      )
      return false
    } finally {
      stocksPerfWarmPromise = null
    }
  })()
  return stocksPerfWarmPromise
}

/**
 * Map series cache symbol (CBA.AX) → app ticker (CBA). Skip indexes/crypto/forex.
 * @param {string} symbol
 */
function appTickerFromBarSymbol(symbol) {
  const t = String(symbol || '').toUpperCase()
  if (!t || t.startsWith('^') || t.startsWith('CMDTY:')) return ''
  if (t.endsWith('.INDX') || t.endsWith('.CC') || t.endsWith('.FOREX')) return ''
  if (t.endsWith('.AX') || t.endsWith('.AU')) return t.slice(0, -3)
  if (t.includes('.')) return ''
  return t
}

/** @type {number} */
let lastPriceSyncAt = 0
const PRICE_SYNC_MIN_MS = 15 * 1000

/** @type {{ at: number, prices: Record<string, number>, key?: string } | null} */
let lastPricesCache = null
const LAST_PRICES_CACHE_MS = 20 * 1000
/** @type {Promise<Record<string, number>> | null} */
let lastPricesWarmPromise = null
/** @type {number} */
let lastMaybeBackgroundAt = 0
const MAYBE_BACKGROUND_DEBOUNCE_MS = 60_000

/** Instant — never hits DB. Used by /api/snapshot/meta so desk load cannot hang. */
export function peekCachedLastPrices() {
  return lastPricesCache?.prices && typeof lastPricesCache.prices === 'object'
    ? lastPricesCache.prices
    : {}
}

/** Warm series_meta last-prices in the background (shared across callers). */
export function scheduleLastPricesCacheWarm() {
  if (lastPricesCache && Date.now() - lastPricesCache.at < LAST_PRICES_CACHE_MS) return
  if (lastPricesWarmPromise) return
  lastPricesWarmPromise = readLastPricesFromBars()
    .catch(() => ({}))
    .finally(() => {
      lastPricesWarmPromise = null
    })
}

function snapshotAutoBackgroundEnabled() {
  const raw =
    process.env.SNAPSHOT_AUTO_BACKGROUND?.trim().toLowerCase() ||
    process.env.SNAPSHOT_BACKGROUND_ON_BOOT?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

/** @type {number} */
let lastStalePricePullAt = 0
/** Default off — this job flooded EODHD/series and starved health checks in Azure. */
const STALE_PRICE_PULL_ENABLED = process.env.SNAPSHOT_STALE_BAR_REFRESH === '1'
const STALE_PRICE_PULL_MS = Math.max(
  30 * 60 * 1000,
  Number(process.env.SNAPSHOT_STALE_BAR_REFRESH_MS || 60 * 60 * 1000) || 60 * 60 * 1000,
)
const STALE_PRICE_PULL_MAX = Math.min(
  15,
  Math.max(1, Number(process.env.SNAPSHOT_STALE_BAR_REFRESH_MAX || 5) || 5),
)
/** @type {boolean} */
let stalePricePullRunning = false

/**
 * Align Markets overview lastPrice with the latest bar close (same value charts use).
 * Prefer bars over series_meta.last — meta can lag behind the bars table.
 * When both JNS.AX and JNS.AU exist, keep the bar with the latest session timestamp.
 *
 * Hot path safe: never JSON.parse stocks_perf_json unless the in-memory cache is warm.
 * Client already receives lastPrices overlay from series_meta.
 */
export async function syncSnapshotPricesFromSeriesMeta(opts = {}) {
  const force = Boolean(opts.force)
  const now = Date.now()
  if (!force && now - lastPriceSyncAt < PRICE_SYNC_MIN_MS) {
    return { skipped: true, updated: 0 }
  }
  lastPriceSyncAt = now

  try {
    // Optional catch-up only when explicitly enabled (was melting the App Service).
    if (STALE_PRICE_PULL_ENABLED) {
      scheduleStaleLastBarRefresh()
    }

    // Prefer warm cache — never parse ~MB stocks_perf_json on the request path.
    const stocks = stocksPerfCache
    if (!stocks) {
      // Overlay lastPrices on meta/stocks responses is enough for the UI.
      return { skipped: true, updated: 0, reason: 'no-warm-cache' }
    }

    const lastPrices = await readLastPricesFromBars({ fromBars: false })
    if (!lastPrices || !Object.keys(lastPrices).length) return { updated: 0 }

    let updated = 0
    const nextStocks = { ...stocks }
    for (const [ticker, last] of Object.entries(lastPrices)) {
      const perf = nextStocks[ticker]
      if (!perf || typeof perf !== 'object') continue
      const next = Math.round(Number(last) * 10000) / 10000
      if (!Number.isFinite(next) || next <= 0) continue
      if (Math.round(Number(perf.lastPrice) * 10000) === Math.round(next * 10000)) continue
      nextStocks[ticker] = { ...perf, lastPrice: next }
      updated++
    }

    if (updated === 0) return { updated: 0 }

    await sqlRun('UPDATE market_snapshot SET stocks_perf_json = ? WHERE id = 1', [
      JSON.stringify(nextStocks),
    ])
    stocksPerfCache = nextStocks
    lastPricesCache = null
    console.log(`[snapshot] synced ${updated} lastPrices from series_meta`)
    return { updated }
  } catch (err) {
    console.warn(
      '[snapshot] price sync failed:',
      err instanceof Error ? err.message : String(err),
    )
    return { updated: 0, error: true }
  }
}

/**
 * Background-only: re-pull a small capped set of series whose last bar is behind.
 * Disabled unless SNAPSHOT_STALE_BAR_REFRESH=1 — otherwise it queues dozens of
 * forced EODHD pulls and drives series latency to 30–70s (Azure unhealthy).
 * @param {string[]} [preferTickers]
 */
export function scheduleStaleLastBarRefresh(preferTickers = []) {
  if (!STALE_PRICE_PULL_ENABLED) return
  const now = Date.now()
  if (stalePricePullRunning) return
  if (now - lastStalePricePullAt < STALE_PRICE_PULL_MS) return
  stalePricePullRunning = true
  lastStalePricePullAt = now
  void (async () => {
    try {
      const lastBars = await sqlAll(
        `SELECT b.symbol, b.c AS last, b.t AS t
         FROM bars b
         INNER JOIN (
           SELECT symbol, MAX(t) AS maxt FROM bars GROUP BY symbol
         ) x ON b.symbol = x.symbol AND b.t = x.maxt
         WHERE b.c > 0`,
      )
      /** @type {Map<string, { last: number, t: number }>} */
      const byTicker = new Map()
      for (const bar of lastBars || []) {
        const ticker = appTickerFromBarSymbol(bar.symbol)
        if (!ticker) continue
        const last = Number(bar.last)
        const t = Number(bar.t)
        if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(t)) continue
        const prev = byTicker.get(ticker)
        if (!prev || t >= prev.t) byTicker.set(ticker, { last, t })
      }
      const prefer = new Set(
        (preferTickers || []).map((t) => String(t || '').toUpperCase()).filter(Boolean),
      )
      /** @type {string[]} */
      const stale = []
      for (const [ticker, info] of byTicker) {
        if (!isLastBarAcceptable([{ t: info.t, c: info.last }])) stale.push(ticker)
      }
      stale.sort((a, b) => {
        const ap = prefer.has(a) ? 0 : 1
        const bp = prefer.has(b) ? 0 : 1
        return ap - bp || a.localeCompare(b)
      })
      if (!stale.length) return

      const from = new Date()
      from.setUTCFullYear(from.getUTCFullYear() - 2)
      const fromIso = from.toISOString().slice(0, 10)
      const toPull = stale.slice(0, STALE_PRICE_PULL_MAX)
      // Serial pulls — concurrency 2 still saturates a small App Service under load.
      await mapPool(
        toPull,
        1,
        async (ticker) => {
          try {
            await getCachedSeries(ticker, fromIso, { staleOk: false })
          } catch {
            /* ignore */
          }
          return ticker
        },
        undefined,
        STALE_PRICE_PULL_MAX,
      )
      lastPricesCache = null
      await syncSnapshotPricesFromSeriesMeta({ force: true })
      console.log(
        `[snapshot] background refreshed ${toPull.length}/${stale.length} stale last-bars`,
      )
    } catch (err) {
      console.warn(
        '[snapshot] background stale last-bar refresh failed:',
        err instanceof Error ? err.message : String(err),
      )
    } finally {
      stalePricePullRunning = false
    }
  })()
}

/**
 * Lightweight ticker → last close for client overlay.
 * Default: series_meta (one row/symbol — safe for /api/snapshot/meta).
 * fromBars: true scans bars (slower; background price sync only).
 * @param {{ bypassCache?: boolean, fromBars?: boolean }} [opts]
 * @returns {Promise<Record<string, number>>}
 */
export async function readLastPricesFromBars(opts = {}) {
  try {
    const now = Date.now()
    const cacheKey = opts.fromBars ? 'bars' : 'meta'
    if (
      !opts.bypassCache &&
      lastPricesCache &&
      lastPricesCache.key === cacheKey &&
      now - lastPricesCache.at < LAST_PRICES_CACHE_MS
    ) {
      return lastPricesCache.prices
    }

    /** @type {Map<string, { last: number, t?: number }>} */
    const byTicker = new Map()

    if (opts.fromBars) {
      const lastBars = await sqlAll(
        `SELECT b.symbol, b.c AS last, b.t AS t
         FROM bars b
         INNER JOIN (
           SELECT symbol, MAX(t) AS maxt FROM bars GROUP BY symbol
         ) x ON b.symbol = x.symbol AND b.t = x.maxt
         WHERE b.c > 0`,
      )
      for (const bar of lastBars || []) {
        const ticker = appTickerFromBarSymbol(bar.symbol)
        if (!ticker) continue
        const last = Number(bar.last)
        const t = Number(bar.t)
        if (!Number.isFinite(last) || last <= 0) continue
        const prev = byTicker.get(ticker)
        if (!prev || (Number.isFinite(t) && t >= (prev.t || 0))) {
          byTicker.set(ticker, { last, t })
        }
      }
    } else {
      const rows = await sqlAll('SELECT symbol, last FROM series_meta WHERE last > 0')
      for (const row of rows || []) {
        const ticker = appTickerFromBarSymbol(row.symbol)
        if (!ticker) continue
        const last = Number(row.last)
        if (!Number.isFinite(last) || last <= 0) continue
        byTicker.set(ticker, { last })
      }
    }

    /** @type {Record<string, number>} */
    const out = {}
    for (const [ticker, { last }] of byTicker) {
      out[ticker] = Math.round(last * 10000) / 10000
    }
    lastPricesCache = { at: Date.now(), prices: out, key: cacheKey }
    return out
  } catch (err) {
    console.warn(
      '[snapshot] readLastPricesFromBars failed:',
      err instanceof Error ? err.message : String(err),
    )
    return {}
  }
}

/** Latest AXJO daily bar date (ISO) — what Markets/charts should match. */
export async function readBarsAsOf() {
  try {
    const cached = await readSeriesCache('^AXJO')
    if (!cached?.closes?.length) return null
    const iso = isoFromUnix(cached.closes[cached.closes.length - 1].t)
    const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-AU', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return { iso, label }
  } catch {
    return null
  }
}

/**
 * Fast metadata without parsing the large stocks JSON column.
 * Optional enrichment (bars as-of / live quotes) is hard-capped so meta never
 * hangs the desk loader when Postgres or series_meta is under load.
 */
export async function readMarketSnapshotMeta() {
  // Do not warm stocks_perf here — JSON.parse of that blob blocks the event loop
  // and hung /api/health + /api/auth/me for everyone. Chunks warm on demand.
  const row = await sqlOne(
    'SELECT built_at, as_of, loaded, failed, index_perf_json FROM market_snapshot WHERE id = 1',
  )
  if (!row) return null
  const builtAt = Number(row.built_at)

  let barsAsOf = /** @type {{ iso: string, label: string } | null} */ (null)
  let barsCurrent = true
  let liveQuotes = { enabled: false, count: 0, updatedAt: 0, fresh: false, usable: false, marketOpen: false }

  const enrichMs = Number(process.env.SNAPSHOT_META_ENRICH_MS)
  const enrichBudget = Number.isFinite(enrichMs) && enrichMs >= 0 ? enrichMs : 400
  if (enrichBudget > 0) {
    let timer
    try {
      await Promise.race([
        (async () => {
          const [asOf, current, lq] = await Promise.all([
            readBarsAsOf(),
            isSnapshotBarsCurrent(),
            getLiveQuotesMeta(),
          ])
          barsAsOf = asOf
          barsCurrent = current
          liveQuotes = lq
        })(),
        new Promise((resolve) => {
          timer = setTimeout(resolve, enrichBudget)
        }),
      ])
    } catch {
      /* keep clock-only freshness */
    } finally {
      clearTimeout(timer)
    }
  }

  const mapSize = stocksPerfCache ? Object.keys(stocksPerfCache).length : null
  if (mapSize != null && mapSize > 0 && mapSize < Number(row.loaded) * 0.5) {
    console.warn('[snapshot] stock map smaller than DB loaded counter', {
      mapSize,
      dbLoaded: Number(row.loaded),
    })
  }

  return {
    builtAt,
    asOf: row.as_of,
    barsAsOf: barsAsOf?.iso ?? null,
    barsAsOfLabel: barsAsOf?.label ?? null,
    // Prefer real map size when warm — DB loaded can drift after partial writes.
    loaded: mapSize != null && mapSize > 0 ? mapSize : Number(row.loaded),
    mapTotal: mapSize != null && mapSize > 0 ? mapSize : undefined,
    dbLoaded: Number(row.loaded),
    failed: Number(row.failed),
    fresh: isSnapshotFresh(builtAt) && barsCurrent,
    indexPerf: JSON.parse(row.index_perf_json),
    store: dbStoreLabel(),
    liveQuotes,
    stocksCacheWarm: Boolean(stocksPerfCache),
  }
}

/** Paginated stock perfs for browsers that cannot download one giant /api/snapshot payload. */
export async function readMarketSnapshotStocksChunk(offset, limit, opts = {}) {
  await ensureStocksPerfCacheWarm()
  let map = stocksPerfCache
  if (!map) {
    const row = await sqlOne('SELECT built_at, stocks_perf_json FROM market_snapshot WHERE id = 1')
    if (!row) return null
    map = loadStocksPerfMap(Number(row.built_at), row.stocks_perf_json)
  }
  const prefer = String(opts.prefer || '').toLowerCase()
  let keys = Object.keys(map)
  if (prefer === 'asx200' || prefer === 'desk') {
    const ranked = loadDeskBreadthTickers()
    const inMap = new Set(keys)
    const preferred = []
    const seen = new Set()
    for (const t of ranked) {
      if (!inMap.has(t) || seen.has(t)) continue
      seen.add(t)
      preferred.push(t)
    }
    for (const t of keys) {
      if (seen.has(t)) continue
      preferred.push(t)
    }
    keys = preferred
  }
  const safeOffset = Math.max(0, Math.min(offset, keys.length))
  const safeLimit = Math.max(1, Math.min(limit, 800))
  const slice = keys.slice(safeOffset, safeOffset + safeLimit)
  const stocks = {}
  for (const k of slice) stocks[k] = map[k]
  await applyLiveQuotesToStockMap(stocks)
  return {
    offset: safeOffset,
    limit: safeLimit,
    total: keys.length,
    count: slice.length,
    prefer: prefer || undefined,
    stocks,
  }
}

export function isSnapshotFresh(builtAt, now = Date.now()) {
  return Number.isFinite(builtAt) && now - builtAt < SNAPSHOT_FRESH_MS
}

/** True when AXJO last bar matches the expected session (not write-time alone). */
export async function isSnapshotBarsCurrent() {
  try {
    const cached = await readSeriesCache('^AXJO')
    return Boolean(cached?.closes?.length && isLastBarAcceptable(cached.closes))
  } catch {
    return false
  }
}

/** Skip background/universe rebuild only when clock-fresh and bars are current. */
export async function snapshotLooksCurrent(existing) {
  if (!existing) return false
  if (snapshotNeedsMoreWork(existing)) return false
  if (!isSnapshotFresh(existing.builtAt)) return false
  return isSnapshotBarsCurrent()
}

function from2yIso() {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - 2)
  return d.toISOString().slice(0, 10)
}

function from5yIso() {
  const d = new Date()
  d.setUTCFullYear(d.getUTCFullYear() - 5)
  return d.toISOString().slice(0, 10)
}

async function loadIndexPerf(from5y, opts = {}) {
  const indexSeries = await getCachedSeries('^AXJO', from5y, {
    forceRefresh: Boolean(opts.forceRefresh),
    staleOk: Boolean(opts.staleOk),
  })
  if (!indexSeries?.closes?.length) {
    throw new Error('Could not load ASX200 (^AXJO)')
  }
  const indexCloses = indexSeries.closes.map((b) => b.c)
  const indexM3 =
    indexCloses.length > 63
      ? ((indexCloses[indexCloses.length - 1] - indexCloses[indexCloses.length - 1 - 63]) /
          indexCloses[indexCloses.length - 1 - 63]) *
        100
      : 0
  return seriesToCachedPerf(indexSeries, indexM3)
}

async function persistSnapshot(stocks, indexPerf, loaded, failed) {
  const builtAt = Date.now()
  const barsAsOf = await readBarsAsOf()
  const clock = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  })
  const asOf = barsAsOf?.label
    ? `Bars ${barsAsOf.label} · updated ${clock}`
    : clock

  const cleanStocks = {}
  for (const [ticker, perf] of Object.entries(stocks)) {
    cleanStocks[ticker] = stripLiveOverlayFromPerf(perf)
  }

  await sqlRun(
    `INSERT INTO market_snapshot (id, built_at, as_of, loaded, failed, index_perf_json, stocks_perf_json)
     VALUES (1, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       built_at = excluded.built_at,
       as_of = excluded.as_of,
       loaded = excluded.loaded,
       failed = excluded.failed,
       index_perf_json = excluded.index_perf_json,
       stocks_perf_json = excluded.stocks_perf_json`,
    [
      builtAt,
      asOf,
      loaded,
      failed,
      JSON.stringify(indexPerf),
      JSON.stringify(cleanStocks),
    ],
  )

  clearStocksPerfCache()
  clearBreadthChartCache()
  return { builtAt, asOf, barsAsOf: barsAsOf?.iso ?? null }
}

async function loadSeriesForSnapshot(ticker, from2y, forceRefresh = false) {
  if (forceRefresh) {
    return getCachedSeries(ticker, from2y, { forceRefresh: true })
  }
  // Prefer fresh bars; fall back to cached history so illiquids still populate the desk.
  const fresh = await getCachedSeries(ticker, from2y, { staleOk: false })
  if (fresh?.closes?.length) return fresh
  return getCachedSeries(ticker, from2y, { staleOk: true })
}

function applySeriesToStocks(ticker, series, indexM3, stocks, failedTickers) {
  if (!series?.closes?.length) {
    failedTickers.push(ticker)
    return
  }
  const perf = seriesToCachedPerf(series, indexM3)
  if (!perf || typeof perf !== 'object') {
    failedTickers.push(ticker)
    return
  }
  stocks[ticker] = perf
}

/**
 * Pull tickers with slower pacing + force refresh (transient EODHD throttling).
 */
async function retryFailedTickers(
  tickers,
  from2y,
  indexPerf,
  stocks,
  started,
  totalUniverse,
) {
  if (!tickers.length || isEodhdDailyLimitExceeded()) return tickers

  console.log(`[snapshot] retry pass for ${tickers.length} tickers (cooldown ${RETRY_COOLDOWN_MS / 1000}s)…`)
  const retryLabel = lastJobTrigger === 'auto-failed' ? 'Auto-retrying' : 'Retrying'
  await setJob('running', {
    started_at: started,
    message: `${retryLabel} ${tickers.length.toLocaleString()} failed stocks (brief pause)…`,
    loaded: Object.keys(stocks).length,
    failed: totalUniverse - Object.keys(stocks).length,
    total: totalUniverse,
  })
  await sleep(RETRY_COOLDOWN_MS)

  const stillFailed = []

  await mapPool(
    tickers,
    eodhdEnabled() ? 2 : 2,
    async (ticker) => {
      // Prefer any cached history first (illiquids), then force EODHD refresh.
      let series = await getCachedSeries(ticker, from2y, { staleOk: true })
      if (!series?.closes?.length) {
        series = await loadSeriesForSnapshot(ticker, from2y, true)
      }
      applySeriesToStocks(ticker, series, indexPerf.m3, stocks, stillFailed)
      return ticker
    },
    async (done) => {
      const loaded = Object.keys(stocks).length
      if (done % 25 === 0 || done === tickers.length) {
        await setJob('running', {
          started_at: started,
          message: `${retryLabel} ${done.toLocaleString()}/${tickers.length.toLocaleString()} failed stocks…`,
          loaded,
          failed: totalUniverse - loaded,
          total: totalUniverse,
        })
      }
    },
    eodhdEnabled() ? snapshotFetchPacing().delayMs : 80,
  )

  return stillFailed
}

function snapshotFetchPacing() {
  if (!eodhdEnabled()) {
    return { concurrency: 4, delayMs: 20 }
  }
  const concurrency = Number(process.env.EODHD_SNAPSHOT_CONCURRENCY)
  const delayMs = Number(process.env.EODHD_SNAPSHOT_DELAY_MS)
  return {
    // Throttle serializes HTTP; mild concurrency helps overlap DB/cache work.
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 3,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 40,
  }
}

/**
 * Build full-universe CachedPerf map into SQLite.
 * @param {{ force?: boolean, concurrency?: number, retryFailed?: boolean, skipRetryPass?: boolean, autoRetry?: boolean }} [opts]
 */
export async function runUniverseSnapshot(opts = {}) {
  await recoverStaleSnapshotJob()
  if (runningJob) return runningJob

  const force = Boolean(opts.force)
  const retryFailedOnly = Boolean(opts.retryFailed)
  const skipRetryPass = Boolean(opts.skipRetryPass)
  const autoRetry = Boolean(opts.autoRetry)
  const pacing = snapshotFetchPacing()
  const concurrency = Number(opts.concurrency) || pacing.concurrency
  const poolDelayMs = pacing.delayMs
  const existing = await readMarketSnapshotDbRow()
  const job = await getSnapshotJobStatus()

  if (!force && !retryFailedOnly && (await snapshotLooksCurrent(existing))) {
    return {
      loaded: existing.loaded,
      failed: existing.failed,
      skipped: true,
      builtAt: existing.builtAt,
    }
  }

  const resumingIncomplete =
    !force &&
    !retryFailedOnly &&
    existing &&
    snapshotNeedsMoreWork(existing)

  lastJobTrigger = autoRetry ? 'auto-failed' : 'manual'

  runningJob = (async () => {
    const universe = loadUniverse()
    const allTickers = universe.map((u) => u.ticker)
    const total = allTickers.length
    const started = Date.now()
    const from2y = from2yIso()
    const from5y = from5yIso()
    const failedCount = Number(existing?.failed ?? 0)
    const startMessage = resumingIncomplete
      ? 'Resuming interrupted universe build'
      : retryFailedOnly
        ? autoRetry
          ? `Auto-retrying ${failedCount.toLocaleString()} failed stocks…`
          : `Retrying ${failedCount.toLocaleString()} failed stocks…`
        : 'Fetching market data via SQLite cache'

    await setJob('running', {
      started_at: started,
      finished_at: null,
      message: startMessage,
      loaded: existing?.loaded ?? 0,
      failed: existing?.failed ?? 0,
      total,
    })

    try {
      // Always last-bar fresh for the benchmark — never clock/write-time staleOk.
      const indexPerf = await loadIndexPerf(from5y, {
        forceRefresh: force,
        staleOk: false,
      })

      const stocks =
        (retryFailedOnly || resumingIncomplete) && existing?.stocks
          ? { ...existing.stocks }
          : {}
      const failedTickers = []

      const maybePersistPartial = (() => {
        let lastPersist = Object.keys(stocks).length
        return async () => {
          const loaded = Object.keys(stocks).length
          if (loaded === 0 || loaded - lastPersist < 75) return
          lastPersist = loaded
          await persistSnapshot(stocks, indexPerf, loaded, total - loaded)
        }
      })()

      if (indexPerf && Object.keys(stocks).length === 0 && !retryFailedOnly) {
        await persistSnapshot(stocks, indexPerf, 0, total)
      }

      const tickersToFetch =
        retryFailedOnly || resumingIncomplete
          ? allTickers.filter((t) => !stocks[t])
          : allTickers

      if (retryFailedOnly && tickersToFetch.length === 0) {
        await setJob('done', {
          started_at: started,
          finished_at: Date.now(),
          message: 'nothing to retry',
          loaded: Object.keys(stocks).length,
          failed: total - Object.keys(stocks).length,
          total,
        })
        return {
          loaded: Object.keys(stocks).length,
          failed: total - Object.keys(stocks).length,
          builtAt: existing?.builtAt,
          asOf: existing?.asOf,
          skipped: true,
        }
      }

      if (!retryFailedOnly) {
        await mapPool(
          tickersToFetch,
          concurrency,
          async (ticker) => {
            const series = await loadSeriesForSnapshot(ticker, from2y, force)
            applySeriesToStocks(ticker, series, indexPerf.m3, stocks, failedTickers)
            return ticker
          },
          async (done) => {
            if (done % 50 === 0 || done === tickersToFetch.length) {
              await setJob('running', {
                started_at: started,
                message: `Fetching ${done}/${tickersToFetch.length}`,
                loaded: Object.keys(stocks).length,
                failed: total - Object.keys(stocks).length,
                total,
              })
              await maybePersistPartial()
            }
          },
          poolDelayMs,
        )
      }

      if (isEodhdDailyLimitExceeded()) {
        const loaded = Object.keys(stocks).length
        const failed = total - loaded
        const { builtAt, asOf } = await persistSnapshot(stocks, indexPerf, loaded, failed)
        await setJob('error', {
          started_at: started,
          finished_at: builtAt,
          message:
            'EODHD daily API limit reached — progress saved. Resumes after UTC midnight.',
          loaded,
          failed,
          total,
        })
        console.warn(
          `[snapshot] paused (EODHD daily limit) · loaded=${loaded} failed=${failed} total=${total}`,
        )
        return { loaded, failed, builtAt, asOf, pausedDailyLimit: true }
      }

      let stillFailed = failedTickers
      if (retryFailedOnly) {
        stillFailed = await retryFailedTickers(
          tickersToFetch,
          from2y,
          indexPerf,
          stocks,
          started,
          total,
        )
      } else if (
        !skipRetryPass &&
        failedTickers.length > 0 &&
        !isEodhdDailyLimitExceeded()
      ) {
        stillFailed = await retryFailedTickers(
          failedTickers,
          from2y,
          indexPerf,
          stocks,
          started,
          total,
        )
      }

      const loaded = Object.keys(stocks).length
      const failed = total - loaded
      const { builtAt, asOf } = await persistSnapshot(stocks, indexPerf, loaded, failed)

      await setJob('done', {
        started_at: started,
        finished_at: builtAt,
        message: stillFailed.length
          ? `ok · ${stillFailed.length} still missing after retry`
          : 'ok',
        loaded,
        failed,
        total,
      })

      try {
        const { maybeStartFullUniversePatternJob } = await import('./patternJob.mjs')
        maybeStartFullUniversePatternJob({
          stocks,
          indexM3: indexPerf.m3,
        })
      } catch {
        /* non-fatal */
      }

      console.log(
        `[snapshot] done · loaded=${loaded} failed=${failed} total=${total} in ${Math.round((builtAt - started) / 1000)}s`,
      )
      return { loaded, failed, builtAt, asOf, skipped: false }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const loaded = Object.keys(stocks).length
      const failed = total - loaded
      if (loaded > 0) {
        try {
          await persistSnapshot(stocks, indexPerf, loaded, failed)
        } catch {
          /* best-effort */
        }
      }
      await setJob('error', {
        started_at: started,
        finished_at: Date.now(),
        message,
        loaded,
        failed,
        total,
      })
      console.error('[snapshot] failed:', message)
      throw err
    } finally {
      runningJob = null
      lastJobTrigger = null
    }
  })()

  return runningJob
}

/**
 * Legacy endpoint name — no longer rebuilds from SQLite alone.
 * Delegates to desk force refresh (ASX200 + mid + small from EODHD).
 */
export function runRebuildSnapshotFromCache() {
  console.warn(
    '[snapshot] rebuild-cache is deprecated; running desk force refresh (priority=desk)',
  )
  return runAsx200ForceRefresh()
}

/** Retry only tickers missing from the last snapshot (slower, force refresh). */
export function runRetryFailedSnapshot(opts = {}) {
  return runUniverseSnapshot({
    retryFailed: true,
    autoRetry: Boolean(opts.autoRetry),
  })
}

/**
 * When failed names exceed AUTO_RETRY_FAILED_THRESHOLD, start a missing-only retry.
 * Safe to call from meta/refresh polls (cooldown + eodhd-limit guarded).
 * Do not call from /api/health — that path must stay cheap.
 */
export async function maybeAutoRetryHighFailures() {
  if (!autoRetryEnabled()) return { started: false, reason: 'disabled' }
  await recoverStaleSnapshotJob()
  if (runningJob) return { started: false, reason: 'already-running' }
  const job = await getSnapshotJobStatus()
  if (job.status === 'running') return { started: false, reason: 'already-running' }
  if (isEodhdDailyLimitExceeded()) return { started: false, reason: 'eodhd-limit' }

  const existing = await readMarketSnapshotLightMeta()
  if (!existing) return { started: false, reason: 'no-snapshot' }
  const failed = Number(existing.failed ?? 0)
  if (failed <= AUTO_RETRY_FAILED_THRESHOLD) {
    return { started: false, reason: 'below-threshold', failed }
  }

  const interval = AUTO_RETRY_INTERVAL_MS()
  if (Date.now() - lastAutoRetryAt < interval) {
    return {
      started: false,
      reason: 'cooldown',
      failed,
      nextInMs: interval - (Date.now() - lastAutoRetryAt),
    }
  }

  lastAutoRetryAt = Date.now()
  console.log(
    `[snapshot] auto-retry: ${failed} failed > ${AUTO_RETRY_FAILED_THRESHOLD} — starting missing-only pass`,
  )
  void runRetryFailedSnapshot({ autoRetry: true }).catch((err) => {
    console.error(
      '[snapshot] auto-retry error:',
      err instanceof Error ? err.message : String(err),
    )
  })
  return { started: true, failed }
}

/**
 * Desk refresh: force-pull ASX200 + mid + small (+ breadth indices) from EODHD.
 * Supersedes any in-flight job so Refresh/Retry cannot stay stuck forever.
 * Kept name for API compatibility; covers all breadth universes.
 */
export async function runAsx200ForceRefresh() {
  await recoverStaleSnapshotJob()
  if (runningJob) {
    jobEpoch += 1
    runningJob = null
    console.warn('[snapshot] superseding in-flight job for desk universe force refresh')
  }

  const myEpoch = jobEpoch
  lastJobTrigger = 'manual'
  runningJob = (async () => {
    const universe = loadUniverse()
    const total = universe.length
    const asx200 = loadUniverseSlice('asx200')
    const mid = loadUniverseSlice('mid')
    const small = loadUniverseSlice('small')
    const phases = [
      { id: 'asx200', label: 'ASX200', tickers: asx200 },
      { id: 'mid', label: 'Mid', tickers: mid },
      { id: 'small', label: 'Small', tickers: small },
    ]
    const priorityTickers = loadDeskBreadthTickers()
    const started = Date.now()
    const from2y = from2yIso()
    const from5y = from5yIso()
    const existing = await readMarketSnapshotDbRow()
    const stocks = { ...(existing?.stocks || {}) }
    const pacing = snapshotFetchPacing()

    await setJob('running', {
      started_at: started,
      finished_at: null,
      message: `Force-refreshing ASX200+mid+small (${priorityTickers.length} names)`,
      loaded: Object.keys(stocks).length,
      failed: Math.max(0, total - Object.keys(stocks).length),
      total,
    })

    try {
      // Bench + breadth chart indices
      const indexPerf = await loadIndexPerf(from5y, { forceRefresh: true, staleOk: false })
      for (const idx of ['^AORD', '^AXSO']) {
        if (myEpoch !== jobEpoch) break
        await loadSeriesForSnapshot(idx, from5y, true)
      }

      const failedTickers = []
      let doneAll = 0

      for (const phase of phases) {
        if (myEpoch !== jobEpoch) return { aborted: true }
        await mapPool(
          phase.tickers,
          pacing.concurrency,
          async (ticker) => {
            if (myEpoch !== jobEpoch) return ticker
            const series = await loadSeriesForSnapshot(ticker, from2y, true)
            applySeriesToStocks(ticker, series, indexPerf.m3, stocks, failedTickers)
            return ticker
          },
          async (done) => {
            if (myEpoch !== jobEpoch) return
            doneAll = phases
              .slice(0, phases.findIndex((p) => p.id === phase.id))
              .reduce((n, p) => n + p.tickers.length, 0) + done
            if (done % 20 === 0 || done === phase.tickers.length) {
              const loaded = Object.keys(stocks).length
              await setJob('running', {
                started_at: started,
                message: `${phase.label} ${done}/${phase.tickers.length} · ${doneAll}/${priorityTickers.length}`,
                loaded,
                failed: total - loaded,
                total,
              })
              if (done % 40 === 0 || done === phase.tickers.length) {
                await persistSnapshot(stocks, indexPerf, loaded, total - loaded)
              }
            }
          },
          pacing.delayMs,
        )

        if (phase.id === 'asx200') {
          const loaded = Object.keys(stocks).length
          await persistSnapshot(stocks, indexPerf, loaded, total - loaded)
          await setJob('running', {
            started_at: started,
            message: `asx200-ready · continuing mid/small`,
            loaded,
            failed: total - loaded,
            total,
          })
          try {
            const { maybeStartDeskPatternJob } = await import('./patternJob.mjs')
            maybeStartDeskPatternJob({
              stocks,
              indexM3: indexPerf.m3,
              universe: 'asx200',
            })
          } catch {
            /* non-fatal */
          }
        }
      }

      if (myEpoch !== jobEpoch) return { aborted: true }

      // Salvage: use any cached history for names EODHD skipped / 404'd this pass.
      if (failedTickers.length > 0) {
        const salvage = [...failedTickers]
        failedTickers.length = 0
        for (const ticker of salvage) {
          if (myEpoch !== jobEpoch) break
          if (stocks[ticker]) continue
          const series = await getCachedSeries(ticker, from2y, { staleOk: true })
          applySeriesToStocks(ticker, series, indexPerf.m3, stocks, failedTickers)
        }
      }

      const loaded = Object.keys(stocks).length
      const failed = total - loaded
      const { builtAt, asOf } = await persistSnapshot(stocks, indexPerf, loaded, failed)

      // Pull delayed live quotes onto Markets Price (works after hours too).
      try {
        const { runLiveQuoteRefresh } = await import('./liveQuoteJob.mjs')
        await runLiveQuoteRefresh({ force: true, tickers: asx200 })
      } catch (err) {
        console.warn(
          '[snapshot] live quote refresh after desk pull failed:',
          err instanceof Error ? err.message : String(err),
        )
      }

      await setJob('done', {
        started_at: started,
        finished_at: builtAt,
        message:
          failedTickers.length > 0
            ? `desk-ready · ${failedTickers.length} names failed`
            : 'desk-ready · ASX200+mid+small refreshed from EODHD',
        loaded,
        failed,
        total,
      })
      try {
        const { maybeStartFullUniversePatternJob } = await import('./patternJob.mjs')
        maybeStartFullUniversePatternJob({
          stocks,
          indexM3: indexPerf.m3,
        })
      } catch {
        /* non-fatal */
      }
      try {
        const { maybeAlertSnapshotFailures } = await import('./observability.mjs')
        maybeAlertSnapshotFailures(failed, total)
      } catch {
        /* optional */
      }
      console.log(
        `[snapshot] desk force refresh · updated=${priorityTickers.length - failedTickers.length}/${priorityTickers.length} · snapshot loaded=${loaded}`,
      )

      return { loaded, failed, builtAt, asOf, priority: 'desk', failedTickers }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await setJob('error', {
        started_at: started,
        finished_at: Date.now(),
        message,
        loaded: Object.keys(stocks).length,
        failed: total - Object.keys(stocks).length,
        total,
      })
      throw err
    } finally {
      if (myEpoch === jobEpoch) {
        runningJob = null
        lastJobTrigger = null
      }
    }
  })()

  return runningJob
}

/**
 * Kick a background refresh if snapshot is missing/stale/incomplete.
 * Safe to call from meta polls: debounced, uses light meta only (never parses
 * stocks_perf), and full universe rebuild is opt-in via SNAPSHOT_AUTO_BACKGROUND
 * (or SNAPSHOT_BACKGROUND_ON_BOOT). Meta polls previously melted Azure by
 * parsing the giant snapshot blob and starting rebuilds on every page load.
 */
export async function maybeStartBackgroundSnapshot() {
  const now = Date.now()
  if (runningJob) return
  if (now - lastMaybeBackgroundAt < MAYBE_BACKGROUND_DEBOUNCE_MS) return
  lastMaybeBackgroundAt = now

  try {
    await recoverStaleSnapshotJob()
  } catch {
    /* ignore — never block callers */
  }
  if (runningJob) return

  let job
  try {
    job = await peekSnapshotJobStatus()
  } catch {
    return
  }
  if (job.status === 'running') return

  let existing
  try {
    existing = await readMarketSnapshotLightMeta()
  } catch {
    return
  }

  // Prefer a clear auto-retry of missing names when failure count is very high.
  const failed = Number(existing?.failed ?? 0)
  if (existing && failed > AUTO_RETRY_FAILED_THRESHOLD && autoRetryEnabled()) {
    void maybeAutoRetryHighFailures().catch(() => {})
    return
  }

  if (existing && (await snapshotLooksCurrent(existing))) return

  if (!snapshotAutoBackgroundEnabled()) {
    if (!existing) {
      console.log(
        '[snapshot] no snapshot yet — auto background disabled (set SNAPSHOT_AUTO_BACKGROUND=1 or use admin Refresh)',
      )
    }
    return
  }

  console.log('[snapshot] starting background universe build…')
  lastJobTrigger = 'manual'
  void runUniverseSnapshot({ force: false }).catch(() => {})
}
