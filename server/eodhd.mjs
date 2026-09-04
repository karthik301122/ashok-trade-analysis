import { loadEnvFile } from './loadEnv.mjs'
import { withEodhdThrottle, parseRetryAfterMs } from './eodhdThrottle.mjs'
import {
  isEodhdDailyLimitExceeded,
  maybeMarkEodhdDailyLimit,
  clearEodhdDailyLimitOnSuccess,
} from './eodhdLimit.mjs'
import { sanitizeOhlcBars } from './ohlcSanitize.mjs'
import {
  aggregateOhlcBars,
  eodhdAggregateMinutes,
  eodhdSourceInterval,
} from './ohlcAggregate.mjs'

loadEnvFile()

const BASE = 'https://eodhd.com/api/eod'
const INTRADAY_BASE = 'https://eodhd.com/api/intraday'

/** EODHD intraday supports 1m, 5m, 1h — 15m/30m are built from 5m bars. */
export function normalizeEodhdIntradayInterval(interval) {
  return eodhdSourceInterval(interval)
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function envBool(name, defaultValue = false) {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return defaultValue
  if (raw === '1' || raw === 'true' || raw === 'yes') return true
  if (raw === '0' || raw === 'false' || raw === 'no') return false
  return defaultValue
}

export function eodhdEnabled() {
  return Boolean(process.env.EODHD_API_TOKEN?.trim())
}

/**
 * Yahoo has been removed — desk is always EODHD-only.
 */
export function eodhdOnlyMode() {
  return true
}

export function getEodhdToken() {
  return process.env.EODHD_API_TOKEN?.trim() || ''
}

/**
 * Map app / cache symbol to EODHD CODE.EXCHANGE.
 * @param {string} symbol e.g. CBA.AX, ^AXJO, BTC-USD, XAUUSD.FOREX, CMDTY:WTI
 */
export function toEodhdSymbol(symbol) {
  const raw = String(symbol).trim()
  if (raw.toUpperCase().startsWith('CMDTY:')) return raw.slice(6).toUpperCase()
  const t = raw.toUpperCase()
  if (t === '^AXJO' || t === 'XJO' || t === 'ASX200' || t === 'AXJO.INDX') return 'AXJO.INDX'
  if (t === '^AORD' || t === 'AORD' || t === 'XAO' || t === 'AORD.INDX') return 'AORD.INDX'
  if (t === '^AXSO' || t === 'AXSO' || t === 'AXSO.INDX') return 'AXSO.INDX'
  if (t.endsWith('.AU') || t.endsWith('.CC') || t.endsWith('.FOREX') || t.endsWith('.INDX')) return t
  if (t.endsWith('.AX')) return `${t.slice(0, -3)}.AU`
  // Crypto pairs → CC exchange
  if (/^[A-Z0-9]+-[A-Z0-9]+$/.test(t)) return `${t}.CC`
  if (t.includes('.') || t.includes('^') || t.includes('=')) return t
  return `${t}.AU`
}

/** FRED commodity series (prefix CMDTY: in app symbols). */
export function isCommoditySymbol(symbol) {
  return String(symbol).toUpperCase().startsWith('CMDTY:')
}

function parseEodDate(dateStr) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / 1000)
}

/**
 * @param {unknown} rows
 */
function rowsToBars(rows) {
  if (!Array.isArray(rows) || rows.length < 15) return null
  const closes = []
  for (const row of rows) {
    if (!row || typeof row.date !== 'string') continue
    const c = Number(row.adjusted_close ?? row.close)
    if (!Number.isFinite(c)) continue
    const o = Number.isFinite(row.open) ? Number(row.open) : c
    const h = Number.isFinite(row.high) ? Number(row.high) : Math.max(o, c)
    const l = Number.isFinite(row.low) ? Number(row.low) : Math.min(o, c)
    closes.push({
      t: parseEodDate(row.date),
      o,
      h,
      l,
      c,
      v: Number.isFinite(row.volume) ? Number(row.volume) : 0,
    })
  }
  if (closes.length < 15) return null
  const last = closes[closes.length - 1].c
  const yearAgo = closes[closes.length - 1].t - 365 * 24 * 3600
  const lastYear = closes.filter((b) => b.t >= yearAgo)
  const high52 = Math.max(...lastYear.map((b) => b.h ?? b.c), last)
  return { closes, last, high52 }
}

