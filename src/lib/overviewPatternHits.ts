import type { CachedPatternHit } from './patternHitsCache'
import type { CustomPattern, PatternPrefs } from './patternPrefs'

export function isDetectableCustom(c: CustomPattern): boolean {
  return Boolean(c.rules?.conditions?.length || c.basedOn)
}

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

/** Map raw scan hits → overview chips (starred + My Patterns with rules/aliases). */
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

export function isStarredOverviewHit(name: string, prefs: PatternPrefs): boolean {
  return prefs.starredNames.includes(name)
}

export function isCustomOverviewHit(name: string, prefs: PatternPrefs): boolean {
  return prefs.customPatterns.some((c) => c.name === name && isDetectableCustom(c))
}
