/**
 * Rank multi-pattern hits strongest-first (same idea as pattern combo alerts):
 * confirmed → higher score → newer endT → name.
 */

export type RankablePatternHit = {
  name?: string
  confidence?: number
  /** 0–100 alert / scan score when available */
  score?: number
  confirmed?: boolean
  endT?: number
}

const CONFIRMED_CONFIDENCE = 0.85

/** Normalize to 0–100 for ranking. */
export function patternHitScore(h: RankablePatternHit): number {
  if (typeof h.score === 'number' && Number.isFinite(h.score)) {
    return Math.max(0, Math.min(100, h.score))
  }
  if (typeof h.confidence === 'number' && Number.isFinite(h.confidence)) {
    const c = h.confidence
    // confidence is usually 0–1; allow 0–100 if already percent-like
    return Math.max(0, Math.min(100, c <= 1 ? c * 100 : c))
  }
  return 0
}

export function patternHitConfirmed(h: RankablePatternHit): boolean {
  if (typeof h.confirmed === 'boolean') return h.confirmed
  if (typeof h.score === 'number' && h.score >= 85) return true
  if (typeof h.confidence === 'number') {
    const c = h.confidence
    const pct = c <= 1 ? c : c / 100
    return pct >= CONFIRMED_CONFIDENCE
  }
  return false
}

/** Comparator: confirmed first, then score DESC, then endT DESC, then name. */
export function comparePatternHitsByScore(a: RankablePatternHit, b: RankablePatternHit): number {
  const ac = patternHitConfirmed(a) ? 1 : 0
  const bc = patternHitConfirmed(b) ? 1 : 0
  if (bc !== ac) return bc - ac
  const as = patternHitScore(a)
  const bs = patternHitScore(b)
  if (bs !== as) return bs - as
  const ae = Number(a.endT ?? 0)
  const be = Number(b.endT ?? 0)
  if (be !== ae) return be - ae
  return String(a.name ?? '').localeCompare(String(b.name ?? ''))
}

export function rankPatternHitsByScore<T extends RankablePatternHit>(hits: T[]): T[] {
  return [...hits].sort(comparePatternHitsByScore)
}
