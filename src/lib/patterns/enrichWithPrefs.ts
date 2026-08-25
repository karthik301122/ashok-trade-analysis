import type { CustomPattern, PatternPrefs } from '../patternPrefs'
import { PATTERN_CATALOG } from './catalog'
import type {
  CategorySummary,
  PatternBias,
  PatternCategoryId,
  PatternHit,
  PatternScanRow,
} from './types'

function cloneHit(hit: PatternHit, overrides: Partial<PatternHit>): PatternHit {
  return {
    ...hit,
    ...overrides,
    id: overrides.id ?? `${hit.id}-${overrides.name ?? hit.name}`,
    points: hit.points ? [...hit.points] : undefined,
  }
}

function buildStarredCategory(
  allHits: PatternHit[],
  prefs: PatternPrefs,
): CategorySummary {
  const starred = new Set(prefs.starredNames)
  const customByName = new Map(prefs.customPatterns.map((c) => [c.name, c]))

  const hitByName = new Map<string, PatternHit>()
  for (const h of allHits) {
    const prev = hitByName.get(h.name)
    if (!prev || h.endT > prev.endT) hitByName.set(h.name, h)
  }

  // Resolve custom names that map onto a basedOn detector
  for (const c of prefs.customPatterns) {
    if (!c.basedOn) continue
    const src = hitByName.get(c.basedOn)
    if (!src) continue
    const mapped = cloneHit(src, {
      id: `custom-${c.id}-${src.endT}`,
      category: 'custom',
      name: c.name,
      bias: c.bias,
      note: c.description || `Based on ${c.basedOn}`,
    })
    const prev = hitByName.get(c.name)
    if (!prev || mapped.endT > prev.endT) hitByName.set(c.name, mapped)
  }

  const names = [...starred]
  const rows: PatternScanRow[] = names
    .map((name) => {
      const custom = customByName.get(name)
      const catalog = PATTERN_CATALOG.find((p) => p.name === name)
      const familyBias: PatternBias | 'either' =
        custom?.bias ?? catalog?.familyBias ?? 'either'
      return {
        name,
        familyBias,
        hit: hitByName.get(name) ?? null,
      }
    })
    .sort((a, b) => {
      if (a.hit && !b.hit) return -1
      if (!a.hit && b.hit) return 1
      if (a.hit && b.hit) return b.hit.endT - a.hit.endT
      return a.name.localeCompare(b.name)
    })

  const hits = rows.map((r) => r.hit).filter((h): h is PatternHit => h != null)

  return {
    id: 'starred',
    label: '★ Starred Patterns',
    bullish: hits.filter((h) => h.bias === 'bullish').length,
    bearish: hits.filter((h) => h.bias === 'bearish').length,
    neutral: hits.filter((h) => h.bias === 'neutral').length,
    hits: hits.sort((a, b) => b.endT - a.endT),
    rows,
    analyzed: names.length,
    note:
      names.length === 0
        ? 'Star patterns you like — they appear here and on the Sector Table'
        : undefined,
  }
}

function buildCustomCategory(allHits: PatternHit[], customs: CustomPattern[]): CategorySummary {
  const hitByName = new Map<string, PatternHit>()
  for (const h of allHits) {
    const prev = hitByName.get(h.name)
    if (!prev || h.endT > prev.endT) hitByName.set(h.name, h)
  }

  const rows: PatternScanRow[] = customs.map((c) => {
    let hit: PatternHit | null = null
    if (c.basedOn) {
      const src = hitByName.get(c.basedOn)
      if (src) {
        hit = cloneHit(src, {
          id: `custom-${c.id}-${src.endT}`,
          category: 'custom',
          name: c.name,
          bias: c.bias,
          note: c.description || `Based on ${c.basedOn}`,
        })
      }
    }
    return {
      name: c.name,
      familyBias: c.bias,
      hit,
    }
  })

  rows.sort((a, b) => {
    if (a.hit && !b.hit) return -1
    if (!a.hit && b.hit) return 1
    if (a.hit && b.hit) return b.hit.endT - a.hit.endT
    return a.name.localeCompare(b.name)
  })

  const hits = rows.map((r) => r.hit).filter((h): h is PatternHit => h != null)

  return {
    id: 'custom',
    label: 'My Patterns',
    bullish: hits.filter((h) => h.bias === 'bullish').length,
    bearish: hits.filter((h) => h.bias === 'bearish').length,
    neutral: hits.filter((h) => h.bias === 'neutral').length,
    hits: hits.sort((a, b) => b.endT - a.endT),
    rows,
    analyzed: customs.length,
    note:
      customs.length === 0
        ? 'Create named patterns private to your account'
        : 'Private to you · optional detector from catalog',
  }
}

/** Append Starred + My Patterns categories after a base scan. */
export function enrichScanWithPrefs(
  categories: CategorySummary[],
  prefs: PatternPrefs,
): CategorySummary[] {
  const allHits = categories.flatMap((c) => c.hits)
  const starred = buildStarredCategory(allHits, prefs)
  const custom = buildCustomCategory(allHits, prefs.customPatterns)
  // Keep built-ins first; starred + custom at the bottom
  const core = categories.filter((c) => c.id !== 'starred' && c.id !== 'custom')
  return [...core, starred, custom]
}

export function isStarToggleCategory(id: PatternCategoryId) {
  return id !== 'starred'
}
