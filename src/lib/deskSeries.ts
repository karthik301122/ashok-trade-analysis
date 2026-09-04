import { fetchSeriesQueued } from './seriesFetchQueue'
import { sanitizeOhlcBars } from './ohlcSanitize'

export type PriceBar = {
  t: number
  c: number
  o?: number
  h?: number
  l?: number
  v?: number
}

export type OhlcBar = {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
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
  /** Wilder-style RSI(14), 0–100 */
  rsi?: number
  volume?: number
  avgVolume20?: number
  relativeVolume?: number
  dollarVolume?: number
  /** Last session close (AUD) */
  lastPrice?: number
  /** Server applied EODHD live (delayed) quote */
  liveAt?: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Map UI range labels to an ISO `from` date for /api/series.
 */
export function rangeToFromIso(range = '2y'): string {
  const d = new Date()
  const r = range.toLowerCase()
  if (r === '6mo' || r === '6m') d.setUTCMonth(d.getUTCMonth() - 6)
  else if (r === '1y' || r === 'y1') d.setUTCFullYear(d.getUTCFullYear() - 1)
  else if (r === '5y' || r === 'y5') d.setUTCFullYear(d.getUTCFullYear() - 5)
  else if (r === 'max' || r === '10y') d.setUTCFullYear(d.getUTCFullYear() - 10)
  else d.setUTCFullYear(d.getUTCFullYear() - 2) // default 2y
  return d.toISOString().slice(0, 10)
}

/**
 * Fetch daily closes via desk /api/series (EODHD when configured, SQLite cache on server).
 * Honors `range` via ?from= (server also disk-caches + incremental refresh).
 */
export async function fetchDeskSeries(
  symbol: string,
  range = '2y',
): Promise<SeriesResult | null> {
  // Keep futures/crypto symbols intact (GC=F, BTC-USD). Only strip .AX for ASX equities.
  const ticker = /\.AX$/i.test(symbol) ? symbol.replace(/\.AX$/i, '') : symbol
  const from = rangeToFromIso(range)
  const url = `/api/series/${encodeURIComponent(ticker)}?from=${from}`
  try {
    const res = await fetchSeriesQueued(url)
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

function parseOhlcBars(json: { closes?: PriceBar[] }): OhlcBar[] | null {
  if (!json?.closes?.length) return null
  const bars: OhlcBar[] = []
  for (const b of json.closes) {
    if (b.t == null || !Number.isFinite(b.c)) continue
    const c = b.c
    const o = Number.isFinite(b.o) ? Number(b.o) : c
    const h = Number.isFinite(b.h) ? Number(b.h) : Math.max(o, c)
    const l = Number.isFinite(b.l) ? Number(b.l) : Math.min(o, c)
    const v = Number.isFinite(b.v) ? Number(b.v) : 0
    bars.push({ t: b.t, o, h, l, c, v })
  }
  const cleaned = sanitizeOhlcBars(bars)
  if (!cleaned?.length) return null
  return cleaned.map((b) => ({ ...b, v: b.v ?? 0 }))
}

export type DeskSeriesMeta = {
  provider?: string
  interval?: string
  intraday?: boolean
}

/** Daily OHLC for pattern detection / annotated charts */
export async function fetchDeskOhlc(
  symbol: string,
  from = '2023-01-01',
  opts?: { staleOk?: boolean },
): Promise<OhlcBar[] | null> {
  const ticker = /\.AX$/i.test(symbol) ? symbol.replace(/\.AX$/i, '') : symbol
  const fromTs = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000)

  const session = ohlcSessionCache.get(ticker)
  if (session && Date.now() - session.at < OHLC_SESSION_MS && session.bars) {
    const sliced = session.bars.filter((b) => b.t >= fromTs)
    if (sliced.length >= 30) return sliced
  }

  const params = new URLSearchParams({ from })
  if (opts?.staleOk) params.set('stale_ok', '1')
  const url = `/api/series/${encodeURIComponent(ticker)}?${params}`
  try {
    const res = await fetchSeriesQueued(url)
    if (!res.ok) return null
    const json = await res.json()
    const bars = parseOhlcBars(json)
    if (bars && bars.length >= 30) {
      ohlcSessionCache.set(ticker, { at: Date.now(), bars })
      return bars.filter((b) => b.t >= fromTs)
    }
    return null
  } catch {
    return null
  }
}

/** ~2y daily OHLC for background pattern scans (smaller payload than full history). */
export function patternScanFromIso(): string {
  return rangeToFromIso('2y')
}

export async function fetchDeskOhlcForPatternScan(symbol: string): Promise<OhlcBar[] | null> {
  return fetchDeskOhlc(symbol, patternScanFromIso(), { staleOk: true })
}

const OHLC_SESSION_MS = 45 * 60 * 1000
const ohlcSessionCache = new Map<string, { at: number; bars: OhlcBar[] }>()

/** Intraday OHLC for desk chart display (patterns still use daily). */
export async function fetchDeskIntraday(
  symbol: string,
  interval: string,
  fromTs: number,
  toTs: number,
): Promise<{ bars: OhlcBar[]; meta: DeskSeriesMeta } | null> {
  const ticker = /\.AX$/i.test(symbol) ? symbol.replace(/\.AX$/i, '') : symbol
  const params = new URLSearchParams({
    interval,
    from_ts: String(Math.floor(fromTs)),
    to_ts: String(Math.floor(toTs)),
  })
  const url = `/api/series/${encodeURIComponent(ticker)}?${params}`
  try {
    const res = await fetchSeriesQueued(url)
    if (!res.ok) return null
    const json = await res.json()
    const bars = parseOhlcBars(json)
    if (!bars || bars.length < 5) return null
    const meta = (json.meta || {}) as DeskSeriesMeta
    return { bars, meta }
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

/** Wilder RSI(14). Returns null if not enough bars. */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) avgGain += d
    else avgLoss -= d
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return Math.round((100 - 100 / (1 + rs)) * 10) / 10
}

const CACHE_KEY = 'asx-live-perf-v7-minerals'
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
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, provider: 'eodhd' }))
  } catch {
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('asx-live-')) localStorage.removeItem(k)
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, provider: 'eodhd' }))
    } catch {
      // ignore
    }
  }
}
