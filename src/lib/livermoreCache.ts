import {
  livermorePatternMatch,
  type LivermoreScores,
} from './patterns/livermoreScores'

export type LivermoreHit = {
  ticker: string
  name: string
  sector: string
  industry: string
  scores: LivermoreScores
  rs: number
  relativeVolume: number
  from52wHigh: number
  adx: number | null
}

export type TickerLivermoreCache = {
  updatedAt: number
  scores: LivermoreScores
}

const KEY = 'asx-livermore-v1'
const MAX = 800

function readAll(): Record<string, TickerLivermoreCache> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, TickerLivermoreCache>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, TickerLivermoreCache>) {
  const trimmed = Object.fromEntries(
    Object.entries(all)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX),
  )
  localStorage.setItem(KEY, JSON.stringify(trimmed))
}

export function getTickerLivermore(ticker: string): TickerLivermoreCache | null {
  return readAll()[ticker.toUpperCase()] ?? null
}

export function setTickerLivermore(ticker: string, scores: LivermoreScores) {
  const all = readAll()
  all[ticker.toUpperCase()] = { updatedAt: Date.now(), scores }
  writeAll(all)
}

export function allLivermoreRows(
  stocks: Array<{
    ticker: string
    name: string
    sector: string
    industry: string
    rs: number
    relativeVolume: number
    from52wHigh: number
  }>,
): LivermoreHit[] {
  const all = readAll()
  const out: LivermoreHit[] = []
  for (const s of stocks) {
    const row = all[s.ticker.toUpperCase()]
    if (!row) continue
    out.push({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      industry: s.industry,
      scores: row.scores,
      rs: s.rs,
      relativeVolume: s.relativeVolume,
      from52wHigh: s.from52wHigh,
      adx: row.scores.adx,
    })
  }
  return out.sort((a, b) => b.scores.finalScore - a.scores.finalScore)
}

export function aggregateLivermoreHits(
  stocks: Array<{
    ticker: string
    name: string
    sector: string
    industry: string
    rs: number
    relativeVolume: number
    from52wHigh: number
  }>,
  patternId: string,
): LivermoreHit[] {
  return allLivermoreRows(stocks)
    .filter((h) => livermorePatternMatch(patternId, h.scores))
}
