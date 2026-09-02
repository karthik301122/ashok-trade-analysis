import { createContext, useContext, type ReactNode } from 'react'
import type { MarketSnapshot } from '../../data/types'
import { ASX_UNIVERSE_COUNT } from '../../data/universe'
import { useUnifiedSpecialScans } from './useUnifiedSpecialScans'

export type UnifiedSpecialScansState = ReturnType<typeof useUnifiedSpecialScans>

const UnifiedSpecialScansContext = createContext<UnifiedSpecialScansState | null>(null)

export function UnifiedSpecialScansProvider({
  snapshot,
  enabled,
  children,
}: {
  snapshot: MarketSnapshot
  enabled: boolean
  children: ReactNode
}) {
  const heavy = snapshot.stocks.length >= Math.floor(ASX_UNIVERSE_COUNT * 0.85)
  const scans = useUnifiedSpecialScans(
    snapshot.stocks,
    enabled && heavy,
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
  const local = useUnifiedSpecialScans(stocks, !shared && fallbackEnabled, indexM3)
  return shared ?? local
}
