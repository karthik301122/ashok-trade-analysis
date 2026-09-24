import { createContext, useContext, type ReactNode } from 'react'
import type { MarketSnapshot } from '../../data/types'
import { useUnifiedSpecialScans } from './useUnifiedSpecialScans'

export type UnifiedSpecialScansState = ReturnType<typeof useUnifiedSpecialScans>

const UnifiedSpecialScansContext = createContext<UnifiedSpecialScansState | null>(null)

export function UnifiedSpecialScansProvider({
  snapshot,
  enabled,
  children,
}: {
  snapshot: MarketSnapshot
  /** Only true on Patterns / Alerts — avoids crawling /api/series on Markets. */
  enabled: boolean
  children: ReactNode
}) {
  const scans = useUnifiedSpecialScans(
    snapshot.stocks,
    enabled,
    snapshot.benchmarkPerf.m3,
  )
  return (
    <UnifiedSpecialScansContext.Provider value={scans}>{children}</UnifiedSpecialScansContext.Provider>
  )
}

/** Shared scan state from MainPagePanels — avoids restarting scans on tab switch. */
export function useSharedUnifiedSpecialScans(
  stocks: MarketSnapshot['stocks'],
  fallbackEnabled: boolean,
  indexM3: number,
): UnifiedSpecialScansState {
  const shared = useContext(UnifiedSpecialScansContext)
  const local = useUnifiedSpecialScans(stocks, shared ? false : fallbackEnabled, indexM3)
  return shared ?? local
}
