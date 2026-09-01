import { fetchChartCloses, fetchIntradayCloses, isIntradayInterval } from './fetchSeries.mjs'
import { seriesSymbolCount, dbStoreLabel } from './db.mjs'
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
  if (t === '^AORD' || t === 'AORD' || t === 'XAO' || t === 'AORD.INDX') return '^AORD'
  if (t === '^AXSO' || t === 'AXSO' || t === 'AXSO.INDX') return '^AXSO'
  if (t.includes('=') || t.includes('-') || t.includes('.')) return t
  return `${t}.AX`
}

/**
 * Fetch series with DB cache + incremental provider refresh (EODHD / Yahoo).
 * @param {string} ticker
 * @param {string} from ISO date
 * @param {{ forceRefresh?: boolean, staleOk?: boolean }} [opts]
 */
export async function getCachedSeries(ticker, from = '2023-01-01', opts = {}) {
  const yahooSymbol = resolveYahooSymbol(ticker)
  const forceRefresh = Boolean(opts.forceRefresh)
  const staleOk = Boolean(opts.staleOk)
  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)
  const store = dbStoreLabel()

  const cached = forceRefresh ? null : await readSeriesCache(yahooSymbol)

  if (cached && (staleOk || isSeriesFresh(cached.updatedAt))) {
    const closes = cached.closes.filter((b) => b.t >= fromTs)
    if (closes.length >= 15) {
      return {
        symbol: cached.symbol,
        closes,
        last: closes[closes.length - 1].c,
        high52: recomputeHigh52(closes),
        meta: {
          ...(cached.meta || {}),
          cache: staleOk && !isSeriesFresh(cached.updatedAt) ? 'stale-ok' : 'hit',
          store,
        },
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
        meta: { ...(cached.meta || {}), cache: 'stale-fallback', store },
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
  await writeSeriesCache(payload)

  const closes = merged.filter((b) => b.t >= fromTs)
  return {
    symbol: payload.symbol,
    closes,
    last: closes.length ? closes[closes.length - 1].c : payload.last,
    high52: recomputeHigh52(closes.length ? closes : merged),
    meta: { ...payload.meta, cache: cached ? 'refresh' : 'miss', store },
  }
}

export async function seriesCacheFileCount() {
  return seriesSymbolCount()
}

/**
 * Live intraday series for desk charts (not persisted in DB).
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
