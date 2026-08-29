import { loadEnvFile } from './loadEnv.mjs'
import { eodhdEnabled, eodhdOnlyMode, fetchEodhdChart, fetchEodhdIntraday } from './eodhd.mjs'
import { fetchChartCloses as fetchYahooChart, fetchChartIntraday as fetchYahooIntraday } from './yf.mjs'

loadEnvFile()

function yahooFallbackEnabled() {
  if (eodhdOnlyMode()) return false
  const raw = process.env.EODHD_YAHOO_FALLBACK?.trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return true
}

export function seriesProviderName() {
  if (eodhdOnlyMode()) return 'eodhd'
  const forced = process.env.DATA_PROVIDER?.trim().toLowerCase()
  if (forced === 'yahoo') return 'yahoo-finance2'
  if (forced === 'eodhd') return 'eodhd'
  if (eodhdEnabled()) return 'eodhd'
  return 'yahoo-finance2'
}

/**
 * Fetch daily OHLCV — EODHD when configured, Yahoo fallback optional (disabled in EODHD-only mode).
 * @param {string} symbol Yahoo/cache symbol e.g. CBA.AX or ^AXJO
 * @param {string} [period1] ISO date
 * @param {{ attempts?: number, baseDelayMs?: number }} [opts]
 */
export async function fetchChartCloses(symbol, period1 = '2023-01-01', opts = {}) {
  if (eodhdOnlyMode()) {
    if (!eodhdEnabled()) {
      console.warn('[fetchSeries] EODHD_ONLY requires EODHD_API_TOKEN')
      return null
    }
    return await fetchEodhdChart(symbol, period1, opts)
  }

  const forced = process.env.DATA_PROVIDER?.trim().toLowerCase()
  const useEodhd = forced === 'eodhd' || (forced !== 'yahoo' && eodhdEnabled())
  const useYahoo = forced === 'yahoo' || (forced !== 'eodhd' && (!useEodhd || yahooFallbackEnabled()))

  if (useEodhd) {
    const eod = await fetchEodhdChart(symbol, period1, opts)
    if (eod) return eod
    if (!useYahoo) return null
    const yahoo = await fetchYahooChart(symbol, period1, opts)
    if (yahoo) {
      return {
        ...yahoo,
        meta: { ...(yahoo.meta || {}), provider: 'yahoo-finance2', fallback: true },
      }
    }
    return null
  }

  const yahoo = await fetchYahooChart(symbol, period1, opts)
  if (!yahoo) return null
  return {
    ...yahoo,
    meta: { ...(yahoo.meta || {}), provider: 'yahoo-finance2' },
  }
}

const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '60m', '1h'])

export function isIntradayInterval(interval) {
  if (!interval) return false
  const raw = String(interval).toLowerCase()
  return raw !== '1d' && INTRADAY_INTERVALS.has(raw)
}

/**
 * Fetch intraday OHLCV for chart display (not SQLite-cached).
 * @param {string} symbol
 * @param {string} interval 5m, 30m, 1h, etc.
 * @param {number} fromTs unix seconds UTC
 * @param {number} toTs unix seconds UTC
 */
export async function fetchIntradayCloses(symbol, interval, fromTs, toTs, opts = {}) {
  if (!isIntradayInterval(interval)) return null
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return null

  if (eodhdOnlyMode()) {
    if (!eodhdEnabled()) return null
    return await fetchEodhdIntraday(symbol, interval, fromTs, toTs, opts)
  }

  const forced = process.env.DATA_PROVIDER?.trim().toLowerCase()
  const useEodhd = forced === 'eodhd' || (forced !== 'yahoo' && eodhdEnabled())
  const useYahoo = forced === 'yahoo' || (forced !== 'eodhd' && (!useEodhd || yahooFallbackEnabled()))

  if (useEodhd) {
    const eod = await fetchEodhdIntraday(symbol, interval, fromTs, toTs, opts)
    if (eod) return eod
    if (!useYahoo) return null
    const yahoo = await fetchYahooIntraday(symbol, interval, fromTs, toTs, opts)
    if (yahoo) {
      return {
        ...yahoo,
        meta: { ...(yahoo.meta || {}), provider: 'yahoo-finance2', fallback: true },
      }
    }
    return null
  }

  const yahoo = await fetchYahooIntraday(symbol, interval, fromTs, toTs, opts)
  if (!yahoo) return null
  return {
    ...yahoo,
    meta: { ...(yahoo.meta || {}), provider: 'yahoo-finance2' },
  }
}
