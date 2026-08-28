import { loadEnvFile } from './loadEnv.mjs'

loadEnvFile()

const BASE = 'https://eodhd.com/api/eod'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

export function eodhdEnabled() {
  return Boolean(process.env.EODHD_API_TOKEN?.trim())
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

  const eodSymbol = toEodhdSymbol(symbol)
  const attempts = Number(opts.attempts) || 3
  const baseDelayMs = Number(opts.baseDelayMs) || 400
  const url = new URL(`${BASE}/${encodeURIComponent(eodSymbol)}`)
  url.searchParams.set('api_token', token)
  url.searchParams.set('from', period1)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('order', 'a')

  let lastErr = null
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(45000) })
      if (res.status === 404) return null
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
