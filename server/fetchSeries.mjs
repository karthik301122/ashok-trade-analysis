import { loadEnvFile } from './loadEnv.mjs'
import {
  eodhdEnabled,
  fetchEodhdChart,
  fetchEodhdCommodity,
  fetchEodhdIntraday,
  isCommoditySymbol,
} from './eodhd.mjs'

loadEnvFile()

export function seriesProviderName() {
  return 'eodhd'
}

/**
 * Fetch daily OHLCV via EODHD (equities/indexes/crypto/forex) or FRED commodities.
 * @param {string} symbol cache symbol e.g. CBA.AX, BTC-USD.CC, CMDTY:WTI, XAUUSD.FOREX
 * @param {string} [period1] ISO date
 * @param {{ attempts?: number, baseDelayMs?: number, interval?: string }} [opts]
 */
export async function fetchChartCloses(symbol, period1 = '2023-01-01', opts = {}) {
  if (!eodhdEnabled()) {
    console.warn('[fetchSeries] EODHD_API_TOKEN is required')
    return null
  }
  if (isCommoditySymbol(symbol)) {
    return await fetchEodhdCommodity(symbol, period1, opts)
  }
  return await fetchEodhdChart(symbol, period1, opts)
}

const INTRADAY_INTERVALS = new Set(['1m', '5m', '15m', '30m', '60m', '1h'])

export function isIntradayInterval(interval) {
  if (!interval) return false
  const raw = String(interval).toLowerCase()
  return raw !== '1d' && INTRADAY_INTERVALS.has(raw)
}

/**
 * Fetch intraday OHLCV for chart display (not SQLite-cached).
 * Commodities (FRED) have no intraday — returns null.
 */
export async function fetchIntradayCloses(symbol, interval, fromTs, toTs, opts = {}) {
  if (!isIntradayInterval(interval)) return null
  if (!Number.isFinite(fromTs) || !Number.isFinite(toTs) || toTs <= fromTs) return null
  if (!eodhdEnabled()) return null
  if (isCommoditySymbol(symbol)) return null
  return await fetchEodhdIntraday(symbol, interval, fromTs, toTs, opts)
}
