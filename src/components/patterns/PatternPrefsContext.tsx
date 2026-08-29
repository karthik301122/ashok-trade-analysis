import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  addCustomPattern,
  loadPatternPrefs,
  removeCustomPattern,
  savePatternPrefs,
  setPatternScanWindow,
  toggleStarredName,
  type PatternPrefs,
} from '../../lib/patternPrefs'
import type { PatternBias } from '../../lib/patterns'
import type { CustomRuleSet } from '../../lib/patterns/customRules'
import type { CandleShapeSpec } from '../../lib/patterns/candleShape'
import type { PatternScanWindow } from '../../lib/patterns/scanWindow'
import {
  clearAllPatternHits,
  getTickerPatternHits,
  setTickerPatternHits,
  type CachedPatternHit,
  type TickerPatternCache,
} from '../../lib/patternHitsCache'
import {
  hasOverviewPatternWatch,
  hasStarredWeeklySpecial,
  mergeOverviewHits,
  resolveOverviewHits,
  resolveSpecialHitsForTicker,
} from '../../lib/overviewPatternHits'
import type { StockMetrics } from '../../data/types'
import { PatternPrefsContext, type PatternPrefsContextValue } from './patternPrefsCtx'

export function PatternPrefsProvider({
  user,
  children,
}: {
  user: string | null
  children: ReactNode
}) {
  const [prefs, setPrefs] = useState<PatternPrefs>(() => loadPatternPrefs(user))
  const [hitsByTicker, setHitsByTicker] = useState<Map<string, TickerPatternCache>>(
    () => new Map(),
  )
  const [hitsScanEpoch, setHitsScanEpoch] = useState(0)

  const clearHitsAndRescan = useCallback(() => {
    clearAllPatternHits()
    setHitsByTicker(new Map())
    setHitsScanEpoch((n) => n + 1)
  }, [])

  // One-time: drop pre-startT caches so Sector Table rescans with start dates.
  useEffect(() => {
    const flag = 'asx-pattern-hits-startT-cleared'
    try {
      if (localStorage.getItem(flag)) return
      clearAllPatternHits()
      setHitsByTicker(new Map())
      setHitsScanEpoch((n) => n + 1)
      localStorage.setItem(flag, '1')
    } catch {
      clearHitsAndRescan()
    }
  }, [clearHitsAndRescan])

  useEffect(() => {
    setPrefs(loadPatternPrefs(user))
  }, [user])

  useEffect(() => {
    savePatternPrefs(user, prefs)
  }, [user, prefs])

  const isStarred = useCallback(
    (name: string) => prefs.starredNames.includes(name),
    [prefs.starredNames],
  )

  const toggleStar = useCallback((name: string) => {
    setPrefs((p) => toggleStarredName(p, name))
  }, [])

  const createCustom = useCallback(
    (input: {
      name: string
      bias: PatternBias
      description: string
      basedOn: string | null
      rules?: CustomRuleSet | null
      candleShape?: CandleShapeSpec | null
      scanScript?: string | null
    }) => {
      setPrefs((p) => addCustomPattern(p, input))
    },
    [],
  )

  const deleteCustom = useCallback((id: string) => {
    setPrefs((p) => removeCustomPattern(p, id))
  }, [])

  const setScanWindow = useCallback((scanWindow: PatternScanWindow) => {
    setPrefs((p) => setPatternScanWindow(p, scanWindow))
  }, [])

  const rememberHits = useCallback(
    (
      ticker: string,
      hits: CachedPatternHit[],
      meta?: { scanWindow?: PatternScanWindow; asOf?: number | null },
    ) => {
      setTickerPatternHits(ticker, hits, meta)
      setHitsByTicker((prev) => {
        const next = new Map(prev)
        next.set(ticker.toUpperCase(), {
          updatedAt: Date.now(),
          hits,
          scanWindow: meta?.scanWindow,
          asOf: meta?.asOf ?? null,
        })
        return next
      })
    },
    [],
  )

  const overviewHitsFor = useCallback(
    (
      ticker: string,
      extras?: {
        stock?: StockMetrics
        indexM3?: number
        universe?: StockMetrics[]
        weeklyVersion?: number
        livermoreVersion?: number
        scriptScanVersion?: number
      },
    ): CachedPatternHit[] => {
      void extras?.weeklyVersion
      void extras?.livermoreVersion
      void extras?.scriptScanVersion
      const key = ticker.toUpperCase()
      const cached = hitsByTicker.get(key) ?? getTickerPatternHits(key)
      const chart = resolveOverviewHits(cached?.hits ?? [], prefs)
      const special = resolveSpecialHitsForTicker(ticker, {
        stock: extras?.stock,
        indexM3: extras?.indexM3,
        universe: extras?.universe,
        weeklyVersion: extras?.weeklyVersion,
        livermoreVersion: extras?.livermoreVersion,
        scriptScanVersion: extras?.scriptScanVersion,
      })
      return mergeOverviewHits(chart, special)
    },
    [hitsByTicker, prefs],
  )

  const starredHitsFor = overviewHitsFor

  const hasOverviewWatch = hasOverviewPatternWatch(prefs)
  const hasStarredWeekly = hasStarredWeeklySpecial(prefs)

  const value = useMemo<PatternPrefsContextValue>(
    () => ({
      prefs,
      isStarred,
      toggleStar,
      createCustom,
      deleteCustom,
      customPatterns: prefs.customPatterns,
      scanWindow: prefs.scanWindow,
      setScanWindow,
      hitsByTicker,
      rememberHits,
      overviewHitsFor,
      starredHitsFor,
      hasOverviewWatch,
      hasStarredWeeklySpecial: hasStarredWeekly,
      hitsScanEpoch,
      clearHitsAndRescan,
    }),
    [
      prefs,
      isStarred,
      toggleStar,
      createCustom,
      deleteCustom,
      hitsByTicker,
      rememberHits,
      overviewHitsFor,
      starredHitsFor,
      hasOverviewWatch,
      hasStarredWeekly,
      setScanWindow,
      hitsScanEpoch,
      clearHitsAndRescan,
    ],
  )

  return (
    <PatternPrefsContext.Provider value={value}>{children}</PatternPrefsContext.Provider>
  )
}
