import type { KarthikPatternId } from './patterns/karthikWeekly'

export type WeeklySpecialHit = {
  patternId: KarthikPatternId
  ticker: string
  name: string
  sector: string
  industry: string
  rs: number
  relativeVolume: number
  tightness: number | null
  /** Pattern start (oldest week) — preferred for display */
  weekStartT: number | null
  weekEndT: number | null
}

export type TickerWeeklySpecialCache = {
  updatedAt: number
  hits: WeeklySpecialHit[]
}

const KEY = 'asx-karthik-weekly-v2'
const MAX = 4000

function readAll(): Record<string, TickerWeeklySpecialCache> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, TickerWeeklySpecialCache>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, TickerWeeklySpecialCache>) {
  const entries = Object.entries(all).sort((a, b) => b[1].updatedAt - a[1].updatedAt)
  localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(entries.slice(0, MAX))))
}

export function getTickerWeeklySpecial(ticker: string): TickerWeeklySpecialCache | null {
  return readAll()[ticker.toUpperCase()] ?? null
}

export function setTickerWeeklySpecial(ticker: string, hits: WeeklySpecialHit[]) {
  setManyTickerWeeklySpecial({ [ticker]: hits })
}

export function setManyTickerWeeklySpecial(
  entries: Record<string, WeeklySpecialHit[]>,
  updatedAt = Date.now(),
) {
  if (!Object.keys(entries).length) return
  const all = readAll()
  for (const [ticker, hits] of Object.entries(entries)) {
    all[ticker.toUpperCase()] = { updatedAt, hits }
  }
  writeAll(all)
}

export function aggregateWeeklyHits(
  tickers: string[],
  patternId: KarthikPatternId,
): WeeklySpecialHit[] {
  const all = readAll()
  const out: WeeklySpecialHit[] = []
  for (const t of tickers) {
    const row = all[t.toUpperCase()]
    if (!row) continue
    for (const h of row.hits) {
      if (h.patternId === patternId) out.push(h)
    }
  }
  return out.sort((a, b) => (b.weekStartT ?? b.weekEndT ?? 0) - (a.weekStartT ?? a.weekEndT ?? 0))
}

export function countWeeklyHits(tickers: string[], patternId: KarthikPatternId): number {
  return aggregateWeeklyHits(tickers, patternId).length
}
