/**
 * Per-stock pattern alert subscriptions stored in user_prefs.pattern_alert_ids_json.
 * Legacy flat array = global pattern ids (any ticker).
 */

export type PatternAlertWatch = {
  ticker: string
  patternIds: string[]
}

export type PatternAlertPrefsV2 = {
  v: 2
  watches: PatternAlertWatch[]
}

export function normalizeAlertTicker(ticker: string): string {
  return String(ticker).trim().toUpperCase()
}

export function normalizePatternAlertWatches(
  watches: PatternAlertWatch[],
): PatternAlertWatch[] {
  const byTicker = new Map<string, Set<string>>()
  for (const w of watches) {
    const ticker = normalizeAlertTicker(w.ticker)
    if (!ticker) continue
    const set = byTicker.get(ticker) ?? new Set<string>()
    for (const id of w.patternIds ?? []) {
      const pid = String(id).trim()
      if (pid) set.add(pid)
    }
    if (set.size) byTicker.set(ticker, set)
  }
  return [...byTicker.entries()]
    .map(([ticker, ids]) => ({
      ticker,
      patternIds: [...ids].sort(),
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

export function unionPatternIdsFromWatches(watches: PatternAlertWatch[]): string[] {
  const out = new Set<string>()
  for (const w of watches) {
    for (const id of w.patternIds) out.add(id)
  }
  return [...out].sort()
}