/**
 * @param {string} symbol Cache symbol (CBA.AX, ^AXJO)
 * @param {string} [period1] ISO from date
 * @param {{ attempts?: number, baseDelayMs?: number }} [opts]
 */
export async function fetchEodhdChart(symbol, period1 = '2023-01-01', opts = {}) {
  const token = getEodhdToken()
  if (!token || isEodhdDailyLimitExceeded()) return null
  return withEodhdThrottle(() => fetchEodhdChartInner(symbol, period1, opts, token))
}

async function fetchEodhdChartInner(symbol, period1, opts, token) {
  const eodSymbol = toEodhdSymbol(symbol)
  const attempts = Number(opts.attempts) || 5
  const baseDelayMs = Number(opts.baseDelayMs) || 400
  const url = new URL(`${BASE}/${encodeURIComponent(eodSymbol)}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('from', period1)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('order', 'a')

  let lastErr = null
  let extra429Retries = 3
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (res.status === 404) return null
      if (maybeMarkEodhdDailyLimit(res.status)) return null
      if (res.status === 429) {
        const waitMs = parseRetryAfterMs(res.headers)
        console.warn(`[eodhd] ${symbol}: rate limited — waiting ${Math.round(waitMs / 1000)}s`)
        await sleep(waitMs)
        if (extra429Retries > 0) {
          extra429Retries--
          attempt--
        }
        continue
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`EODHD ${res.status}: ${text.slice(0, 120)}`)
      }
      const data = await res.json()
      if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
        throw new Error(String(data.error))
      }
      const parsed = rowsToBars(data)
      if (!parsed) return null
      clearEodhdDailyLimitOnSuccess()
      return {
        symbol,
        closes: parsed.closes,
        last: parsed.last,
        high52: parsed.high52,
        meta: {
          provider: 'eodhd',
          eodSymbol,
          exchange: eodSymbol.includes('.INDX') ? 'INDX' : 'AU',
        },
      }
    } catch (err) {
      lastErr = err
      await sleep(baseDelayMs * (attempt + 1) + Math.random() * 300)
    }
  }
  if (lastErr) console.warn(`[eodhd] ${symbol}: ${lastErr.message || lastErr}`)
  return null
}

function parseIntradayTs(row) {
  if (row == null || typeof row !== 'object') return null
  const ts = Number(row.timestamp)
  if (Number.isFinite(ts) && ts > 1e9) return Math.floor(ts)
  const dt = row.datetime
  if (typeof dt === 'number' && Number.isFinite(dt)) return Math.floor(dt)
  if (typeof dt === 'string' && dt.trim()) {
    const ms = Date.parse(dt.includes('T') ? dt : `${dt.replace(' ', 'T')}Z`)
    if (Number.isFinite(ms)) return Math.floor(ms / 1000)
  }
  return null
}

function rowsToIntradayBars(rows) {
  if (!Array.isArray(rows) || rows.length < 5) return null
  const closes = []
  for (const row of rows) {
    const t = parseIntradayTs(row)
    if (t == null) continue
    const c = Number(row.close)
    if (!Number.isFinite(c)) continue
    const o = Number.isFinite(row.open) ? Number(row.open) : c
    const h = Number.isFinite(row.high) ? Number(row.high) : Math.max(o, c)
    const l = Number.isFinite(row.low) ? Number(row.low) : Math.min(o, c)
    closes.push({
      t,
      o,
      h,
      l,
      c,
      v: Number.isFinite(row.volume) ? Number(row.volume) : 0,
    })
  }
  if (closes.length < 5) return null
  closes.sort((a, b) => a.t - b.t)
  const cleaned = sanitizeOhlcBars(closes)
  if (cleaned.length < 5) return null
  const last = cleaned[cleaned.length - 1].c
  const yearAgo = cleaned[cleaned.length - 1].t - 365 * 24 * 3600
  const lastYear = cleaned.filter((b) => b.t >= yearAgo)
  const high52 = Math.max(...lastYear.map((b) => b.h ?? b.c), last)
  return { closes: cleaned, last, high52 }
}

/**
 * Intraday OHLCV — intervals 1m, 5m, 1h (30m etc. mapped to 5m).
 * @param {string} symbol
 * @param {string} interval
 * @param {number} fromTs unix seconds UTC
 * @param {number} toTs unix seconds UTC
 */
export async function fetchEodhdIntraday(symbol, interval, fromTs, toTs, opts = {}) {
  const token = getEodhdToken()
  if (!token) return null
  return withEodhdThrottle(() =>
    fetchEodhdIntradayInner(symbol, interval, fromTs, toTs, opts, token),
  )
}

async function fetchEodhdIntradayInner(symbol, interval, fromTs, toTs, opts, token) {
  const eodSymbol = toEodhdSymbol(symbol)
  const requested = String(interval || '5m').toLowerCase()
  const iv = eodhdSourceInterval(requested)
  const aggMinutes = eodhdAggregateMinutes(requested)
  const attempts = Number(opts.attempts) || 4
  const baseDelayMs = Number(opts.baseDelayMs) || 400
  const url = new URL(`${INTRADAY_BASE}/${encodeURIComponent(eodSymbol)}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('interval', iv)
  url.searchParams.set('fmt', 'json')
  if (Number.isFinite(fromTs)) url.searchParams.set('from', String(Math.floor(fromTs)))
  if (Number.isFinite(toTs)) url.searchParams.set('to', String(Math.floor(toTs)))

  let lastErr = null
  let extra429Retries = 3
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (res.status === 404) return null
      if (maybeMarkEodhdDailyLimit(res.status)) return null
      if (res.status === 429) {
        const waitMs = parseRetryAfterMs(res.headers)
        console.warn(`[eodhd] intraday ${symbol}: rate limited — waiting ${Math.round(waitMs / 1000)}s`)
        await sleep(waitMs)
        if (extra429Retries > 0) {
          extra429Retries--
          attempt--
        }
        continue
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`EODHD intraday ${res.status}: ${text.slice(0, 120)}`)
      }
      const data = await res.json()
      if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
        throw new Error(String(data.error))
      }
      const parsed = rowsToIntradayBars(data)
      if (!parsed) return null
      let closes = parsed.closes
      if (aggMinutes && iv === '5m') {
        closes = aggregateOhlcBars(closes, aggMinutes)
        if (closes.length < 5) return null
        closes = sanitizeOhlcBars(closes)
        if (closes.length < 5) return null
      }
      const last = closes[closes.length - 1].c
      const yearAgo = closes[closes.length - 1].t - 365 * 24 * 3600
      const lastYear = closes.filter((b) => b.t >= yearAgo)
      const high52 = Math.max(...lastYear.map((b) => b.h ?? b.c), last)
      clearEodhdDailyLimitOnSuccess()
      return {
        symbol,
        closes,
        last,
        high52,
        meta: {
          provider: 'eodhd',
          eodSymbol,
          interval: aggMinutes ? requested : iv,
          requestedInterval: interval,
          sourceInterval: iv,
          intraday: true,
        },
      }
    } catch (err) {
      lastErr = err
      await sleep(baseDelayMs * (attempt + 1) + Math.random() * 300)
    }
  }
  if (lastErr) console.warn(`[eodhd] intraday ${symbol}: ${lastErr.message || lastErr}`)
  return null
}

