import { memo } from 'react'
import type { MarketSnapshot } from '../data/types'
import { APP_NAME } from '../lib/brand'
import { ViewTabs, type ViewId } from './ViewTabs'
import { SectorTable } from './SectorTable'
import { MoneyRotation } from './MoneyRotation'
import { RotationClock } from './RotationClock'
import { SectorAnalytics } from './SectorAnalytics'
import { IndustryAnalytics } from './IndustryAnalytics'
import { VolumeScan } from './VolumeScan'
import { AltAssetsPanel } from './AltAssetsPanel'
import { COMMODITIES, CRYPTO } from '../data/altAssets'

type Props = {
  snapshot: MarketSnapshot
  view: ViewId
  onViewChange: (id: ViewId) => void
  livePricesActive: boolean
  backfilling: boolean
  active?: boolean
}

function SectorMarketsSectionBody({
  snapshot,
  view,
  onViewChange,
  livePricesActive,
  backfilling,
  paused,
}: Props & { paused: boolean }) {
  const active = !paused
  return (
    <div className="space-y-4" hidden={paused} aria-hidden={paused}>
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight md:text-3xl">
          {APP_NAME}
        </h1>
        <p className="text-sm text-[var(--color-ink-soft)]">
          {snapshot.asOf} · vs {snapshot.benchmark} · {snapshot.industries.length} industries
          {backfilling ? ' · updating…' : ''}
        </p>
      </div>

      <ViewTabs active={view} onChange={onViewChange} mood={snapshot.moodCounts} />

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm md:p-5">
        {view === 'sector-table' && (
          <SectorTable snapshot={snapshot} livePricesActive={livePricesActive} active={active} />
        )}
        {view === 'money-rotation' && <MoneyRotation snapshot={snapshot} />}
        {view === 'rotation-clock' && <RotationClock snapshot={snapshot} />}
        {view === 'sector-analytics' && <SectorAnalytics snapshot={snapshot} />}
        {view === 'industry-analytics' && <IndustryAnalytics snapshot={snapshot} />}
        {view === 'volume-scan' && <VolumeScan snapshot={snapshot} />}
        {view === 'commodities' && (
          <AltAssetsPanel
            title="Commodities Desk"
            subtitle="Live futures / spot proxies — gold, silver, copper, oil, ags, AUD"
            assets={COMMODITIES}
            benchmarkYahoo="GC=F"
          />
        )}
        {view === 'crypto' && (
          <AltAssetsPanel
            title="Crypto Desk"
            subtitle="Major coins with mood / cycle / returns vs BTC"
            assets={CRYPTO}
            benchmarkYahoo="BTC-USD"
          />
        )}
      </div>
    </div>
  )
}

function SectorMarketsSectionShell(props: Props) {
  const active = props.active ?? true
  return (
    <SectorMarketsSectionBody
      snapshot={props.snapshot}
      view={props.view}
      onViewChange={props.onViewChange}
      livePricesActive={props.livePricesActive}
      backfilling={props.backfilling}
      paused={!active}
    />
  )
}

export const SectorMarketsSection = memo(
  SectorMarketsSectionShell,
  (prev, next) => {
    if (!prev.active && !next.active) return true
    if (prev.active !== next.active) return false
    return (
      prev.snapshot === next.snapshot &&
      prev.view === next.view &&
      prev.onViewChange === next.onViewChange &&
      prev.livePricesActive === next.livePricesActive &&
      prev.backfilling === next.backfilling
    )
  },
)
