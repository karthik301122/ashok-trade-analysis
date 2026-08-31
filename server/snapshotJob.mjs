import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from './db.mjs'
import { getCachedSeries } from './getSeries.mjs'
import { eodhdEnabled } from './eodhd.mjs'
import { seriesToCachedPerf, mapPool } from './perfMath.mjs'
import { applyLiveQuotesToStockMap, getLiveQuotesMeta } from './liveQuotes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')

export const SNAPSHOT_FRESH_MS = 12 * 60 * 60 * 1000
const RETRY_COOLDOWN_MS = 30_000

/** @type {Promise<unknown> | null} */
let runningJob = null

/** If the DB says "running" but this process has no job, a restart interrupted the build. */
export function recoverStaleSnapshotJob() {
  if (runningJob) return false
  const row = getDb().prepare('SELECT * FROM snapshot_job WHERE id = 1').get()
  if (!row || row.status !== 'running') return false
  setJob('error', {
    started_at: row.started_at,
    finished_at: Date.now(),
    message: 'Interrupted (server restart) — tap Refresh to rebuild',
    loaded: row.loaded,
    failed: row.failed,
    total: row.total,
  })
  console.warn('[snapshot] cleared stale running job from previous process')
  return true
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadUniverse() {
  return JSON.parse(fs.readFileSync(universePath, 'utf8'))
}

function setJob(status, fields = {}) {
  const db = getDb()
  db.prepare(
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
  ).run(
    status,
    fields.started_at ?? null,
    fields.finished_at ?? null,
    fields.message ?? null,
    fields.loaded ?? 0,
    fields.failed ?? 0,
    fields.total ?? 0,
  )
}

export function getSnapshotJobStatus() {
  recoverStaleSnapshotJob()
  const row = getDb().prepare('SELECT * FROM snapshot_job WHERE id = 1').get()
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

export function readMarketSnapshotRow() {
  const row = getDb().prepare('SELECT * FROM market_snapshot WHERE id = 1').get()
  if (!row) return null
  return {
    builtAt: Number(row.built_at),
    asOf: row.as_of,
    loaded: Number(row.loaded),
    failed: Number(row.failed),
    indexPerf: JSON.parse(row.index_perf_json),
    stocks: applyLiveQuotesToStockMap(JSON.parse(row.stocks_perf_json)),
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

/** Fast metadata without parsing the large stocks JSON column. */
export function readMarketSnapshotMeta() {
  const row = getDb()
    .prepare(
      'SELECT built_at, as_of, loaded, failed, index_perf_json FROM market_snapshot WHERE id = 1',
    )
    .get()
  if (!row) return null
  const builtAt = Number(row.built_at)
  return {
    builtAt,
    asOf: row.as_of,
    loaded: Number(row.loaded),
    failed: Number(row.failed),
    fresh: isSnapshotFresh(builtAt),
    indexPerf: JSON.parse(row.index_perf_json),
    store: 'sqlite',
    liveQuotes: getLiveQuotesMeta(),
  }
}

/** Paginated stock perfs for browsers that cannot download one giant /api/snapshot payload. */
export function readMarketSnapshotStocksChunk(offset, limit) {
  const row = getDb()
    .prepare('SELECT built_at, stocks_perf_json FROM market_snapshot WHERE id = 1')
    .get()
  if (!row) return null
  const builtAt = Number(row.built_at)
  const map = loadStocksPerfMap(builtAt, row.stocks_perf_json)
  const keys = Object.keys(map)
  const safeOffset = Math.max(0, Math.min(offset, keys.length))
  const safeLimit = Math.max(1, Math.min(limit, 800))
  const slice = keys.slice(safeOffset, safeOffset + safeLimit)
  const stocks = {}
  for (const k of slice) stocks[k] = map[k]
  applyLiveQuotesToStockMap(stocks)
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

function persistSnapshot(stocks, indexPerf, loaded, failed) {
  const builtAt = Date.now()
  const asOf = new Date().toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  getDb()
    .prepare(
      `INSERT INTO market_snapshot (id, built_at, as_of, loaded, failed, index_perf_json, stocks_perf_json)
       VALUES (1, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         built_at = excluded.built_at,
         as_of = excluded.as_of,
         loaded = excluded.loaded,
         failed = excluded.failed,
         index_perf_json = excluded.index_perf_json,
         stocks_perf_json = excluded.stocks_perf_json`,
    )
    .run(
      builtAt,
      asOf,
      loaded,
      failed,
      JSON.stringify(indexPerf),
      JSON.stringify(stocks),
    )

  clearStocksPerfCache()
  return { builtAt, asOf }
}

async function loadSeriesForSnapshot(ticker, from2y, forceRefresh = false) {
  let series = await getCachedSeries(ticker, from2y, { forceRefresh: false, staleOk: true })
  if (!series?.closes?.length && forceRefresh) {
    series = await getCachedSeries(ticker, from2y, { forceRefresh: true })
  }
  return series
}

/**
 * Pull tickers with slower pacing + force refresh (transient Yahoo throttling).
 */
async function retryFailedTickers(
  tickers,
  from2y,
  indexPerf,
  stocks,
  started,
  totalUniverse,
) {
  if (!tickers.length) return tickers

  console.log(`[snapshot] retry pass for ${tickers.length} tickers (cooldown ${RETRY_COOLDOWN_MS / 1000}s)…`)
  setJob('running', {
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
    (done) => {
      const loaded = Object.keys(stocks).length
      if (done % 25 === 0 || done === tickers.length) {
        setJob('running', {
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
  recoverStaleSnapshotJob()
  if (runningJob) return runningJob

  const force = Boolean(opts.force)
  const retryFailedOnly = Boolean(opts.retryFailed)
  const skipRetryPass = Boolean(opts.skipRetryPass)
  const pacing = snapshotFetchPacing()
  const concurrency = Number(opts.concurrency) || pacing.concurrency
  const poolDelayMs = pacing.delayMs
  const existing = readMarketSnapshotRow()

  if (!force && !retryFailedOnly && existing && isSnapshotFresh(existing.builtAt)) {
    return {
      loaded: existing.loaded,
      failed: existing.failed,
      skipped: true,
      builtAt: existing.builtAt,
    }
  }

  runningJob = (async () => {
    const universe = loadUniverse()
    const allTickers = universe.map((u) => u.ticker)
    const total = allTickers.length
    const started = Date.now()
    const from2y = from2yIso()
    const from5y = from5yIso()

    setJob('running', {
      started_at: started,
      finished_at: null,
      message: retryFailedOnly ? 'Retrying failed tickers' : 'Fetching market data via SQLite cache',
      loaded: existing?.loaded ?? 0,
      failed: existing?.failed ?? 0,
      total,
    })

    try {
      let indexPerf = existing?.indexPerf
      if (!indexPerf || force) {
        const indexSeries = await getCachedSeries('^AXJO', from5y, { forceRefresh: force })
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
        indexPerf = seriesToCachedPerf(indexSeries, indexM3)
      }

      const stocks = retryFailedOnly && existing?.stocks ? { ...existing.stocks } : {}
      const failedTickers = []

      const maybePersistPartial = (() => {
        let lastPersist = Object.keys(stocks).length
        return () => {
          const loaded = Object.keys(stocks).length
          if (loaded === 0 || loaded - lastPersist < 75) return
          lastPersist = loaded
          persistSnapshot(stocks, indexPerf, loaded, total - loaded)
        }
      })()

      if (indexPerf && Object.keys(stocks).length === 0 && !retryFailedOnly) {
        persistSnapshot(stocks, indexPerf, 0, total)
      }

      const tickersToFetch = retryFailedOnly
        ? allTickers.filter((t) => !stocks[t])
        : allTickers

      if (retryFailedOnly && tickersToFetch.length === 0) {
        setJob('done', {
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
          (done) => {
            if (done % 50 === 0 || done === tickersToFetch.length) {
              setJob('running', {
                started_at: started,
                message: `Fetching ${done}/${tickersToFetch.length}`,
                loaded: Object.keys(stocks).length,
                failed: total - Object.keys(stocks).length,
                total,
              })
              maybePersistPartial()
            }
          },
          poolDelayMs,
        )
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
      } else if (!skipRetryPass && failedTickers.length > 0) {
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
      const { builtAt, asOf } = persistSnapshot(stocks, indexPerf, loaded, failed)

      setJob('done', {
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
      setJob('error', {
        started_at: started,
        finished_at: Date.now(),
        message,
        loaded: 0,
        failed: 0,
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

/** Fast rebuild: populate snapshot from SQLite bars only (no EODHD). */
export function runRebuildSnapshotFromCache() {
  recoverStaleSnapshotJob()
  if (runningJob) return runningJob

  runningJob = (async () => {
    const universe = loadUniverse()
    const allTickers = universe.map((u) => u.ticker)
    const total = allTickers.length
    const started = Date.now()
    const from2y = from2yIso()
    const from5y = from5yIso()
    const existing = readMarketSnapshotRow()

    setJob('running', {
      started_at: started,
      finished_at: null,
      message: 'Scanning SQLite cache',
      loaded: 0,
      failed: 0,
      total,
    })

    try {
      let indexPerf = existing?.indexPerf
      if (!indexPerf) {
        const indexSeries = await getCachedSeries('^AXJO', from5y, { staleOk: true })
        if (!indexSeries?.closes?.length) {
          throw new Error('Could not load ASX200 (^AXJO) from cache')
        }
        const indexCloses = indexSeries.closes.map((b) => b.c)
        const indexM3 =
          indexCloses.length > 63
            ? ((indexCloses[indexCloses.length - 1] - indexCloses[indexCloses.length - 1 - 63]) /
                indexCloses[indexCloses.length - 1 - 63]) *
              100
            : 0
        indexPerf = seriesToCachedPerf(indexSeries, indexM3)
      }

      const stocks = {}
      for (let i = 0; i < allTickers.length; i++) {
        const ticker = allTickers[i]
        const series = await getCachedSeries(ticker, from2y, { staleOk: true })
        if (series?.closes?.length) {
          stocks[ticker] = seriesToCachedPerf(series, indexPerf.m3)
        }
        if (i % 200 === 0 || i === allTickers.length - 1) {
          const loaded = Object.keys(stocks).length
          setJob('running', {
            started_at: started,
            message: `Cache scan ${i + 1}/${total}`,
            loaded,
            failed: total - loaded,
            total,
          })
        }
      }

      const loaded = Object.keys(stocks).length
      const failed = total - loaded
      const { builtAt } = persistSnapshot(stocks, indexPerf, loaded, failed)
      setJob('done', {
        started_at: started,
        finished_at: builtAt,
        message: failed ? `ok · ${failed} not in cache` : 'ok · from cache',
        loaded,
        failed,
        total,
      })
      console.log(`[snapshot] cache rebuild · loaded=${loaded} failed=${failed} total=${total}`)
      return { loaded, failed, builtAt, skipped: false }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setJob('error', {
        started_at: started,
        finished_at: Date.now(),
        message,
        loaded: 0,
        failed: 0,
        total,
      })
      throw err
    } finally {
      runningJob = null
    }
  })()

  return runningJob
}

/** Retry only tickers missing from the last snapshot (slower, force refresh). */
export function runRetryFailedSnapshot() {
  return runUniverseSnapshot({ retryFailed: true })
}

/** Kick a background refresh if snapshot is missing/stale. */
export function maybeStartBackgroundSnapshot() {
  recoverStaleSnapshotJob()
  const existing = readMarketSnapshotRow()
  if (existing && isSnapshotFresh(existing.builtAt)) return
  if (runningJob) return
  console.log('[snapshot] starting background universe build…')
  void runUniverseSnapshot({ force: false }).catch(() => {})
}
