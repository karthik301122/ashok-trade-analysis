import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { fetchEodhdLiveQuotes, eodhdEnabled } from './eodhd.mjs'
import { resolveYahooSymbol } from './getSeries.mjs'
import { isAsxMarketSession, upsertLiveQuotesFromEodhd } from './liveQuotes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const universePath = path.join(root, 'src', 'data', 'asxUniverse.json')

/** @type {Promise<unknown> | null} */
let runningJob = null

function loadTickers() {
  const universe = JSON.parse(fs.readFileSync(universePath, 'utf8'))
  return universe.map((u) => u.ticker)
}

export async function runLiveQuoteRefresh() {
  if (!eodhdEnabled()) return { skipped: true, reason: 'eodhd_disabled' }
  if (!isAsxMarketSession()) return { skipped: true, reason: 'market_closed' }
  if (runningJob) return runningJob

  runningJob = (async () => {
    const tickers = loadTickers()
    const yahooSymbols = tickers.map((t) => resolveYahooSymbol(t))
    const started = Date.now()
    const quotes = await fetchEodhdLiveQuotes(yahooSymbols)
    const updated = await upsertLiveQuotesFromEodhd(quotes)
    const ms = Date.now() - started
    console.log(`[live] quotes updated=${updated} fetched=${quotes.length} in ${Math.round(ms / 1000)}s`)
    return { updated, fetched: quotes.length, ms }
  })().finally(() => {
    runningJob = null
  })

  return runningJob
}

/** Poll EODHD live (delayed) quotes during ASX session. */
export function maybeStartLiveQuoteScheduler() {
  if (!eodhdEnabled()) return
  const intervalMs = Number(process.env.LIVE_QUOTE_INTERVAL_MS) || 15 * 60 * 1000
  const tick = () => {
    void runLiveQuoteRefresh().catch((err) => {
      console.warn('[live] refresh error:', err instanceof Error ? err.message : err)
    })
  }
  setInterval(tick, intervalMs)
  setTimeout(tick, 60_000)
  console.log(`[live] scheduler every ${Math.round(intervalMs / 60000)} min during ASX session`)
}
