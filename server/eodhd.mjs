import { loadEnvFile } from './loadEnv.mjs'
import { withEodhdThrottle, parseRetryAfterMs } from './eodhdThrottle.mjs'

loadEnvFile()

const BASE = 'https://eodhd.com/api/eod'
const INTRADAY_BASE = 'https://eodhd.com/api/intraday'

/** EODHD intraday supports 1m, 5m, 1h — map client intervals (e.g. 30m) to nearest. */
export function normalizeEodhdIntradayInterval(interval) {
  const raw = String(interval || '5m').toLowerCase()
  if (raw === '1m') return '1m'
  if (raw === '1h' || raw === '60m') return '1h'
  return '5m'
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
 * EODHD-only desk: no Yahoo fallback for OHLC/series, no browser universe crawl.
 * Set EODHD_ONLY=true or EODHD_YAHOO_FALLBACK=false (with token configured).
 */
export function eodhdOnlyMode() {
  if (envBool('EODHD_ONLY')) return true
  if (!eodhdEnabled()) return false
  const fb = process.env.EODHD_YAHOO_FALLBACK?.trim().toLowerCase()
  return fb === '0' || fb === 'false' || fb === 'no'
}

export function getEodhdToken() {
  return process.env.EODHD_API_TOKEN?.trim() || ''
}

/**
 * Map app / Yahoo cache symbol to EODHD CODE.EXCHANGE.
 * @param {string} symbol e.g. CBA.AX, ^AXJO, CBA
 */
export function toEodhdSymbol(symbol) {
  const t = String(symbol).toUpperCase()
  if (t === '^AXJO' || t === 'XJO' || t === 'ASX200' || t === 'AXJO.INDX') return 'AXJO.INDX'
  if (t.endsWith('.AU')) return t
  if (t.endsWith('.AX')) return `${t.slice(0, -3)}.AU`
  if (t.includes('.') || t.includes('^') || t.includes('=')) return t
  return `${t}.AU`
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
 * @param {string} symbol Yahoo/cache symbol (CBA.AX, ^AXJO)
 * @param {string} [period1] ISO from date
 * @param {{ attempts?: number, baseDelayMs?: number }} [opts]
 */
export async function fetchEodhdChart(symbol, period1 = '2023-01-01', opts = {}) {
  const token = getEodhdToken()
  if (!token) return null
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
  const last = closes[closes.length - 1].c
  const yearAgo = closes[closes.length - 1].t - 365 * 24 * 3600
  const lastYear = closes.filter((b) => b.t >= yearAgo)
  const high52 = Math.max(...lastYear.map((b) => b.h ?? b.c), last)
  return { closes, last, high52 }
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
  const iv = normalizeEodhdIntradayInterval(interval)
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
      return {
        symbol,
        closes: parsed.closes,
        last: parsed.last,
        high52: parsed.high52,
        meta: {
          provider: 'eodhd',
          eodSymbol,
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
  if (lastErr) console.warn(`[eodhd] intraday ${symbol}: ${lastErr.message || lastErr}`)
  return null
}
