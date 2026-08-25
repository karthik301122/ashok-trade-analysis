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
  rememberHits: (ticker: string, hits: CachedPatternHit[]) => void
  starredHitsFor: (ticker: string) => CachedPatternHit[]
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

  const rememberHits = useCallback((ticker: string, hits: CachedPatternHit[]) => {
    setTickerPatternHits(ticker, hits)
    setHitsByTicker((prev) => {
      const next = new Map(prev)
      next.set(ticker.toUpperCase(), { updatedAt: Date.now(), hits })
      return next
    })
  }, [])

  const starredHitsFor = useCallback(
    (ticker: string): CachedPatternHit[] => {
      const key = ticker.toUpperCase()
      const cached = hitsByTicker.get(key) ?? getTickerPatternHits(key)
      if (!cached?.hits?.length) return []

      const starred = new Set(prefs.starredNames)
      const customByBasedOn = new Map(
        prefs.customPatterns
          .filter((c) => c.basedOn && starred.has(c.name))
          .map((c) => [c.basedOn as string, c]),
      )

      const out: CachedPatternHit[] = []
      const seen = new Set<string>()

      for (const h of cached.hits) {
        if (starred.has(h.name) && !seen.has(h.name)) {
          out.push(h)
          seen.add(h.name)
        }
        const custom = customByBasedOn.get(h.name)
        if (custom && !seen.has(custom.name)) {
          out.push({
            name: custom.name,
            bias: custom.bias,
            endT: h.endT,
            confidence: h.confidence,
          })
          seen.add(custom.name)
        }
      }

      // Custom rule hits are already stored under the custom name
      return out.sort((a, b) => b.endT - a.endT)
    },
    [hitsByTicker, prefs.starredNames, prefs.customPatterns],
  )

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
      starredHitsFor,
    }),
    [
      prefs,
      isStarred,
      toggleStar,
      createCustom,
      deleteCustom,
      hitsByTicker,
      rememberHits,
      starredHitsFor,
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
