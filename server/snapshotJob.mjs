import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sqlOne, sqlRun } from './db.mjs'
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

/** Clock window only — also require last AXJO bar current before skipping rebuilds. */
export const SNAPSHOT_FRESH_MS = 4 * 60 * 60 * 1000
const RETRY_COOLDOWN_MS = 30_000
/** Abandon in-process / orphaned jobs older than this so Refresh is never permanently stuck. */
const JOB_MAX_AGE_MS = () => {
  const n = Number(process.env.SNAPSHOT_JOB_MAX_AGE_MS)
  return Number.isFinite(n) && n > 0 ? n : 40 * 60 * 1000
}

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
  const existing = await readMarketSnapshotDbRow()
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
  const row = await sqlOne('SELECT * FROM snapshot_job WHERE id = 1')
  if (!row) return { status: 'idle' }
  return {
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    message: row.message,
    loaded: row.loaded,
    failed: row.failed,
    total: row.total,
  }
}

export async function readMarketSnapshotDbRow() {
  const row = await sqlOne('SELECT * FROM market_snapshot WHERE id = 1')
  if (!row) return null
  return {
    builtAt: Number(row.built_at),
    asOf: row.as_of,
    loaded: Number(row.loaded),
    failed: Number(row.failed),
    indexPerf: JSON.parse(row.index_perf_json),
    stocks: JSON.parse(row.stocks_perf_json),
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

function loadStocksPerfMap(builtAt, stocksJson) {
  if (stocksPerfCache && stocksPerfBuiltAt === builtAt) return stocksPerfCache
  stocksPerfCache = JSON.parse(stocksJson)
  stocksPerfBuiltAt = builtAt
  return stocksPerfCache
}

export function clearStocksPerfCache() {
  stocksPerfCache = null
  stocksPerfBuiltAt = 0
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

/**
 * Align Markets overview lastPrice with the latest bar close (same value charts use).
 * Prefer bars over series_meta.last — meta can lag behind the bars table.
 * When both JNS.AX and JNS.AU exist, keep the bar with the latest session timestamp.
 */
export async function syncSnapshotPricesFromSeriesMeta(opts = {}) {
  const force = Boolean(opts.force)
  const now = Date.now()
  if (!force && now - lastPriceSyncAt < PRICE_SYNC_MIN_MS) {
    return { skipped: true, updated: 0 }
  }
  lastPriceSyncAt = now

  try {
    const row = await sqlOne('SELECT stocks_perf_json FROM market_snapshot WHERE id = 1')
    if (!row?.stocks_perf_json) return { updated: 0 }
    const stocks = JSON.parse(row.stocks_perf_json)

    const lastBars = await sqlAll(
      `SELECT b.symbol, b.c AS last, b.t AS t
       FROM bars b
       INNER JOIN (
         SELECT symbol, MAX(t) AS maxt FROM bars GROUP BY symbol
       ) x ON b.symbol = x.symbol AND b.t = x.maxt
       WHERE b.c > 0`,
    )
    if (!lastBars?.length) return { updated: 0 }

    /** @type {Map<string, { last: number, t: number }>} */
    const byTicker = new Map()
    for (const bar of lastBars) {
      const ticker = appTickerFromBarSymbol(bar.symbol)
      if (!ticker) continue
      const last = Number(bar.last)
      const t = Number(bar.t)
      if (!Number.isFinite(last) || last <= 0 || !Number.isFinite(t)) continue
      const prev = byTicker.get(ticker)
      if (!prev || t >= prev.t) byTicker.set(ticker, { last, t })
    }

    let updated = 0
    for (const [ticker, { last }] of byTicker) {
      const perf = stocks[ticker]
      if (!perf || typeof perf !== 'object') continue
      const next = Math.round(last * 10000) / 10000
      if (Number(perf.lastPrice) === next) continue
      stocks[ticker] = { ...perf, lastPrice: next }
      updated++
    }

    if (updated === 0) return { updated: 0 }

    await sqlRun('UPDATE market_snapshot SET stocks_perf_json = ? WHERE id = 1', [
      JSON.stringify(stocks),
    ])
    clearStocksPerfCache()
    console.log(`[snapshot] synced ${updated} lastPrices from bars`)
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
 * Lightweight ticker → last close from bars (for client overlay; matches chart last).
 * @returns {Promise<Record<string, number>>}
 */
export async function readLastPricesFromBars() {
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
  /** @type {Record<string, number>} */
  const out = {}
  for (const [ticker, { last }] of byTicker) {
    out[ticker] = Math.round(last * 10000) / 10000
  }
  return out
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

/** Fast metadata without parsing the large stocks JSON column. */
export async function readMarketSnapshotMeta() {
  const row = await sqlOne(
    'SELECT built_at, as_of, loaded, failed, index_perf_json FROM market_snapshot WHERE id = 1',
  )
  if (!row) return null
  const builtAt = Number(row.built_at)
  const barsAsOf = await readBarsAsOf()
  const barsCurrent = await isSnapshotBarsCurrent()
  return {
    builtAt,
    asOf: row.as_of,
    barsAsOf: barsAsOf?.iso ?? null,
    barsAsOfLabel: barsAsOf?.label ?? null,
    loaded: Number(row.loaded),
    failed: Number(row.failed),
    fresh: isSnapshotFresh(builtAt) && barsCurrent,
    indexPerf: JSON.parse(row.index_perf_json),
    store: dbStoreLabel(),
    liveQuotes: await getLiveQuotesMeta(),
  }
}

/** Paginated stock perfs for browsers that cannot download one giant /api/snapshot payload. */
export async function readMarketSnapshotStocksChunk(offset, limit) {
  const row = await sqlOne('SELECT built_at, stocks_perf_json FROM market_snapshot WHERE id = 1')
  if (!row) return null
  const builtAt = Number(row.built_at)
  const map = loadStocksPerfMap(builtAt, row.stocks_perf_json)
  const keys = Object.keys(map)
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
  // Prefer cached bars, but re-pull from EODHD when the last bar is multi-day stale.
  return getCachedSeries(ticker, from2y, { staleOk: false })
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
  await setJob('running', {
    started_at: started,
    message: `Cooldown before retry (${tickers.length} tickers)`,
    loaded: Object.keys(stocks).length,
    failed: totalUniverse - Object.keys(stocks).length,
    total: totalUniverse,
  })
  await sleep(RETRY_COOLDOWN_MS)

  const stillFailed = []

  await mapPool(
    tickers,
    eodhdEnabled() ? 1 : 2,
    async (ticker) => {
      const series = await loadSeriesForSnapshot(ticker, from2y, true)
      if (series?.closes?.length) {
        stocks[ticker] = seriesToCachedPerf(series, indexPerf.m3)
      } else {
        stillFailed.push(ticker)
      }
      return ticker
    },
    async (done) => {
      const loaded = Object.keys(stocks).length
      if (done % 25 === 0 || done === tickers.length) {
        await setJob('running', {
          started_at: started,
          message: `Retrying ${done}/${tickers.length}`,
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
    concurrency: Number.isFinite(concurrency) && concurrency > 0 ? concurrency : 1,
    delayMs: Number.isFinite(delayMs) && delayMs >= 0 ? delayMs : 250,
  }
}

/**
 * Build full-universe CachedPerf map into SQLite.
 * @param {{ force?: boolean, concurrency?: number, retryFailed?: boolean, skipRetryPass?: boolean }} [opts]
 */
export async function runUniverseSnapshot(opts = {}) {
  await recoverStaleSnapshotJob()
  if (runningJob) return runningJob

  const force = Boolean(opts.force)
  const retryFailedOnly = Boolean(opts.retryFailed)
  const skipRetryPass = Boolean(opts.skipRetryPass)
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

  runningJob = (async () => {
    const universe = loadUniverse()
    const allTickers = universe.map((u) => u.ticker)
    const total = allTickers.length
    const started = Date.now()
    const from2y = from2yIso()
    const from5y = from5yIso()

    await setJob('running', {
      started_at: started,
      finished_at: null,
      message: resumingIncomplete
        ? 'Resuming interrupted universe build'
        : retryFailedOnly
          ? 'Retrying failed tickers'
          : 'Fetching market data via SQLite cache',
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
            if (series?.closes?.length) {
              stocks[ticker] = seriesToCachedPerf(series, indexPerf.m3)
            } else {
              failedTickers.push(ticker)
            }
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
export function runRetryFailedSnapshot() {
  return runUniverseSnapshot({ retryFailed: true })
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
            if (series?.closes?.length) {
              stocks[ticker] = seriesToCachedPerf(series, indexPerf.m3)
            } else {
              failedTickers.push(ticker)
            }
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
        }
      }

      if (myEpoch !== jobEpoch) return { aborted: true }

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
      if (myEpoch === jobEpoch) runningJob = null
    }
  })()

  return runningJob
}

/** Kick a background refresh if snapshot is missing/stale/incomplete. */
export async function maybeStartBackgroundSnapshot() {
  await recoverStaleSnapshotJob()
  if (runningJob) return
  const job = await getSnapshotJobStatus()
  if (job.status === 'running') return

  const existing = await readMarketSnapshotDbRow()
  if (await snapshotLooksCurrent(existing)) return

  console.log('[snapshot] starting background universe build…')
  void runUniverseSnapshot({ force: false }).catch(() => {})
}
