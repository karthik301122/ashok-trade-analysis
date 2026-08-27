import { detectCandlesticks } from './candlesticks'
import { detectClassic } from './classic'
import { detectStructure } from './structure'
import { detectVolumeMomentum } from './volume'
import { catalogFor, CATALOG_TOTAL, PATTERN_CATALOG } from './catalog'
import {
  DEFAULT_PATTERN_SCAN_WINDOW,
  filterHitsByWindow,
  type PatternScanWindow,
} from './scanWindow'
import {
  CATEGORY_META,
  type CategorySummary,
  type OhlcBar,
  type PatternBias,
  type PatternCategoryId,
  type PatternHit,
  type PatternScanRow,
} from './types'

export type ScanPatternsOptions = {
  /** Only count hits ending within this window from the latest bar. */
  window?: PatternScanWindow
}

function applyWindow(hits: PatternHit[], bars: OhlcBar[], window: PatternScanWindow): PatternHit[] {
  if (!bars.length) return hits
  const asOf = bars[bars.length - 1].t
  return filterHitsByWindow(hits, window, asOf)
}

export function scanPatterns(
  bars: OhlcBar[],
  opts: ScanPatternsOptions = {},
): {
  hits: PatternHit[]
  categories: CategorySummary[]
  catalogTotal: number
  window: PatternScanWindow
  asOf: number | null
} {
  const window = opts.window ?? DEFAULT_PATTERN_SCAN_WINDOW
  const asOf = bars.length ? bars[bars.length - 1].t : null

  const candle = applyWindow(detectCandlesticks(bars), bars, window)
  const classic = applyWindow(detectClassic(bars), bars, window)
  const structure = applyWindow(detectStructure(bars), bars, window)
  const volume = applyWindow(detectVolumeMomentum(bars), bars, window)

  const byCat: Record<
    'candlesticks' | 'classic' | 'structure' | 'volume',
    PatternHit[]
  > = {
    candlesticks: candle,
    classic,
    structure,
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
    }
  })

  return {
    hits: [...candle, ...classic, ...structure, ...volume],
    categories,
    catalogTotal: CATALOG_TOTAL,
    window,
    asOf,
  }
}

export type { CategorySummary, PatternHit, PatternCategoryId, PatternBias, OhlcBar, PatternScanRow }
export { CATEGORY_META, PATTERN_CATALOG, CATALOG_TOTAL }
export { enrichScanWithPrefs } from './enrichWithPrefs'
export {
  DEFAULT_PATTERN_SCAN_WINDOW,
  PATTERN_SCAN_WINDOWS,
  filterBarsByWindow,
  filterHitsByWindow,
  hitInWindow,
  parsePatternScanWindow,
  scanWindowLabel,
  tradingViewRangeForWindow,
  type PatternScanWindow,
} from './scanWindow'
export {
  detectAllCustomRules,
  detectCustomRule,
  describeRuleSet,
  newCondition,
  RULE_METRIC_OPTIONS,
  RULE_OP_OPTIONS,
  MAX_CONDITIONS,
  type CustomRuleSet,
  type RuleCondition,
  type RuleMetric,
  type RuleOp,
} from './customRules'
export {
  CANDLE_SHAPE_PRESETS,
  candlePresetById,
  defaultCandleGeometry,
  defaultCandleShape,
  describeCandleShape,
  detectAllCandleShapes,
  detectCandleShape,
  normalizeCandleShape,
  type BodyPosition,
  type CandleContext,
  type CandleDirection,
  type CandleGeometry,
  type CandlePreset,
  type CandleShapeSpec,
  type CandleTimeframe,
} from './candleShape'
export {
  SCANSCRIPT_EXAMPLE,
  SCANSCRIPT_NAME,
  compileScanScript,
  describeScanScript,
  rulesFromCustom,
  validateScanScript,
} from './scanScript'
