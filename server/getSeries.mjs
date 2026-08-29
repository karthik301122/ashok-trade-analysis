import { fetchChartCloses, fetchIntradayCloses, isIntradayInterval } from './fetchSeries.mjs'
import { seriesSymbolCount } from './db.mjs'
import {
  readSeriesCache,
  writeSeriesCache,
  mergeBars,
  recomputeHigh52,
  isSeriesFresh,
  isoFromUnix,
  isoMinusDays,
} from './seriesStore.mjs'

/**
 * @param {string} ticker
 */
export function resolveYahooSymbol(ticker) {
  const t = String(ticker).toUpperCase()
  if (t === '^AXJO' || t === 'XJO' || t === 'ASX200') return '^AXJO'
  if (t.includes('=') || t.includes('-') || t.includes('.')) return t
  return `${t}.AX`
}

/**
 * Fetch series with SQLite cache + incremental provider refresh (EODHD / Yahoo).
 * @param {string} ticker
 * @param {string} from ISO date
 * @param {{ forceRefresh?: boolean }} [opts]
 */
export async function getCachedSeries(ticker, from = '2023-01-01', opts = {}) {
  const yahooSymbol = resolveYahooSymbol(ticker)
  const forceRefresh = Boolean(opts.forceRefresh)
  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)

  const cached = forceRefresh ? null : readSeriesCache(yahooSymbol)

  if (cached && isSeriesFresh(cached.updatedAt)) {
    const closes = cached.closes.filter((b) => b.t >= fromTs)
    if (closes.length >= 15) {
      return {
        symbol: cached.symbol,
        closes,
        last: closes[closes.length - 1].c,
        high52: recomputeHigh52(closes),
        meta: { ...(cached.meta || {}), cache: 'hit', store: 'sqlite' },
      }
    }
  }

  let period1 = from
  if (cached?.closes?.length) {
    const lastT = cached.closes[cached.closes.length - 1].t
    const overlap = isoMinusDays(isoFromUnix(lastT), 7)
    period1 = overlap > from ? overlap : from
  }

  const fresh = await fetchChartCloses(yahooSymbol, period1, {
    attempts: opts.forceRefresh ? 4 : 3,
    baseDelayMs: opts.forceRefresh ? 600 : 400,
  })
  if (!fresh && cached?.closes?.length) {
    const closes = cached.closes.filter((b) => b.t >= fromTs)
    if (closes.length >= 15) {
      return {
        symbol: cached.symbol,
        closes,
        last: closes[closes.length - 1].c,
        high52: recomputeHigh52(closes),
        meta: { ...(cached.meta || {}), cache: 'stale-fallback', store: 'sqlite' },
      }
    }
    return null
  }
  if (!fresh) return null

  const merged = cached?.closes?.length ? mergeBars(cached.closes, fresh.closes) : fresh.closes
  const payload = {
    symbol: fresh.symbol,
    updatedAt: Date.now(),
    closes: merged,
    last: merged[merged.length - 1].c,
    high52: recomputeHigh52(merged),
    meta: fresh.meta || {},
  }
  writeSeriesCache(payload)

  const closes = merged.filter((b) => b.t >= fromTs)
  return {
    symbol: payload.symbol,
    closes,
    last: closes.length ? closes[closes.length - 1].c : payload.last,
    high52: recomputeHigh52(closes.length ? closes : merged),
    meta: { ...payload.meta, cache: cached ? 'refresh' : 'miss', store: 'sqlite' },
  }
}

export function seriesCacheFileCount() {
  return seriesSymbolCount()
}

/**
 * Live intraday series for desk charts (not persisted in SQLite).
 * @param {string} ticker
 * @param {string} interval
 * @param {number} fromTs
 * @param {number} toTs
 */
export async function getIntradaySeries(ticker, interval, fromTs, toTs) {
  if (!isIntradayInterval(interval)) return null
  const yahooSymbol = resolveYahooSymbol(ticker)
  const data = await fetchIntradayCloses(yahooSymbol, interval, fromTs, toTs)
  if (!data?.closes?.length) return null
  return {
    symbol: data.symbol,
    closes: data.closes,
    last: data.last,
    high52: data.high52,
    meta: {
      ...(data.meta || {}),
      cache: 'intraday-live',
      store: 'none',
    },
  }
}
