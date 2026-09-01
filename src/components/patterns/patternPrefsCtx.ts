import { createContext } from 'react'
import type { CustomPattern, PatternPrefs } from '../../lib/patternPrefs'
import type { PatternBias } from '../../lib/patterns'
import type { CustomRuleSet } from '../../lib/patterns/customRules'
import type { CandleShapeSpec } from '../../lib/patterns/candleShape'
import type { DrawnPatternSpec } from '../../lib/patterns/drawnPattern'
import type { ChartIntervalPref } from '../../lib/chartInterval'
import type { PatternScanWindow } from '../../lib/patterns/scanWindow'
import type { CachedPatternHit, TickerPatternCache } from '../../lib/patternHitsCache'
import type { StockMetrics } from '../../data/types'

export type PatternPrefsContextValue = {
  prefs: PatternPrefs
  isStarred: (name: string) => boolean
  toggleStar: (name: string) => void
  createCustom: (input: {
    name: string
    bias: PatternBias
    description: string
    basedOn: string | null
    rules?: CustomRuleSet | null
    candleShape?: CandleShapeSpec | null
    scanScript?: string | null
    drawnSpec?: DrawnPatternSpec | null
  }) => void
  updateCustom: (
    id: string,
    input: {
      name: string
      bias: PatternBias
      description: string
      basedOn: string | null
      rules?: CustomRuleSet | null
      candleShape?: CandleShapeSpec | null
      scanScript?: string | null
      drawnSpec?: DrawnPatternSpec | null
    },
  ) => void
  deleteCustom: (id: string) => void
  customPatterns: CustomPattern[]
  scanWindow: PatternScanWindow
  setScanWindow: (window: PatternScanWindow) => void
  chartInterval: ChartIntervalPref
  setChartInterval: (interval: ChartIntervalPref) => void
  /** Live map of ticker → last scan hits (memory + localStorage) */
  hitsByTicker: Map<string, TickerPatternCache>
  rememberHits: (
    ticker: string,
    hits: CachedPatternHit[],
    meta?: { scanWindow?: PatternScanWindow; asOf?: number | null },
  ) => void
  /** Hits for chart patterns (starred) + all specials + My Patterns on Sector Table */
  overviewHitsFor: (
    ticker: string,
    extras?: {
      stock?: StockMetrics
      indexM3?: number
      universe?: StockMetrics[]
      /** Bump when weekly special cache updates */
      weeklyVersion?: number
    },
  ) => CachedPatternHit[]
  /** @deprecated use overviewHitsFor */
  starredHitsFor: (
    ticker: string,
    extras?: {
      stock?: StockMetrics
      indexM3?: number
      universe?: StockMetrics[]
      weeklyVersion?: number
    },
  ) => CachedPatternHit[]
  hasOverviewWatch: boolean
  /** True when any starred Special Pattern is weekly (needs OHLC scan) */
  hasStarredWeeklySpecial: boolean
  /** Bumps when hit cache is wiped so industry scan re-runs immediately */
  hitsScanEpoch: number
  /** Clear pattern-hit cache (disk + memory) and force a fresh scan */
  clearHitsAndRescan: () => void
}

export const PatternPrefsContext = createContext<PatternPrefsContextValue | null>(null)
