import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchEodhdLiveQuotes, eodhdEnabled } from './eodhd.mjs'
import { isEodhdDailyLimitExceeded } from './eodhdLimit.mjs'
import { resolveYahooSymbol } from './getSeries.mjs'
import { isAsxMarketSession, upsertLiveQuotesFromEodhd } from './liveQuotes.mjs'
import { maintenanceEnabled } from './maintenance.mjs'
import { getSnapshotJobStatus, readMarketSnapshotDbRow } from './snapshotJob.mjs'
import { isProductionMode, readinessFromSnapshot } from './production.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')

/** @type {Promise<unknown> | null} */
let runningJob = null

function loadUniverseTickers() {
  const universe = JSON.parse(fs.readFileSync(universePath, 'utf8'))
  return universe.map((u) => u.ticker)
}

function universeTotal() {
  return loadUniverseTickers().length
}

/** Only poll tickers already in the snapshot — avoids 2570 calls when desk is partial. */
async function loadLiveQuoteTickers() {
  const snap = await readMarketSnapshotDbRow()
  if (snap?.stocks) {
    const keys = Object.keys(snap.stocks)
    if (keys.length > 0) return keys
  }
  return loadUniverseTickers()
}

function liveQuoteIntervalMs() {
  const n = Number(process.env.LIVE_QUOTE_INTERVAL_MS)
  if (Number.isFinite(n) && n > 0) return n
  return isProductionMode() ? 30 * 60 * 1000 : 15 * 60 * 1000
}

export async function runLiveQuoteRefresh() {
  if (!eodhdEnabled()) return { skipped: true, reason: 'eodhd_disabled' }
  if (isEodhdDailyLimitExceeded()) return { skipped: true, reason: 'eodhd_daily_limit' }
  if (maintenanceEnabled()) return { skipped: true, reason: 'maintenance' }
  const snapJob = await getSnapshotJobStatus()
  if (snapJob.status === 'running') return { skipped: true, reason: 'snapshot_build' }

  const snap = await readMarketSnapshotDbRow()
  const readiness = readinessFromSnapshot(
    snap ? { loaded: snap.loaded, failed: snap.failed, fresh: true } : null,
    universeTotal(),
  )
  if (!readiness.snapshotAcceptable) return { skipped: true, reason: 'snapshot_not_ready' }

  if (!isAsxMarketSession()) return { skipped: true, reason: 'market_closed' }
  if (runningJob) return runningJob

  runningJob = (async () => {
    const tickers = await loadLiveQuoteTickers()
    const yahooSymbols = tickers.map((t) => resolveYahooSymbol(t))
    const started = Date.now()
    console.log(
      `[live] refresh · ${tickers.length} tickers (~${tickers.length} API calls)`,
    )
    const quotes = await fetchEodhdLiveQuotes(yahooSymbols)
    const updated = await upsertLiveQuotesFromEodhd(quotes)
    const ms = Date.now() - started
    console.log(
      `[live] quotes updated=${updated} fetched=${quotes.length} in ${Math.round(ms / 1000)}s`,
    )
    return { updated, fetched: quotes.length, ms, tickers: tickers.length }
  })().finally(() => {
    runningJob = null
  })

  return runningJob
}

/** Poll EODHD live (delayed) quotes during ASX session. */
export function maybeStartLiveQuoteScheduler() {
  if (!eodhdEnabled()) return
  const intervalMs = liveQuoteIntervalMs()
  const tick = () => {
    void runLiveQuoteRefresh().catch((err) => {
      console.warn('[live] refresh error:', err instanceof Error ? err.message : err)
    })
  }
  setInterval(tick, intervalMs)
  // Defer first tick — let snapshot builds claim quota first after startup.
  setTimeout(tick, 5 * 60_000)
  console.log(
    `[live] scheduler every ${Math.round(intervalMs / 60000)} min during ASX session (after snapshot ready)`,
  )
}
