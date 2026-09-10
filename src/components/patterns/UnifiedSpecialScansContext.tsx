import { createContext, useContext, type ReactNode } from 'react'
import type { MarketSnapshot } from '../../data/types'
import { useUnifiedSpecialScans } from './useUnifiedSpecialScans'

export type UnifiedSpecialScansState = ReturnType<typeof useUnifiedSpecialScans>

const UnifiedSpecialScansContext = createContext<UnifiedSpecialScansState | null>(null)

export function UnifiedSpecialScansProvider({
  snapshot,
  enabled: _enabled,
  children,
}: {
  snapshot: MarketSnapshot
  enabled: boolean
  children: ReactNode
}) {
  // Never auto-crawl the full ASX universe from the browser — that stamps /api/series
  // and freezes Patterns. Server patternJob + /api/patterns/hits is the source of truth.
  void _enabled
  const scans = useUnifiedSpecialScans(snapshot.stocks, false, snapshot.benchmarkPerf.m3)
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
  // Never fall back to a full-universe browser crawl.
  void fallbackEnabled
  const local = useUnifiedSpecialScans(stocks, false, indexM3)
  return shared ?? local
}
