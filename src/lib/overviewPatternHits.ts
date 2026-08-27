import type { StockMetrics } from '../data/types'
import { getTickerLivermore } from './livermoreCache'
import { PATTERN_CATALOG } from './patterns/catalog'
import type { CachedPatternHit } from './patternHitsCache'
import type { CustomPattern, PatternPrefs } from './patternPrefs'
import type { KarthikPatternId } from './patterns/karthikWeekly'
import { livermorePatternMatch } from './patterns/livermoreScores'
import {
  isSpecialPatternName,
  SPECIAL_PATTERN_CATALOG,
  type SpecialPatternDef,
} from './patterns/specialCatalog'
import {
  buildSpecialScanContext,
  evaluateSpecialPattern,
} from './patterns/specialDetect'
import { getTickerWeeklySpecial } from './specialWeeklyCache'

export function isDetectableCustom(c: CustomPattern): boolean {
  return Boolean(
    c.rules?.conditions?.length || c.basedOn || c.candleShape || c.scanScript?.trim(),
  )
}

const CHART_CATALOG_NAMES = new Set(PATTERN_CATALOG.map((p) => p.name))

/** All desk special patterns (weekly + snapshot + Livermore) — always on Sector Table. */
export function catalogSpecialPatterns(): SpecialPatternDef[] {
  return SPECIAL_PATTERN_CATALOG
}

