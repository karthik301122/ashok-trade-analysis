import { loadEnvFile } from './loadEnv.mjs'
import { eodhdEnabled, fetchEodhdChart } from './eodhd.mjs'
import { fetchChartCloses as fetchYahooChart } from './yf.mjs'

loadEnvFile()

function yahooFallbackEnabled() {
  const raw = process.env.EODHD_YAHOO_FALLBACK?.trim().toLowerCase()
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return true
}

export function seriesProviderName() {
  const forced = process.env.DATA_PROVIDER?.trim().toLowerCase()
  if (forced === 'yahoo') return 'yahoo-finance2'
  if (forced === 'eodhd') return 'eodhd'
  if (eodhdEnabled()) return 'eodhd'
  return 'yahoo-finance2'
}

/**
 * Fetch daily OHLCV — EODHD when configured, Yahoo fallback optional.
 * @param {string} symbol Yahoo/cache symbol e.g. CBA.AX or ^AXJO
 * @param {string} [period1] ISO date
 * @param {{ attempts?: number, baseDelayMs?: number }} [opts]
 */
export async function fetchChartCloses(symbol, period1 = '2023-01-01', opts = {}) {
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
