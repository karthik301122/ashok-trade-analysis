import { memo } from 'react'
import type { MarketSnapshot } from '../data/types'
import { AlertsPanel } from './AlertsPanel'
import { BreadthAnalysis } from './BreadthAnalysis'
import { SpecialPatternsPanel } from './SpecialPatternsPanel'
import { SectorMarketsSection } from './SectorMarketsSection'
import type { ViewId } from './ViewTabs'

type Page = 'sector' | 'breadth' | 'alerts' | 'special-patterns'

type Props = {
  page: Page
  snapshot: MarketSnapshot
  view: ViewId
  onViewChange: (id: ViewId) => void
  livePricesActive: boolean
  backfilling: boolean
}

function mainPagePanelsPropsEqual(prev: Props, next: Props): boolean {
  if (prev.page !== next.page) return false
  // Alerts does not use snapshot — ignore live desk updates while on that tab.
  if (next.page === 'alerts') return true
  return (
    prev.snapshot === next.snapshot &&
    prev.view === next.view &&
    prev.onViewChange === next.onViewChange &&
    prev.livePricesActive === next.livePricesActive &&
    prev.backfilling === next.backfilling
  )
}

function MainPagePanelsInner({
  page,
  snapshot,
  view,
  onViewChange,
  livePricesActive,
  backfilling,
}: Props) {
  switch (page) {
    case 'alerts':
      return <AlertsPanel />
    case 'breadth':
      return <BreadthAnalysis snapshot={snapshot} active />
    case 'special-patterns':
      return <SpecialPatternsPanel snapshot={snapshot} active />
    case 'sector':
    default:
      return (
        <SectorMarketsSection
          snapshot={snapshot}
          view={view}
          onViewChange={onViewChange}
          livePricesActive={livePricesActive}
          backfilling={backfilling}
        />
      )
  }
}

/**
 * Mount only the active main tab. Hidden keep-alive previously left SectorTable
 * running full-universe OHLC scans while on Breadth or Alerts, blocking navigation.
 */
export const MainPagePanels = memo(MainPagePanelsInner, mainPagePanelsPropsEqual)