/** Pattern names from stars + My Patterns (chart catalog only). */
export function overviewWatchNames(prefs: PatternPrefs): string[] {
  const names = new Set<string>()
  for (const name of prefs.starredNames) {
    if (!isSpecialPatternName(name)) names.add(name)
  }
  for (const c of prefs.customPatterns) {
    if (isDetectableCustom(c)) names.add(c.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function hasSpecialPatternDeskWatch(): boolean {
  return SPECIAL_PATTERN_CATALOG.length > 0
}

export function hasOverviewPatternWatch(prefs: PatternPrefs): boolean {
  return hasSpecialPatternDeskWatch() || hasOverviewChartWatch(prefs)
}

/** Chart / My Patterns only — triggers daily OHLC pattern scan (not specials). */
export function hasOverviewChartWatch(prefs: PatternPrefs): boolean {
  if (prefs.customPatterns.some(isDetectableCustom)) return true
  return prefs.starredNames.some(
    (n) => !isSpecialPatternName(n) && CHART_CATALOG_NAMES.has(n),
  )
}

/** @deprecated All catalog specials are always on the desk; returns full catalog. */
export function starredSpecialPatterns(_prefs?: PatternPrefs): SpecialPatternDef[] {
  return SPECIAL_PATTERN_CATALOG
}

export function hasStarredWeeklySpecial(_prefs?: PatternPrefs): boolean {
  return SPECIAL_PATTERN_CATALOG.some((p) => p.kind === 'weekly')
}

export function hasLivermoreSpecialScan(): boolean {
  return SPECIAL_PATTERN_CATALOG.some((p) => p.kind === 'livermore')
}

export function hasStarredSnapshotSpecial(_prefs?: PatternPrefs): boolean {
  return SPECIAL_PATTERN_CATALOG.some((p) => p.kind === 'snapshot')
}

/**
 * Special-pattern hits for one ticker (weekly cache + snapshot metrics + Livermore).
 * All catalog specials are shown on the Sector Table without starring.
 */
export function resolveSpecialHitsForTicker(
  ticker: string,
  opts: {
    stock?: StockMetrics | null
    indexM3?: number
    universe?: StockMetrics[]
    weeklyVersion?: number
    livermoreVersion?: number
  } = {},
): CachedPatternHit[] {
  void opts.weeklyVersion
  void opts.livermoreVersion

  const out: CachedPatternHit[] = []
  const seen = new Set<string>()
  const key = ticker.toUpperCase()
  const now = Math.floor(Date.now() / 1000)

  const weeklyCached = getTickerWeeklySpecial(key)
  for (const p of SPECIAL_PATTERN_CATALOG) {
    if (p.kind !== 'weekly') continue
    const hit = weeklyCached?.hits.find((h) => h.patternId === (p.id as KarthikPatternId))
    if (!hit || seen.has(p.name)) continue
    out.push({
      name: p.name,
      bias: p.bias,
      startT: hit.weekStartT ?? hit.weekEndT ?? now,
      endT: hit.weekEndT ?? hit.weekStartT ?? now,
      confidence: 0.85,
    })
    seen.add(p.name)
  }

  const stock = opts.stock
  const indexM3 = opts.indexM3
  if (stock && indexM3 != null) {
    const universe = opts.universe?.length ? opts.universe : [stock]
    const ctx = buildSpecialScanContext(universe, indexM3)
    for (const p of SPECIAL_PATTERN_CATALOG) {
      if (p.kind !== 'snapshot' || seen.has(p.name)) continue
      if (!evaluateSpecialPattern(p.id, stock, ctx)) continue
      out.push({
        name: p.name,
        bias: p.bias,
        startT: now - 21 * 86400,
        endT: now,
        confidence: 0.8,
      })
      seen.add(p.name)
    }
  }

  const lm = getTickerLivermore(key)
  if (lm?.scores) {
    for (const p of SPECIAL_PATTERN_CATALOG) {
      if (p.kind !== 'livermore' || seen.has(p.name)) continue
      if (!livermorePatternMatch(p.id, lm.scores)) continue
      out.push({
        name: p.name,
        bias: p.bias,
        startT: now - 30 * 86400,
        endT: now,
        confidence: lm.scores.finalScore / 100,
      })
      seen.add(p.name)
    }
  }

  return out.sort((a, b) => b.endT - a.endT)
}

/** @deprecated Use resolveSpecialHitsForTicker */
export function resolveStarredSpecialHitsForTicker(
  ticker: string,
  _prefs: PatternPrefs,
  opts: {
    stock?: StockMetrics | null
    indexM3?: number
    universe?: StockMetrics[]
    weeklyVersion?: number
    livermoreVersion?: number
  } = {},
): CachedPatternHit[] {
  return resolveSpecialHitsForTicker(ticker, opts)
}

/** Map raw chart-scan hits → overview chips (starred chart + My Patterns). */
export function resolveOverviewHits(
  cachedHits: CachedPatternHit[],
  prefs: PatternPrefs,
): CachedPatternHit[] {
  const starred = new Set(
    prefs.starredNames.filter((n) => !isSpecialPatternName(n)),
  )
  const watchedCustom = new Set(
    prefs.customPatterns.filter(isDetectableCustom).map((c) => c.name),
  )
  const customByBasedOn = new Map(
    prefs.customPatterns
      .filter((c) => c.basedOn && watchedCustom.has(c.name))
      .map((c) => [c.basedOn as string, c]),
  )

  const out: CachedPatternHit[] = []
  const seen = new Set<string>()

  for (const h of cachedHits) {
    if (isSpecialPatternName(h.name)) continue
    if (starred.has(h.name) && !seen.has(h.name)) {
      out.push(h)
      seen.add(h.name)
    }
    if (watchedCustom.has(h.name) && !seen.has(h.name)) {
      out.push(h)
      seen.add(h.name)
    }
    const alias = customByBasedOn.get(h.name)
    if (alias && !seen.has(alias.name)) {
      out.push({
        name: alias.name,
        bias: alias.bias,
        startT: h.startT ?? h.endT,
        endT: h.endT,
        confidence: h.confidence,
      })
      seen.add(alias.name)
    }
  }

  return out.sort((a, b) => b.endT - a.endT)
}

/** Merge chart overview hits with special pattern hits (dedupe by name). */
export function mergeOverviewHits(
  chartHits: CachedPatternHit[],
  specialHits: CachedPatternHit[],
): CachedPatternHit[] {
  const seen = new Set(chartHits.map((h) => h.name))
  const merged = [...chartHits]
  for (const h of specialHits) {
    if (seen.has(h.name)) continue
    seen.add(h.name)
    merged.push(h)
  }
  return merged.sort((a, b) => b.endT - a.endT)
}

export function isStarredOverviewHit(name: string, prefs: PatternPrefs): boolean {
  if (isSpecialPatternName(name)) return false
  return prefs.starredNames.includes(name)
}

export function isCustomOverviewHit(name: string, prefs: PatternPrefs): boolean {
  return prefs.customPatterns.some((c) => c.name === name && isDetectableCustom(c))
}

export function isSpecialOverviewHit(name: string): boolean {
  return isSpecialPatternName(name)
}

/** Prefer pattern start for UI dates. */
export function hitDisplayStartT(h: { startT?: number; endT: number }): number {
  return h.startT ?? h.endT
}
