export type PatternScanUploadRow = {
  ticker: string
  patternId: string
  score: number
  confirmed: boolean
}

export type PatternScanStateRow = {
  ticker: string
  patternId: string
  score: number
  confirmed: boolean
  updatedAt: number
}

export async function postPatternScanBatch(
  rows: PatternScanUploadRow[],
): Promise<{ upserted: number; fired?: number }> {
  if (!rows.length) return { upserted: 0 }
  const CHUNK = 400
  let upserted = 0
  let fired = 0
  try {
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK)
      const res = await fetch('/api/pattern-scan/batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: chunk }),
      })
      if (!res.ok) continue
      const json = await res.json()
      upserted += json.upserted ?? 0
      fired += json.fired ?? 0
    }
    return { upserted, fired }
  } catch {
    return { upserted: 0 }
  }
}

/** Latest scan scores for one ticker (UI hit % badges). */
export async function fetchPatternScanState(
  ticker: string,
  minScore = 0,
): Promise<PatternScanStateRow[]> {
  const t = ticker.trim().toUpperCase()
  if (!t) return []
  try {
    const qs = new URLSearchParams({
      ticker: t,
      minScore: String(minScore),
    })
    const res = await fetch(`/api/pattern-scan/state?${qs}`, { credentials: 'include' })
    if (!res.ok) return []
    const json = (await res.json()) as { rows?: PatternScanStateRow[] }
    return Array.isArray(json.rows) ? json.rows : []
  } catch {
    return []
  }
}

/** All tickers currently scoring at/above minScore for one pattern. */
export async function fetchPatternScanByPattern(
  patternId: string,
  minScore = 60,
): Promise<PatternScanStateRow[]> {
  const pid = patternId.trim()
  if (!pid) return []
  try {
    const qs = new URLSearchParams({
      patternId: pid,
      minScore: String(minScore),
    })
    const res = await fetch(`/api/pattern-scan/state?${qs}`, { credentials: 'include' })
    if (!res.ok) return []
    const json = (await res.json()) as { rows?: PatternScanStateRow[] }
    return Array.isArray(json.rows) ? json.rows : []
  } catch {
    return []
  }
}

export type ServerPatternHit = {
  patternId: string
  patternName: string
  bias: string
  ticker: string
  name: string
  sector: string
  industry: string
  rs: number
  m3: number
  relativeVolume: number
  rsi: number
  lastPrice: number
  score: number
  confirmed: boolean
  kind?: string
}

export type ServerPatternHitsPayload = {
  asOf: string
  builtAt: number
  universe: string
  hits: ServerPatternHit[]
  counts: Record<string, number>
}

/** Identical pattern results computed server-side (ASX200 early, then full universe). */
export async function fetchServerPatternHits(
  asOf = 'latest',
): Promise<ServerPatternHitsPayload | null> {
  try {
    const qs = new URLSearchParams({ as_of: asOf })
    const res = await fetch(`/api/patterns/hits?${qs}`, { credentials: 'include' })
    if (!res.ok) return null
    const json = (await res.json()) as Partial<ServerPatternHitsPayload>
    if (!json?.asOf || !Array.isArray(json.hits)) return null
    return {
      asOf: json.asOf,
      builtAt: Number(json.builtAt) || 0,
      universe: String(json.universe || 'asx200'),
      hits: json.hits as ServerPatternHit[],
      counts: (json.counts && typeof json.counts === 'object' ? json.counts : {}) as Record<
        string,
        number
      >,
    }
  } catch {
    return null
  }
}

export async function fetchPatternPrefsFromServer(): Promise<{
  starredNames: string[]
  customPatterns: unknown[]
  scanWindow: string
  chartInterval: string
} | null> {
  try {
    const res = await fetch('/api/patterns/prefs', { credentials: 'include' })
    if (!res.ok) return null
    const json = await res.json()
    return json?.prefs ?? null
  } catch {
    return null
  }
}

export async function savePatternPrefsToServer(prefs: {
  starredNames: string[]
  customPatterns: unknown[]
  scanWindow: string
  chartInterval: string
}): Promise<boolean> {
  try {
    const res = await fetch('/api/patterns/prefs', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefs }),
    })
    return res.ok
  } catch {
    return false
  }
}
