import { sqlOne, sqlRun } from './db.mjs'
import {
  eodhdEnabled,
  getEodhdToken,
  toEodhdSymbol,
} from './eodhd.mjs'
import { withEodhdThrottle } from './eodhdThrottle.mjs'
import { isEodhdDailyLimitExceeded, maybeMarkEodhdDailyLimit, clearEodhdDailyLimitOnSuccess } from './eodhdLimit.mjs'

const FRESH_MS = 24 * 60 * 60 * 1000

/**
 * @param {string} ticker ASX code e.g. CBA
 */
export async function getFundamentals(ticker, opts = {}) {
  const t = String(ticker).toUpperCase().replace(/\.AX$/i, '').replace(/\.AU$/i, '')
  const force = Boolean(opts.forceRefresh)
  const cached = await sqlOne('SELECT * FROM fundamentals WHERE ticker = ?', [t])
  if (!force && cached && Date.now() - Number(cached.updated_at) < FRESH_MS) {
    return rowFromCache(t, cached, 'hit')
  }

  if (!eodhdEnabled() || isEodhdDailyLimitExceeded()) {
    return cached ? rowFromCache(t, cached, 'stale-no-token') : null
  }

  try {
    const data = await withEodhdThrottle(() => fetchEodhdStockFundamentals(t))
    if (!data) {
      return cached ? rowFromCache(t, cached, 'stale-fallback') : null
    }

    const pe = num(data.Highlights?.PERatio ?? data.Valuation?.TrailingPE)
    const forwardPe = num(data.Valuation?.ForwardPE)
    const dividendYield = num(
      data.Highlights?.DividendYield ?? data.SplitsDividends?.ForwardAnnualDividendYield,
    )
    const marketCap = num(data.Highlights?.MarketCapitalization)
    const eps = num(data.Highlights?.EarningsShare)
    const updatedAt = Date.now()

    await sqlRun(
      `INSERT INTO fundamentals (ticker, updated_at, pe, forward_pe, dividend_yield, market_cap, eps, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(ticker) DO UPDATE SET
         updated_at = excluded.updated_at,
         pe = excluded.pe,
         forward_pe = excluded.forward_pe,
         dividend_yield = excluded.dividend_yield,
         market_cap = excluded.market_cap,
         eps = excluded.eps,
         raw_json = excluded.raw_json`,
      [
        t,
        updatedAt,
        pe,
        forwardPe,
        dividendYield,
        marketCap,
        eps,
        JSON.stringify({ pe, forwardPe, dividendYield, marketCap, eps, provider: 'eodhd' }),
      ],
    )

    return {
      ticker: t,
      pe,
      forwardPe,
      dividendYield,
      marketCap,
      eps,
      updatedAt,
      cache: 'miss',
    }
  } catch {
    return cached ? rowFromCache(t, cached, 'stale-fallback') : null
  }
}

async function fetchEodhdStockFundamentals(ticker) {
  const token = getEodhdToken()
  if (!token) return null
  const symbol = toEodhdSymbol(ticker)
  const url = new URL(`https://eodhd.com/api/fundamentals/${encodeURIComponent(symbol)}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('fmt', 'json')
  // Limit payload / call cost — Highlights + Valuation cover PE, yield, mcap, EPS
  url.searchParams.set('filter', 'Highlights,Valuation,SplitsDividends')

  const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
  if (res.status === 404) return null
  if (maybeMarkEodhdDailyLimit(res.status)) return null
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`EODHD fundamentals ${symbol}: ${res.status} ${text.slice(0, 120)}`)
  }
  clearEodhdDailyLimitOnSuccess()
  const data = await res.json()
  if (data && typeof data === 'object' && data.error) {
    throw new Error(String(data.error))
  }
  return data
}

function rowFromCache(ticker, cached, cache) {
  return {
    ticker,
    pe: cached.pe,
    forwardPe: cached.forward_pe,
    dividendYield: cached.dividend_yield,
    marketCap: cached.market_cap,
    eps: cached.eps,
    updatedAt: cached.updated_at,
    cache,
  }
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
