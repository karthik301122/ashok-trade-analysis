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
