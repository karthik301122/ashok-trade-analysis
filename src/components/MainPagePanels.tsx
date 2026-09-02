import { memo } from 'react'
import type { MarketSnapshot } from '../data/types'
import { AlertsPanel } from './AlertsPanel'
import { BreadthAnalysis } from './BreadthAnalysis'
import { SpecialPatternsPanel } from './SpecialPatternsPanel'
import { SectorMarketsSection } from './SectorMarketsSection'
import { PatternCreatePage } from './patterns/PatternCreatePage'
import type { ViewId } from './ViewTabs'
import type { AppPage } from '../lib/appPage'

type Props = {
  page: AppPage
  snapshot: MarketSnapshot
  view: ViewId
  onViewChange: (id: ViewId) => void
  livePricesActive: boolean
  backfilling: boolean
}

function mainPagePanelsPropsEqual(prev: Props, next: Props): boolean {
  if (prev.page !== next.page) return false
  if (next.page === 'alerts' || next.page === 'create-pattern') return true
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
  if (page === 'alerts') return <AlertsPanel />
  if (page === 'create-pattern') return <PatternCreatePage />

  return (
    <>
      <SectorMarketsSection
        snapshot={snapshot}
        view={view}
        onViewChange={onViewChange}
        livePricesActive={livePricesActive}
        backfilling={backfilling}
        active={page === 'sector'}
      />
      <BreadthAnalysis snapshot={snapshot} active={page === 'breadth'} />
      <SpecialPatternsPanel snapshot={snapshot} active={page === 'special-patterns'} />
    </>
  )
}

/**
 * Keep heavy tabs mounted briefly after switch (see SectorMarketsSection / Breadth / Patterns)
 * so navigation feels instant and background scans pause instead of cold-restarting.
 */
export const MainPagePanels = memo(MainPagePanelsInner, mainPagePanelsPropsEqual)
