export type PriceBar = {
  t: number
  c: number
  v?: number
}

export type SeriesResult = {
  symbol: string
  closes: PriceBar[]
  last: number
  high52: number
}

/** Compact cached metrics — avoids storing full OHLCV for ~2000 names */
export type CachedPerf = {
  d1: number
  w1: number
  m1: number
  m3: number
  m6: number
  y1: number
  y5: number
  from52wHigh: number
  above200ma: boolean
  above50ma: boolean
  above21ema: boolean
  above20ma: boolean
  rs: number
  spark: number[]
  volume?: number
  avgVolume20?: number
  relativeVolume?: number
  dollarVolume?: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Fetch daily closes via local yahoo-finance2 middleware.
 * Provider: server-side Yahoo (yahoo-finance2) — better ASX small-cap coverage.
 */
export async function fetchYahooSeries(
  symbol: string,
  _range = '2y',
): Promise<SeriesResult | null> {
  // Keep futures/crypto symbols intact (GC=F, BTC-USD). Only strip .AX for ASX equities.
  const ticker = /\.AX$/i.test(symbol) ? symbol.replace(/\.AX$/i, '') : symbol
  const from = '2023-01-01'
  const url = `/api/series/${encodeURIComponent(ticker)}?from=${from}`
  try {
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return null
    const json = await res.json()
    if (!json?.closes?.length) return null
    return {
      symbol: json.symbol || symbol,
      closes: json.closes,
      last: json.last,
      high52: json.high52,
    }
  } catch {
    return null
  }
}

/** Run promises with limited concurrency */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      done++
      onProgress?.(done, items.length)
      await sleep(15)
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}

export function returnOver(bars: PriceBar[], tradingDays: number): number | null {
  if (bars.length < tradingDays + 1) return null
  const a = bars[bars.length - 1].c
  const b = bars[bars.length - 1 - tradingDays].c
  if (!b) return null
  return ((a - b) / b) * 100
}

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

export function ema(values: number[], period: number): number | null {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
}

const CACHE_KEY = 'asx-live-perf-v5-volume'
const CACHE_TTL_MS = 6 * 60 * 60 * 1000 // 6 hours

export type PerfCache = {
  savedAt: number
  index: CachedPerf
  stocks: Record<string, CachedPerf>
  provider?: string
}

export function loadPerfCache(): PerfCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PerfCache
    if (!parsed.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null
    if (!parsed.index || !parsed.stocks) return null
    return parsed
  } catch {
    return null
  }
}

export function savePerfCache(cache: PerfCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, provider: 'yahoo-finance2' }))
  } catch {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('asx-live-')) localStorage.removeItem(k)
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, provider: 'yahoo-finance2' }))
    } catch {
      // ignore
    }
  }
}
