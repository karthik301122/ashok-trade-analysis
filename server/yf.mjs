import YahooFinance from 'yahoo-finance2'
import { sanitizeOhlcBars } from './ohlcSanitize.mjs'

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] })

const CHART_OPTS = { validateResult: false }

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * @param {string} symbol Yahoo symbol e.g. CBA.AX or ^AXJO
 * @param {string} [period1] ISO date
 * @param {{ attempts?: number, baseDelayMs?: number }} [opts]
 */
export async function fetchChartCloses(symbol, period1 = '2023-01-01', opts = {}) {
  const attempts = Number(opts.attempts) || 3
  const baseDelayMs = Number(opts.baseDelayMs) || 400
  let lastErr = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await yf.chart(
        symbol,
        {
          period1,
          interval: '1d',
        },
        CHART_OPTS,
      )
      const quotes = (result.quotes || []).filter((q) => q.close != null && Number.isFinite(q.close))
      if (quotes.length < 15) return null

      const closes = quotes.map((q) => {
        const c = Number(q.close)
        const o = Number.isFinite(q.open) ? Number(q.open) : c
        const h = Number.isFinite(q.high) ? Number(q.high) : Math.max(o, c)
        const l = Number.isFinite(q.low) ? Number(q.low) : Math.min(o, c)
        return {
          t: Math.floor(new Date(q.date).getTime() / 1000),
          o,
          h,
          l,
          c,
          v: Number.isFinite(q.volume) ? Number(q.volume) : 0,
        }
      })
      const last = closes[closes.length - 1].c
      const yearAgo = closes[closes.length - 1].t - 365 * 24 * 3600
      const lastYear = closes.filter((b) => b.t >= yearAgo)
      const high52 = Math.max(...lastYear.map((b) => b.h ?? b.c), last)

      return {
        symbol,
        closes,
        last,
        high52,
        meta: {
          currency: result.meta?.currency,
          exchange: result.meta?.exchangeName,
          instrument: result.meta?.instrumentType,
        },
      }
    } catch (err) {
      lastErr = err
      await sleep(baseDelayMs * (attempt + 1) + Math.random() * 300)
    }
  }
  if (lastErr) return null
  return null
}

export async function fetchAsxTicker(ticker, period1, opts) {
  return fetchChartCloses(`${String(ticker).toUpperCase()}.AX`, period1, opts)
}

export async function fetchAsx200(period1) {
  return fetchChartCloses('^AXJO', period1)
}

/** Yahoo intraday intervals (30m matches TradingView-style desks). */
export function normalizeYahooIntradayInterval(interval) {
  const raw = String(interval || '30m').toLowerCase()
  const map = {
    '1m': '1m',
    '2m': '2m',
    '5m': '5m',
    '15m': '15m',
    '30m': '30m',
    '60m': '60m',
    '1h': '60m',
    '90m': '90m',
  }
  return map[raw] || '30m'
}

/**
 * @param {string} symbol
 * @param {string} interval e.g. 5m, 30m, 60m
 * @param {number} fromTs unix seconds
 * @param {number} toTs unix seconds
 */
export async function fetchChartIntraday(symbol, interval, fromTs, toTs, opts = {}) {
  const attempts = Number(opts.attempts) || 3
  const baseDelayMs = Number(opts.baseDelayMs) || 400
  const iv = normalizeYahooIntradayInterval(interval)
  const period1 = new Date(fromTs * 1000).toISOString().slice(0, 10)
  const period2 = new Date((toTs + 86400) * 1000).toISOString().slice(0, 10)
  let lastErr = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const result = await yf.chart(
        symbol,
        {
          period1,
          period2,
          interval: iv,
        },
        CHART_OPTS,
      )
      const quotes = (result.quotes || []).filter((q) => q.close != null && Number.isFinite(q.close))
      if (quotes.length < 5) return null

      const closes = quotes
        .map((q) => {
          const c = Number(q.close)
          const o = Number.isFinite(q.open) ? Number(q.open) : c
          const h = Number.isFinite(q.high) ? Number(q.high) : Math.max(o, c)
          const l = Number.isFinite(q.low) ? Number(q.low) : Math.min(o, c)
          return {
            t: Math.floor(new Date(q.date).getTime() / 1000),
            o,
            h,
            l,
            c,
            v: Number.isFinite(q.volume) ? Number(q.volume) : 0,
          }
        })
        .filter((b) => b.t >= fromTs && b.t <= toTs + 3600)

      if (closes.length < 5) return null
      closes.sort((a, b) => a.t - b.t)
      const cleaned = sanitizeOhlcBars(closes)
      if (cleaned.length < 5) return null
      const last = cleaned[cleaned.length - 1].c
      const yearAgo = cleaned[cleaned.length - 1].t - 365 * 24 * 3600
      const lastYear = cleaned.filter((b) => b.t >= yearAgo)
      const high52 = Math.max(...lastYear.map((b) => b.h ?? b.c), last)

      return {
        symbol,
        closes: cleaned,
        last,
        high52,
        meta: {
          currency: result.meta?.currency,
          exchange: result.meta?.exchangeName,
          instrument: result.meta?.instrumentType,
          provider: 'yahoo-finance2',
          interval: iv,
          requestedInterval: interval,
          intraday: true,
        },
      }
    } catch (err) {
      lastErr = err
      await sleep(baseDelayMs * (attempt + 1) + Math.random() * 300)
    }
  }
  if (lastErr) return null
  return null
}
