import type { StockMetrics } from '../data/types'
import { PATTERN_CATALOG } from './patterns/catalog'
import type { CachedPatternHit } from './patternHitsCache'
import type { CustomPattern, PatternPrefs } from './patternPrefs'
import type { KarthikPatternId } from './patterns/karthikWeekly'
import {
  isSpecialPatternName,
  specialPatternByName,
  type SpecialPatternDef,
} from './patterns/specialCatalog'
import {
  buildSpecialScanContext,
  evaluateSpecialPattern,
} from './patterns/specialDetect'
import { getTickerWeeklySpecial } from './specialWeeklyCache'

export function isDetectableCustom(c: CustomPattern): boolean {
  return Boolean(c.rules?.conditions?.length || c.basedOn)
}

const CHART_CATALOG_NAMES = new Set(PATTERN_CATALOG.map((p) => p.name))

/** Pattern names we scan for and show chips on the Sector Table overview. */
export function overviewWatchNames(prefs: PatternPrefs): string[] {
  const names = new Set(prefs.starredNames)
  for (const c of prefs.customPatterns) {
    if (isDetectableCustom(c)) names.add(c.name)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
}

export function hasOverviewPatternWatch(prefs: PatternPrefs): boolean {
  return overviewWatchNames(prefs).length > 0
}

/** Chart / My Patterns only — triggers daily OHLC pattern scan (not Special Patterns alone). */
export function hasOverviewChartWatch(prefs: PatternPrefs): boolean {
  if (prefs.customPatterns.some(isDetectableCustom)) return true
  return prefs.starredNames.some(
    (n) => CHART_CATALOG_NAMES.has(n) || prefs.customPatterns.some((c) => c.name === n),
  )
}

/** Starred Special Patterns catalog entries (weekly + snapshot). */
export function starredSpecialPatterns(prefs: PatternPrefs): SpecialPatternDef[] {
  const out: SpecialPatternDef[] = []
  const seen = new Set<string>()
  for (const name of prefs.starredNames) {
    const p = specialPatternByName(name)
    if (p && !seen.has(p.id)) {
      seen.add(p.id)
      out.push(p)
    }
  }
  return out
}

export function hasStarredWeeklySpecial(prefs: PatternPrefs): boolean {
  return starredSpecialPatterns(prefs).some((p) => p.kind === 'weekly')
}

export function hasStarredSnapshotSpecial(prefs: PatternPrefs): boolean {
  return starredSpecialPatterns(prefs).some((p) => p.kind === 'snapshot')
}

/**
 * Special-pattern hits for one ticker from weekly cache + snapshot metrics.
 * Only includes patterns currently starred.
 */
export function resolveStarredSpecialHitsForTicker(
  ticker: string,
  prefs: PatternPrefs,
  opts: {
    stock?: StockMetrics | null
    indexM3?: number
    /** All loaded stocks — used for dollar-volume percentile context */
    universe?: StockMetrics[]
  } = {},
): CachedPatternHit[] {
  const starred = starredSpecialPatterns(prefs)
  if (!starred.length) return []

  const out: CachedPatternHit[] = []
  const seen = new Set<string>()
  const key = ticker.toUpperCase()

  const weeklyCached = getTickerWeeklySpecial(key)
  for (const p of starred) {
    if (p.kind !== 'weekly') continue
    const hit = weeklyCached?.hits.find((h) => h.patternId === (p.id as KarthikPatternId))
    if (!hit || seen.has(p.name)) continue
    out.push({
      name: p.name,
      bias: p.bias,
      endT: hit.weekEndT ?? Math.floor(Date.now() / 1000),
      confidence: 0.85,
    })
    seen.add(p.name)
  }

  const stock = opts.stock
  const indexM3 = opts.indexM3
  if (stock && indexM3 != null && starred.some((p) => p.kind === 'snapshot')) {
    const universe = opts.universe?.length ? opts.universe : [stock]
    const ctx = buildSpecialScanContext(universe, indexM3)
    for (const p of starred) {
      if (p.kind !== 'snapshot' || seen.has(p.name)) continue
      if (!evaluateSpecialPattern(p.id, stock, ctx)) continue
      out.push({
        name: p.name,
        bias: p.bias,
        endT: Math.floor(Date.now() / 1000),
        confidence: 0.8,
      })
      seen.add(p.name)
    }
  }

  return out.sort((a, b) => b.endT - a.endT)
}

/** Map raw chart-scan hits → overview chips (starred + My Patterns with rules/aliases). */
export function resolveOverviewHits(
  cachedHits: CachedPatternHit[],
  prefs: PatternPrefs,
): CachedPatternHit[] {
  const starred = new Set(prefs.starredNames)
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
    // Chart-scan hits never carry Special Pattern names; skip name collisions
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
        endT: h.endT,
        confidence: h.confidence,
      })
      seen.add(alias.name)
    }
  }

  return out.sort((a, b) => b.endT - a.endT)
}

/** Merge chart overview hits with starred Special Pattern hits (dedupe by name). */
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
  return prefs.starredNames.includes(name)
}

export function isCustomOverviewHit(name: string, prefs: PatternPrefs): boolean {
  return prefs.customPatterns.some((c) => c.name === name && isDetectableCustom(c))
}

export function isSpecialOverviewHit(name: string): boolean {
  return isSpecialPatternName(name)
}
