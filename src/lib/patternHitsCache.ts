import type { PatternBias } from './patterns/types'

export type CachedPatternHit = {
  name: string
  bias: PatternBias
  endT: number
  confidence: number
}

export type TickerPatternCache = {
  updatedAt: number
  hits: CachedPatternHit[]
}

const KEY = 'asx-pattern-hits-v1'
const MAX_TICKERS = 800

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

export function getTickerPatternHits(ticker: string): TickerPatternCache | null {
  return readAll()[ticker.toUpperCase()] ?? null
}

export function setTickerPatternHits(ticker: string, hits: CachedPatternHit[]) {
  const all = readAll()
  all[ticker.toUpperCase()] = { updatedAt: Date.now(), hits }
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
