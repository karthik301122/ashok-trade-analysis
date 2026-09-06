import { memo } from 'react'
import type { MarketSnapshot } from '../data/types'
import { AlertsPanel } from './AlertsPanel'
import { BreadthAnalysis } from './BreadthAnalysis'
import { SpecialPatternsPanel } from './SpecialPatternsPanel'
import { SectorMarketsSection } from './SectorMarketsSection'
import { PatternCreatePage } from './patterns/PatternCreatePage'
import { ProfilePage } from './ProfilePage'
import { UnifiedSpecialScansProvider } from './patterns/UnifiedSpecialScansContext'
import type { ViewId } from './ViewTabs'
import type { AppPage } from '../lib/appPage'

import type { PatternAlertWatch } from '../lib/patterns/patternAlertWatches'

type Props = {
  page: AppPage
  snapshot: MarketSnapshot
  view: ViewId
  onViewChange: (id: ViewId) => void
  livePricesActive: boolean
  backfilling: boolean
  patternAlertWatches?: PatternAlertWatch[]
  onPatternAlertWatchesChange?: (watches: PatternAlertWatch[]) => void
  user?: string | null
  onUserChange?: (user: string) => void
}

function mainPagePanelsPropsEqual(prev: Props, next: Props): boolean {
  if (prev.page !== next.page) return false
  if (next.page === 'alerts' || next.page === 'create-pattern' || next.page === 'profile') {
    return prev.user === next.user
  }
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
  patternAlertWatches,
  onPatternAlertWatchesChange,
  user,
  onUserChange,
}: Props) {
  const overlayPage = page === 'alerts' || page === 'create-pattern' || page === 'profile'

  return (
    <UnifiedSpecialScansProvider
      snapshot={snapshot}
      enabled={page !== 'create-pattern' && page !== 'profile'}
    >
      <div hidden={overlayPage} aria-hidden={overlayPage}>
        <SectorMarketsSection
          snapshot={snapshot}
          view={view}
          onViewChange={onViewChange}
          livePricesActive={livePricesActive}
          backfilling={backfilling}
          visible={page === 'sector'}
        />
        <BreadthAnalysis snapshot={snapshot} visible={page === 'breadth'} />
        <SpecialPatternsPanel snapshot={snapshot} visible={page === 'special-patterns'} />
      </div>
      {page === 'alerts' && (
        <AlertsPanel
          snapshot={snapshot}
          watches={patternAlertWatches}
          onWatchesChange={onPatternAlertWatchesChange}
        />
      )}
      {page === 'create-pattern' && <PatternCreatePage />}
      {page === 'profile' && user && onUserChange && (
        <ProfilePage user={user} onUserChange={onUserChange} />
      )}
    </UnifiedSpecialScansProvider>
  )
}

/**
 * Main tabs stay mounted (hidden when Alerts / Create pattern / Profile) so navigation
 * does not cold-mount heavy panels or restart background scans.
 */
export const MainPagePanels = memo(MainPagePanelsInner, mainPagePanelsPropsEqual)
