import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { getDb } from './db.mjs'
import { getCachedSeries } from './getSeries.mjs'
import { seriesToCachedPerf, mapPool } from './perfMath.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')

export const SNAPSHOT_FRESH_MS = 12 * 60 * 60 * 1000
const RETRY_COOLDOWN_MS = 30_000

/** @type {Promise<unknown> | null} */
let runningJob = null

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
    stocks: JSON.parse(row.stocks_perf_json),
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

  return { builtAt, asOf }
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
    2,
    async (ticker) => {
      const series = await getCachedSeries(ticker, from2y, { forceRefresh: true })
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
    80,
  )

  return stillFailed
}

/**
 * Build full-universe CachedPerf map into SQLite.
 * @param {{ force?: boolean, concurrency?: number, retryFailed?: boolean, skipRetryPass?: boolean }} [opts]
 */
export async function runUniverseSnapshot(opts = {}) {
  if (runningJob) return runningJob

  const force = Boolean(opts.force)
  const retryFailedOnly = Boolean(opts.retryFailed)
  const skipRetryPass = Boolean(opts.skipRetryPass)
  const concurrency = Number(opts.concurrency) || 4
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
      message: retryFailedOnly ? 'Retrying failed tickers' : 'Fetching Yahoo via SQLite cache',
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
            const series = await getCachedSeries(ticker, from2y, { forceRefresh: force })
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
            }
          },
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

/** Retry only tickers missing from the last snapshot (slower, force refresh). */
export function runRetryFailedSnapshot() {
  return runUniverseSnapshot({ retryFailed: true })
}

/** Kick a background refresh if snapshot is missing/stale. */
export function maybeStartBackgroundSnapshot() {
  const existing = readMarketSnapshotRow()
  if (existing && isSnapshotFresh(existing.builtAt)) return
  if (runningJob) return
  console.log('[snapshot] starting background universe build…')
  void runUniverseSnapshot({ force: false }).catch(() => {})
}
