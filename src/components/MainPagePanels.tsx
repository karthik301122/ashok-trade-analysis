import { memo } from 'react'
import type { MarketSnapshot } from '../data/types'
import { AlertsPanel } from './AlertsPanel'
import { BreadthAnalysis } from './BreadthAnalysis'
import { SpecialPatternsPanel } from './SpecialPatternsPanel'
import { SectorMarketsSection } from './SectorMarketsSection'
import type { ViewId } from './ViewTabs'

type Page = 'sector' | 'breadth' | 'alerts' | 'special-patterns'

const MemoAlertsPanel = memo(AlertsPanel)
const MemoSpecialPatternsPanel = memo(SpecialPatternsPanel)

type Props = {
  page: Page
  snapshot: MarketSnapshot
  view: ViewId
  onViewChange: (id: ViewId) => void
  livePricesActive: boolean
  backfilling: boolean
}

/**
 * Keeps main sections mounted (fast return visits) but isolates re-renders so
 * switching tabs updates the nav indicator immediately without reconciling every panel.
 */
export const MainPagePanels = memo(function MainPagePanels({
  page,
  snapshot,
  view,
  onViewChange,
  livePricesActive,
  backfilling,
}: Props) {
  return (
    <>
      <div hidden={page !== 'alerts'} aria-hidden={page !== 'alerts'}>
        <MemoAlertsPanel />
      </div>
      <div hidden={page !== 'special-patterns'} aria-hidden={page !== 'special-patterns'}>
        <MemoSpecialPatternsPanel snapshot={snapshot} active={page === 'special-patterns'} />
      </div>
      <div hidden={page !== 'breadth'} aria-hidden={page !== 'breadth'}>
        <BreadthAnalysis snapshot={snapshot} active={page === 'breadth'} />
      </div>
      <div hidden={page !== 'sector'} aria-hidden={page !== 'sector'}>
        <SectorMarketsSection
          snapshot={snapshot}
          view={view}
          onViewChange={onViewChange}
          livePricesActive={livePricesActive}
          backfilling={backfilling}
        />
      </div>
    </>
  )
})
