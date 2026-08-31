export type PatternScanUploadRow = {
  ticker: string
  patternId: string
  score: number
  confirmed: boolean
}

export async function postPatternScanBatch(
  rows: PatternScanUploadRow[],
): Promise<{ upserted: number; alerts?: { fired?: unknown[] } }> {
  try {
    const res = await fetch('/api/pattern-scan/batch', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows }),
    })
    if (!res.ok) return { upserted: 0 }
    return await res.json()
  } catch {
    return { upserted: 0 }
  }
}