const COMMODITY_BASE = 'https://eodhd.com/api/commodities/historical'

/**
 * FRED commodity series (CMDTY:WTI). Returns synthetic OHLC from value.
 * @param {string} symbol e.g. CMDTY:WTI
 * @param {string} [period1]
 * @param {{ interval?: string }} [opts]
 */
export async function fetchEodhdCommodity(symbol, period1 = '2020-01-01', opts = {}) {
  const token = getEodhdToken()
  if (!token || isEodhdDailyLimitExceeded() || !isCommoditySymbol(symbol)) return null
  return withEodhdThrottle(() => fetchEodhdCommodityInner(symbol, period1, opts, token))
}

async function fetchEodhdCommodityInner(symbol, period1, opts, token) {
  const code = toEodhdSymbol(symbol)
  const interval = String(opts.interval || 'daily').toLowerCase()
  const url = new URL(`${COMMODITY_BASE}/${encodeURIComponent(code)}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('interval', interval)
  url.searchParams.set('fmt', 'json')

  const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
  if (res.status === 404) return null
  if (maybeMarkEodhdDailyLimit(res.status)) return null
  if (!res.ok) {
    const text = await res.text()
    console.warn(`[eodhd] commodity ${code}: ${res.status} ${text.slice(0, 100)}`)
    return null
  }
  clearEodhdDailyLimitOnSuccess()
  const json = await res.json()
  const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : null
  if (!rows?.length) return null

  const fromTs = Math.floor(new Date(`${period1}T00:00:00Z`).getTime() / 1000)
  const closes = []
  for (const row of rows) {
    if (!row || typeof row.date !== 'string') continue
    const v = Number(row.value ?? row.close)
    if (!Number.isFinite(v)) continue
    const t = parseEodDate(row.date)
    if (t < fromTs) continue
    closes.push({ t, o: v, h: v, l: v, c: v, v: 0 })
  }
  closes.sort((a, b) => a.t - b.t)
  if (closes.length < 5) return null
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
      provider: 'eodhd',
      eodSymbol: code,
      exchange: 'CMDTY',
      commodity: true,
      interval,
      unit: json?.meta?.unit ?? null,
      name: json?.meta?.name ?? null,
    },
  }
}

const REALTIME_BASE = 'https://eodhd.com/api/real-time'

/**
 * EODHD live (delayed ~15–20 min) quote batch — up to ~20 symbols per call.
 * @param {string[]} seriesSymbols e.g. BHP.AX, ^AXJO
 */
export async function fetchEodhdLiveQuotes(seriesSymbols) {
  const token = getEodhdToken()
  if (!token || !seriesSymbols?.length || isEodhdDailyLimitExceeded()) return []
  const BATCH = 20
  const out = []
  for (let i = 0; i < seriesSymbols.length; i += BATCH) {
    const batch = seriesSymbols.slice(i, i + BATCH)
    const chunk = await withEodhdThrottle(() => fetchEodhdLiveQuotesBatch(batch, token))
    if (chunk?.length) out.push(...chunk)
  }
  return out
}

async function fetchEodhdLiveQuotesBatch(seriesSymbols, token) {
  const eodSymbols = seriesSymbols.map((s) => toEodhdSymbol(s))
  const primary = eodSymbols[0]
  if (!primary) return []
  const url = new URL(`${REALTIME_BASE}/${encodeURIComponent(primary)}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('fmt', 'json')
  if (eodSymbols.length > 1) {
    url.searchParams.set('s', eodSymbols.slice(1).join(','))
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
  if (res.status === 404) return []
  if (maybeMarkEodhdDailyLimit(res.status)) return []
  if (res.status === 429) {
    const waitMs = parseRetryAfterMs(res.headers)
    console.warn(`[eodhd] live batch: rate limited — waiting ${Math.round(waitMs / 1000)}s`)
    await sleep(waitMs)
    return []
  }
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`EODHD live ${res.status}: ${text.slice(0, 120)}`)
  }
  const data = await res.json()
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    throw new Error(String(data.error))
  }
  const rows = Array.isArray(data) ? data : [data]
  clearEodhdDailyLimitOnSuccess()
  return rows.filter((r) => r && typeof r === 'object' && r.code)
}

/** Map EODHD code (BHP.AU) to app ticker (BHP). */
export function eodhdCodeToAppTicker(code) {
  const c = String(code).trim().toUpperCase()
  if (!c) return ''
  if (c === 'AXJO.INDX' || c === '^AXJO') return '^AXJO'
  if (c === 'AORD.INDX' || c === '^AORD' || c === 'XAO' || c === 'AORD') return '^AORD'
  if (c === 'AXSO.INDX' || c === '^AXSO' || c === 'AXSO') return '^AXSO'
  if (c.endsWith('.AU')) return c.slice(0, -3)
  if (c.endsWith('.AX')) return c.slice(0, -3)
  return c
}
