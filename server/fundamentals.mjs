import YahooFinance from 'yahoo-finance2'
import { getDb } from './db.mjs'
import { eodhdOnlyMode } from './eodhd.mjs'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })
const FRESH_MS = 24 * 60 * 60 * 1000

/**
 * @param {string} ticker ASX code e.g. CBA
 */
export async function getFundamentals(ticker, opts = {}) {
  const t = String(ticker).toUpperCase().replace(/\.AX$/i, '')
  const force = Boolean(opts.forceRefresh)
  const db = getDb()
  const cached = db.prepare('SELECT * FROM fundamentals WHERE ticker = ?').get(t)
  if (!force && cached && Date.now() - Number(cached.updated_at) < FRESH_MS) {
    return {
      ticker: t,
      pe: cached.pe,
      forwardPe: cached.forward_pe,
      dividendYield: cached.dividend_yield,
      marketCap: cached.market_cap,
      eps: cached.eps,
      updatedAt: cached.updated_at,
      cache: 'hit',
    }
  }

  if (eodhdOnlyMode()) {
    if (cached) {
      return {
        ticker: t,
        pe: cached.pe,
        forwardPe: cached.forward_pe,
        dividendYield: cached.dividend_yield,
        marketCap: cached.market_cap,
        eps: cached.eps,
        updatedAt: cached.updated_at,
        cache: 'stale-eodhd-only',
      }
    }
    return null
  }

  try {
    const quote = await yf.quoteSummary(`${t}.AX`, {
      modules: ['summaryDetail', 'defaultKeyStatistics', 'price'],
    })
    const sd = quote.summaryDetail || {}
    const ks = quote.defaultKeyStatistics || {}
    const price = quote.price || {}
    const pe = num(sd.trailingPE ?? ks.trailingPE)
    const forwardPe = num(sd.forwardPE ?? ks.forwardPE)
    const dividendYield = num(sd.dividendYield ?? sd.yield)
    const marketCap = num(price.marketCap ?? sd.marketCap)
    const eps = num(ks.trailingEps)
    const updatedAt = Date.now()

    db.prepare(
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
    ).run(
      t,
      updatedAt,
      pe,
      forwardPe,
      dividendYield,
      marketCap,
      eps,
      JSON.stringify({ pe, forwardPe, dividendYield, marketCap, eps }),
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
    if (cached) {
      return {
        ticker: t,
        pe: cached.pe,
        forwardPe: cached.forward_pe,
        dividendYield: cached.dividend_yield,
        marketCap: cached.market_cap,
        eps: cached.eps,
        updatedAt: cached.updated_at,
        cache: 'stale-fallback',
      }
    }
    return null
  }
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
