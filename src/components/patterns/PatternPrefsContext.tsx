import {
  createContext,
  useCallback,
  useContext,
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
  type CustomPattern,
  type PatternPrefs,
} from '../../lib/patternPrefs'
import type { PatternBias } from '../../lib/patterns'
import type { CustomRuleSet } from '../../lib/patterns/customRules'
import type { PatternScanWindow } from '../../lib/patterns/scanWindow'
import {
  getManyTickerPatternHits,
  getTickerPatternHits,
  setTickerPatternHits,
  type CachedPatternHit,
  type TickerPatternCache,
} from '../../lib/patternHitsCache'
import {
  hasOverviewPatternWatch,
  resolveOverviewHits,
} from '../../lib/overviewPatternHits'

type Ctx = {
  prefs: PatternPrefs
  isStarred: (name: string) => boolean
  toggleStar: (name: string) => void
  createCustom: (input: {
    name: string
    bias: PatternBias
    description: string
    basedOn: string | null
    rules?: CustomRuleSet | null
  }) => void
  deleteCustom: (id: string) => void
  customPatterns: CustomPattern[]
  scanWindow: PatternScanWindow
  setScanWindow: (window: PatternScanWindow) => void
  /** Live map of ticker → last scan hits (memory + localStorage) */
  hitsByTicker: Map<string, TickerPatternCache>
  rememberHits: (
    ticker: string,
    hits: CachedPatternHit[],
    meta?: { scanWindow?: PatternScanWindow; asOf?: number | null },
  ) => void
  /** Hits for starred + My Patterns on Sector Table overview */
  overviewHitsFor: (ticker: string) => CachedPatternHit[]
  /** @deprecated use overviewHitsFor */
  starredHitsFor: (ticker: string) => CachedPatternHit[]
  hasOverviewWatch: boolean
}

const PatternPrefsContext = createContext<Ctx | null>(null)

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
    (ticker: string): CachedPatternHit[] => {
      const key = ticker.toUpperCase()
      const cached = hitsByTicker.get(key) ?? getTickerPatternHits(key)
      if (!cached?.hits?.length) return []
      return resolveOverviewHits(cached.hits, prefs)
    },
    [hitsByTicker, prefs],
  )

  const starredHitsFor = overviewHitsFor

  const hasOverviewWatch = hasOverviewPatternWatch(prefs)

  const value = useMemo<Ctx>(
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
      setScanWindow,
    ],
  )

  return (
    <PatternPrefsContext.Provider value={value}>{children}</PatternPrefsContext.Provider>
  )
}

export function usePatternPrefs() {
  const ctx = useContext(PatternPrefsContext)
  if (!ctx) throw new Error('usePatternPrefs requires PatternPrefsProvider')
  return ctx
}

/** Prefetch cache entries into memory for a list of tickers (no network). */
export function hydrateHitsFromStorage(tickers: string[]) {
  return getManyTickerPatternHits(tickers)
}
