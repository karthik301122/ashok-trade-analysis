import { fetchChartCloses, fetchIntradayCloses, isIntradayInterval } from './fetchSeries.mjs'
import { seriesSymbolCount, dbStoreLabel } from './db.mjs'
import { sqlOne, sqlRun } from './db.mjs'
import {
  readSeriesCache,
  writeSeriesCache,
  mergeBars,
  recomputeHigh52,
  isSeriesFresh,
  isLastBarAcceptable,
  isoFromUnix,
  isoMinusDays,
} from './seriesStore.mjs'

/**
 * Normalize ticker to the symbol key used for series cache / EODHD.
 * @param {string} ticker
 */
export function resolveSeriesSymbol(ticker) {
  const t = String(ticker).toUpperCase()
  if (t.startsWith('CMDTY:')) return t
  if (t === '^AXJO' || t === 'XJO' || t === 'ASX200') return '^AXJO'
  if (t === '^AORD' || t === 'AORD' || t === 'XAO' || t === 'AORD.INDX') return '^AORD'
  if (t === '^AXSO' || t === 'AXSO' || t === 'AXSO.INDX') return '^AXSO'
  if (t.endsWith('.CC') || t.endsWith('.FOREX') || t.endsWith('.AU') || t.endsWith('.INDX')) return t
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(t)) return `${t}.CC`
  if (t.includes('=') || t.includes('-') || t.includes('.')) return t
  return `${t}.AX`
}

function appTickerFromSeriesSymbol(symbol) {
  const t = String(symbol).toUpperCase()
  if (t.endsWith('.AX') || t.endsWith('.AU')) return t.slice(0, -3)
  if (t.startsWith('^')) return t
  return t
}

/** Keep Markets overview Price in sync when a chart/series pull advances the last close. */
async function patchSnapshotLastPrice(seriesSymbol, lastPrice) {
  const ticker = appTickerFromSeriesSymbol(seriesSymbol)
  if (!ticker || !Number.isFinite(lastPrice) || lastPrice <= 0) return
  try {
    const row = await sqlOne('SELECT stocks_perf_json FROM market_snapshot WHERE id = 1')
    if (!row?.stocks_perf_json) return
    const stocks = JSON.parse(row.stocks_perf_json)
    const perf = stocks[ticker]
    if (!perf || typeof perf !== 'object') return
    const next = Math.round(lastPrice * 10000) / 10000
    if (Number(perf.lastPrice) === next) return
    stocks[ticker] = { ...perf, lastPrice: next }
    await sqlRun('UPDATE market_snapshot SET stocks_perf_json = ? WHERE id = 1', [
      JSON.stringify(stocks),
    ])
    const { clearStocksPerfCache } = await import('./snapshotJob.mjs')
    clearStocksPerfCache()
  } catch {
    /* best-effort */
  }
}

/**
 * Fetch series with DB cache + incremental EODHD refresh.
 * @param {string} ticker
 * @param {string} from ISO date
 * @param {{ forceRefresh?: boolean, staleOk?: boolean }} [opts]
 */
export async function getCachedSeries(ticker, from = '2023-01-01', opts = {}) {
  const seriesSymbol = resolveSeriesSymbol(ticker)
  const forceRefresh = Boolean(opts.forceRefresh)
  const staleOk = Boolean(opts.staleOk)
  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)
  const store = dbStoreLabel()

  const cached = forceRefresh ? null : await readSeriesCache(seriesSymbol)

  if (cached) {
    const closes = cached.closes.filter((b) => b.t >= fromTs)
    if (closes.length >= 15) {
      const barsOk = isLastBarAcceptable(cached.closes)
      if (staleOk || barsOk) {
        return {
          symbol: cached.symbol,
          closes,
          last: closes[closes.length - 1].c,
          high52: recomputeHigh52(closes),
          meta: {
            ...(cached.meta || {}),
            cache: !barsOk || (staleOk && !isSeriesFresh(cached.updatedAt)) ? 'stale-ok' : 'hit',
            lastBar: isoFromUnix(closes[closes.length - 1].t),
            store,
          },
        }
      }
    }
  }

  const fetchOpts = {
    attempts: forceRefresh ? 4 : 3,
    baseDelayMs: forceRefresh ? 600 : 400,
  }

  let period1 = from
  if (cached?.closes?.length) {
    const lastT = cached.closes[cached.closes.length - 1].t
    const overlap = isoMinusDays(isoFromUnix(lastT), 7)
    period1 = overlap > from ? overlap : from
  }

  let fresh = await fetchChartCloses(seriesSymbol, period1, fetchOpts)
  let merged = fresh
    ? cached?.closes?.length
      ? mergeBars(cached.closes, fresh.closes)
      : fresh.closes
    : null

  // Incremental pull sometimes returns nothing useful while last bar is still old — retry full range.
  if (
    (!merged || !isLastBarAcceptable(merged)) &&
    period1 !== from &&
    !staleOk
  ) {
    const full = await fetchChartCloses(seriesSymbol, from, {
      attempts: 4,
      baseDelayMs: 500,
    })
    if (full?.closes?.length) {
      fresh = full
      merged = cached?.closes?.length ? mergeBars(cached.closes, full.closes) : full.closes
    }
  }

  if (!merged?.length) {
    if (cached?.closes?.length) {
      const closes = cached.closes.filter((b) => b.t >= fromTs)
      if (closes.length >= 15) {
        return {
          symbol: cached.symbol,
          closes,
          last: closes[closes.length - 1].c,
          high52: recomputeHigh52(closes),
          meta: {
            ...(cached.meta || {}),
            cache: 'stale-fallback',
            lastBar: isoFromUnix(closes[closes.length - 1].t),
            store,
          },
        }
      }
    }
    return null
  }

  const payload = {
    symbol: fresh?.symbol || seriesSymbol,
    updatedAt: Date.now(),
    closes: merged,
    last: merged[merged.length - 1].c,
    high52: recomputeHigh52(merged),
    meta: fresh?.meta || {},
  }
  await writeSeriesCache(payload)
  void patchSnapshotLastPrice(seriesSymbol, payload.last)

  const closes = merged.filter((b) => b.t >= fromTs)
  return {
    symbol: payload.symbol,
    closes,
    last: closes.length ? closes[closes.length - 1].c : payload.last,
    high52: recomputeHigh52(closes.length ? closes : merged),
    meta: {
      ...payload.meta,
      cache: cached ? 'refresh' : 'miss',
      lastBar: closes.length ? isoFromUnix(closes[closes.length - 1].t) : undefined,
      store,
    },
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
  const seriesSymbol = resolveSeriesSymbol(ticker)
  const data = await fetchIntradayCloses(seriesSymbol, interval, fromTs, toTs)
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
