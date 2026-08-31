export type PatternScanUploadRow = {
  ticker: string
  patternId: string
  score: number
  confirmed: boolean
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
