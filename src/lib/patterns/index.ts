import { detectCandlesticks } from './candlesticks'
import { detectClassic } from './classic'
import { detectStructure } from './structure'
import { detectVolumeMomentum } from './volume'
import { catalogFor, CATALOG_TOTAL, PATTERN_CATALOG } from './catalog'
import {
  CATEGORY_META,
  type CategorySummary,
  type OhlcBar,
  type PatternCategoryId,
  type PatternHit,
  type PatternScanRow,
} from './types'

export function scanPatterns(bars: OhlcBar[]): {
  hits: PatternHit[]
  categories: CategorySummary[]
  catalogTotal: number
} {
  const candle = detectCandlesticks(bars)
  const classic = detectClassic(bars)
  const structure = detectStructure(bars)
  const volume = detectVolumeMomentum(bars)
  const harmonic: PatternHit[] = []

  const byCat: Record<'candlesticks' | 'classic' | 'structure' | 'harmonic' | 'volume', PatternHit[]> = {
    candlesticks: candle,
    classic,
    structure,
    harmonic,
    volume,
  }

  const categories: CategorySummary[] = CATEGORY_META.map((meta) => {
    const hits = byCat[meta.id]
    const byName = new Map<string, PatternHit>()
    for (const h of hits) {
      const prev = byName.get(h.name)
      if (!prev || h.endT > prev.endT) byName.set(h.name, h)
    }

    const rows: PatternScanRow[] = catalogFor(meta.id).map((def) => ({
      name: def.name,
      familyBias: def.familyBias,
      hit: byName.get(def.name) ?? null,
    }))

    // Sort: hits first (newest), then no-hit alphabetically
    rows.sort((a, b) => {
      if (a.hit && !b.hit) return -1
      if (!a.hit && b.hit) return 1
      if (a.hit && b.hit) return b.hit.endT - a.hit.endT
      return a.name.localeCompare(b.name)
    })

    const bullish = hits.filter((h) => h.bias === 'bullish').length
    const bearish = hits.filter((h) => h.bias === 'bearish').length
    const neutral = hits.filter((h) => h.bias === 'neutral').length

    return {
      id: meta.id,
      label: meta.label,
      bullish,
      bearish,
      neutral,
      hits: hits.sort((a, b) => b.endT - a.endT),
      rows,
      analyzed: catalogFor(meta.id).length,
      note:
        meta.id === 'harmonic'
          ? 'Harmonic geometry engine not active yet — catalog listed, 0 auto hits'
          : undefined,
    }
  })

  return {
    hits: [...candle, ...classic, ...structure, ...volume, ...harmonic],
    categories,
    catalogTotal: CATALOG_TOTAL,
  }
}

export type { CategorySummary, PatternHit, PatternCategoryId, OhlcBar, PatternScanRow }
export { CATEGORY_META, PATTERN_CATALOG, CATALOG_TOTAL }
export { enrichScanWithPrefs } from './enrichWithPrefs'
