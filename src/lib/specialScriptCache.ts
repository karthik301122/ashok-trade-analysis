export type ScriptScanHit = {
  patternId: string
  startT: number
  endT: number
}

export type TickerScriptScanCache = {
  updatedAt: number
  hits: ScriptScanHit[]
}

export type ScriptScanRow = {
  ticker: string
  name: string
  sector: string
  industry: string
  rs: number
  relativeVolume: number
  rsi: number
  m3: number
  startT: number
  endT: number
}

const KEY = 'asx-special-script-v1'
const MAX = 4000

function readAll(): Record<string, TickerScriptScanCache> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, TickerScriptScanCache>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(all: Record<string, TickerScriptScanCache>) {
  const trimmed = Object.fromEntries(
    Object.entries(all)
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX),
  )
  localStorage.setItem(KEY, JSON.stringify(trimmed))
}

export function getTickerScriptScan(ticker: string): TickerScriptScanCache | null {
  return readAll()[ticker.toUpperCase()] ?? null
}

export function setTickerScriptScan(ticker: string, hits: ScriptScanHit[]) {
  setManyTickerScriptScan({ [ticker]: hits })
}

export function setManyTickerScriptScan(
  entries: Record<string, ScriptScanHit[]>,
  updatedAt = Date.now(),
) {
  if (!Object.keys(entries).length) return
  const all = readAll()
  for (const [ticker, hits] of Object.entries(entries)) {
    all[ticker.toUpperCase()] = { updatedAt, hits }
  }
  writeAll(all)
}

export function aggregateScriptHits(
  stocks: Array<{
    ticker: string
    name: string
    sector: string
    industry: string
    rs: number
    relativeVolume: number
    rsi: number
    m3: number
  }>,
  patternId: string,
): ScriptScanRow[] {
  const all = readAll()
  const out: ScriptScanRow[] = []
  for (const s of stocks) {
    const cache = all[s.ticker.toUpperCase()]
    const hit = cache?.hits.find((h) => h.patternId === patternId)
    if (!hit) continue
    out.push({
      ticker: s.ticker,
      name: s.name,
      sector: s.sector,
      industry: s.industry,
      rs: s.rs,
      relativeVolume: s.relativeVolume,
      rsi: s.rsi,
      m3: s.m3,
      startT: hit.startT,
      endT: hit.endT,
    })
  }
  return out.sort((a, b) => b.rs - a.rs)
}

/** Hit counts per pattern id — single localStorage read. */
export function scriptHitCounts(
  stocks: Array<{ ticker: string }>,
): Map<string, number> {
  const all = readAll()
  const counts = new Map<string, number>()
  for (const s of stocks) {
    const cache = all[s.ticker.toUpperCase()]
    if (!cache) continue
    for (const h of cache.hits) {
      counts.set(h.patternId, (counts.get(h.patternId) ?? 0) + 1)
    }
  }
  return counts
}
