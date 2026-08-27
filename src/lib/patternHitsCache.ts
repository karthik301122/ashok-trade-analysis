import type { PatternBias } from './patterns/types'
import type { PatternScanWindow } from './patterns/scanWindow'

export type CachedPatternHit = {
  name: string
  bias: PatternBias
  /** When the setup began (preferred for display) */
  startT?: number
  /** When the setup completed / last bar of the hit */
  endT: number
  confidence: number
}

export type TickerPatternCache = {
  updatedAt: number
  hits: CachedPatternHit[]
  scanWindow?: PatternScanWindow
  asOf?: number | null
}

const KEY = 'asx-pattern-hits-v3'
const LEGACY_KEYS = ['asx-pattern-hits', 'asx-pattern-hits-v1', 'asx-pattern-hits-v2']

function readAll(): Record<string, TickerPatternCache> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, TickerPatternCache>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, TickerPatternCache>) {
  const entries = Object.entries(all).sort((a, b) => b[1].updatedAt - a[1].updatedAt)
  const trimmed = Object.fromEntries(entries.slice(0, MAX_TICKERS))
  localStorage.setItem(KEY, JSON.stringify(trimmed))
}

const MAX_TICKERS = 800

export function getTickerPatternHits(ticker: string): TickerPatternCache | null {
  return readAll()[ticker.toUpperCase()] ?? null
}

export function setTickerPatternHits(
  ticker: string,
  hits: CachedPatternHit[],
  meta?: { scanWindow?: PatternScanWindow; asOf?: number | null },
) {
  const all = readAll()
  all[ticker.toUpperCase()] = {
    updatedAt: Date.now(),
    hits,
    scanWindow: meta?.scanWindow,
    asOf: meta?.asOf ?? null,
  }
  writeAll(all)
}

export function getManyTickerPatternHits(tickers: string[]): Map<string, TickerPatternCache> {
  const all = readAll()
  const map = new Map<string, TickerPatternCache>()
  for (const t of tickers) {
    const row = all[t.toUpperCase()]
    if (row) map.set(t.toUpperCase(), row)
  }
  return map
}

/** Wipe current + legacy pattern-hit caches so the next scan rewrites with startT. */
export function clearAllPatternHits() {
  try {
    localStorage.removeItem(KEY)
    for (const k of LEGACY_KEYS) localStorage.removeItem(k)
  } catch {
    /* ignore */
  }
}

/** True when a cached row is missing start dates (needs a fresh scan). */
export function cacheMissingStartT(cached: TickerPatternCache): boolean {
  return cached.hits.some((h) => typeof h.startT !== 'number')
}
