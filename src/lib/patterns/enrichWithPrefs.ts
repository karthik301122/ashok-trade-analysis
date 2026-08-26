import type { CustomPattern, PatternPrefs } from '../patternPrefs'
import { getTickerWeeklySpecial } from '../specialWeeklyCache'
import { PATTERN_CATALOG } from './catalog'
import { detectCandleShape } from './candleShape'
import { detectCustomRule } from './customRules'
import {
  filterHitsByWindow,
  type PatternScanWindow,
} from './scanWindow'
import { specialPatternByName } from './specialCatalog'
import type { KarthikPatternId } from './karthikWeekly'
import type {
  CategorySummary,
  OhlcBar,
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
  bars: OhlcBar[] | null,
  window: PatternScanWindow,
  ticker: string | null,
): CategorySummary {
  const starred = new Set(prefs.starredNames)
  const customByName = new Map(prefs.customPatterns.map((c) => [c.name, c]))

  const hitByName = new Map<string, PatternHit>()
  for (const h of allHits) {
    const prev = hitByName.get(h.name)
    if (!prev || h.endT > prev.endT) hitByName.set(h.name, h)
  }

  for (const c of prefs.customPatterns) {
    if (!starred.has(c.name)) continue
    const hit = resolveCustomHit(c, hitByName, bars, window)
    if (!hit) continue
    const prev = hitByName.get(c.name)
    if (!prev || hit.endT > prev.endT) hitByName.set(c.name, hit)
  }

  if (ticker) {
    const weekly = getTickerWeeklySpecial(ticker)
    for (const name of starred) {
      const sp = specialPatternByName(name)
      if (!sp || sp.kind !== 'weekly') continue
      const wh = weekly?.hits.find((h) => h.patternId === (sp.id as KarthikPatternId))
      if (!wh) continue
      const startT = wh.weekStartT ?? wh.weekEndT ?? 0
      const endT = wh.weekEndT ?? startT
      const asOf = bars?.length ? bars[bars.length - 1].t : endT
      const hit: PatternHit = {
        id: `special-${sp.id}-${startT}`,
        category: 'starred',
        name: sp.name,
        bias: sp.bias,
        startT,
        endT: startT,
        confidence: 0.85,
        note: 'Special / weekly pattern',
      }
      const filtered = filterHitsByWindow([hit], window, asOf)
      if (filtered[0]) hitByName.set(name, filtered[0])
    }
  }

  const names = [...starred]
  const rows: PatternScanRow[] = names
    .map((name) => {
      const custom = customByName.get(name)
      const catalog = PATTERN_CATALOG.find((p) => p.name === name)
      const special = specialPatternByName(name)
      const familyBias: PatternBias | 'either' =
        custom?.bias ?? special?.bias ?? catalog?.familyBias ?? 'either'
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
        ? 'Star chart or Special Patterns — they appear here and on the Sector Table'
        : undefined,
  }
}

function resolveCustomHit(
  c: CustomPattern,
  hitByName: Map<string, PatternHit>,
  bars: OhlcBar[] | null,
  window: PatternScanWindow,
): PatternHit | null {
  const asOf = bars?.length ? bars[bars.length - 1].t : null
  let hit: PatternHit | null = null
  if (c.candleShape && bars?.length) {
    hit = detectCandleShape(bars, {
      id: c.id,
      name: c.name,
      bias: c.bias,
      description: c.description,
      candleShape: c.candleShape,
    })
  } else if (c.rules?.conditions?.length && bars?.length) {
    hit = detectCustomRule(bars, {
      id: c.id,
      name: c.name,
      bias: c.bias,
      description: c.description,
      rules: c.rules,
    })
  } else if (c.basedOn) {
    const src = hitByName.get(c.basedOn)
    if (!src) return null
    hit = cloneHit(src, {
      id: `custom-${c.id}-${src.endT}`,
      category: 'custom',
      name: c.name,
      bias: c.bias,
      note: c.description || `Based on ${c.basedOn}`,
    })
  }
  if (!hit || asOf == null) return hit
  const filtered = filterHitsByWindow([hit], window, asOf)
  return filtered[0] ?? null
}

function buildCustomCategory(
  allHits: PatternHit[],
  customs: CustomPattern[],
  bars: OhlcBar[] | null,
  window: PatternScanWindow,
): CategorySummary {
  const hitByName = new Map<string, PatternHit>()
  for (const h of allHits) {
    const prev = hitByName.get(h.name)
    if (!prev || h.endT > prev.endT) hitByName.set(h.name, h)
  }

  const rows: PatternScanRow[] = customs.map((c) => {
    const hit = resolveCustomHit(c, hitByName, bars, window)
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
        ? 'Create private rules, candle shapes, or aliases — only you see them'
        : 'Private to you · rules, candle shapes, or catalog aliases',
  }
}

/** Append Starred + My Patterns categories after a base scan. Pass bars to evaluate private rules. */
export function enrichScanWithPrefs(
  categories: CategorySummary[],
  prefs: PatternPrefs,
  bars: OhlcBar[] | null = null,
  window: PatternScanWindow = prefs.scanWindow,
  ticker: string | null = null,
): CategorySummary[] {
  const allHits = categories.flatMap((c) => c.hits)
  const starred = buildStarredCategory(allHits, prefs, bars, window, ticker)
  const custom = buildCustomCategory(allHits, prefs.customPatterns, bars, window)
  const core = categories.filter((c) => c.id !== 'starred' && c.id !== 'custom')
  return [...core, starred, custom]
}

export function isStarToggleCategory(id: PatternCategoryId) {
  return id !== 'starred'
}
