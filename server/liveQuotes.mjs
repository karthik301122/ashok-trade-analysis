import { getDb } from './db.mjs'
import { eodhdCodeToAppTicker } from './eodhd.mjs'

export const LIVE_QUOTE_FRESH_MS = 25 * 60 * 1000

function round1(n) {
  return Math.round(n * 10) / 10
}

/** Sydney session Mon–Fri 10:00–16:30 (approx ASX cash). */
export function isAsxMarketSession(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date(now))
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? ''
  if (weekday === 'Sat' || weekday === 'Sun') return false
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0)
  const mins = hour * 60 + minute
  return mins >= 10 * 60 && mins <= 16 * 60 + 30
}

export function getLiveQuotesMeta(now = Date.now()) {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS updated_at FROM live_quotes')
    .get()
  const count = Number(row?.n) || 0
  const updatedAt = Number(row?.updated_at) || 0
  const fresh = count > 0 && updatedAt > 0 && now - updatedAt < LIVE_QUOTE_FRESH_MS
  return {
    count,
    updatedAt,
    fresh,
    marketOpen: isAsxMarketSession(now),
    delayedMinutes: 15,
  }
}

/** @returns {Map<string, { close: number, change_p: number, volume: number, updated_at: number }>} */
export function readLiveQuotesMap(now = Date.now()) {
  const meta = getLiveQuotesMeta(now)
  if (!meta.fresh) return new Map()
  const rows = getDb()
    .prepare('SELECT ticker, close, change_p, volume, updated_at FROM live_quotes')
    .all()
  const map = new Map()
  for (const row of rows) {
    const close = Number(row.close)
    if (!row.ticker || !Number.isFinite(close) || close <= 0) continue
    map.set(row.ticker, {
      close,
      change_p: Number(row.change_p) || 0,
      volume: Number(row.volume) || 0,
      updated_at: Number(row.updated_at) || 0,
    })
  }
  return map
}

/**
 * @param {Array<{ code: string, close: number, change_p?: number, volume?: number, timestamp?: number }>} quotes
 */
export function upsertLiveQuotesFromEodhd(quotes) {
  const db = getDb()
  const stmt = db.prepare(
    `INSERT INTO live_quotes (ticker, close, change_p, volume, quote_ts, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(ticker) DO UPDATE SET
       close = excluded.close,
       change_p = excluded.change_p,
       volume = excluded.volume,
       quote_ts = excluded.quote_ts,
       updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  let n = 0
  for (const q of quotes) {
    const ticker = eodhdCodeToAppTicker(q.code)
    const close = Number(q.close)
    if (!ticker || !Number.isFinite(close) || close <= 0) continue
    const quoteTs = Number(q.timestamp) || 0
    stmt.run(
      ticker,
      close,
      Number.isFinite(Number(q.change_p)) ? Number(q.change_p) : null,
      Number.isFinite(Number(q.volume)) ? Math.round(Number(q.volume)) : null,
      quoteTs > 0 ? quoteTs : null,
      now,
    )
    n++
  }
  return n
}

/** Overlay delayed live quote onto cached EOD perf for desk display. */
export function applyLiveToCachedPerf(perf, live) {
  if (!perf || !live) return perf
  const close = Number(live.close)
  if (!Number.isFinite(close) || close <= 0) return perf
  const vol = Number.isFinite(live.volume) && live.volume > 0 ? Math.round(live.volume) : perf.volume
  const avgVol = perf.avgVolume20 ?? 0
  const relVol = avgVol > 0 && vol > 0 ? vol / avgVol : perf.relativeVolume
  return {
    ...perf,
    lastPrice: round1(close),
    d1: Number.isFinite(live.change_p) ? round1(live.change_p) : perf.d1,
    volume: vol,
    relativeVolume: round1(relVol ?? 0),
    dollarVolume: Math.round(vol * close),
    liveAt: live.updated_at,
  }
}

/** Remove session overlay fields before persisting EOD snapshot to SQLite. */
export function stripLiveOverlayFromPerf(perf) {
  if (!perf || typeof perf !== 'object') return perf
  const { liveAt: _liveAt, ...rest } = perf
  return rest
}

/** @param {Record<string, object>} stocks */
export function applyLiveQuotesToStockMap(stocks, now = Date.now()) {
  const liveMap = readLiveQuotesMap(now)
  if (!liveMap.size) return stocks
  for (const [ticker, perf] of Object.entries(stocks)) {
    const live = liveMap.get(ticker)
    if (live) stocks[ticker] = applyLiveToCachedPerf(perf, live)
  }
  return stocks
}
