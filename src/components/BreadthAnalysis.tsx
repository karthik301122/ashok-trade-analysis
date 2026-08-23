import { useMemo, useState } from 'react'
import type { MarketSnapshot } from '../data/types'
import {
  UNIVERSES,
  type UniverseId,
  computeBreadth,
  badgeClass,
  sentimentLabel,
} from './breadth/breadthMath'
import { BreadthGauges } from './breadth/BreadthGauges'
import { ADSummation } from './breadth/ADSummation'
import { MetricRows } from './breadth/MetricRows'
import { ChartsTab } from './breadth/ChartsTab'
import { HowToReadTab } from './breadth/HowToReadTab'
import { SeasonalityTab } from './breadth/SeasonalityTab'

type Props = { snapshot: MarketSnapshot }
type TabId = 'sma' | 'rsi' | 'rsvol' | 'charts' | 'howto' | 'seasonality'

const TABS: { id: TabId; label: string }[] = [
  { id: 'sma', label: 'SMA Breadth' },
  { id: 'rsi', label: 'RSI Breadth' },
  { id: 'rsvol', label: 'RS / Volume' },
  { id: 'charts', label: 'Charts' },
  { id: 'howto', label: 'How to Read' },
  { id: 'seasonality', label: 'Seasonality' },
]

export function BreadthAnalysis({ snapshot }: Props) {
  const [universeId, setUniverseId] = useState<UniverseId>('asx200')
  const [tab, setTab] = useState<TabId>('sma')

  const bundle = useMemo(() => computeBreadth(snapshot, universeId), [snapshot, universeId])
  const universeLabel = UNIVERSES.find((u) => u.id === universeId)?.label ?? universeId

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            Market Breadth Analysis
          </h1>
          <p className="text-sm text-[var(--color-ink-soft)]">
            {universeLabel} · {bundle.stocks.length} stocks · {snapshot.asOf}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeClass(bundle.overall)}`}
        >
          {sentimentLabel(bundle.overall)} · {universeLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {UNIVERSES.map((u) => (
          <button
            key={u.id}
            type="button"
            onClick={() => setUniverseId(u.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
              universeId === u.id
                ? 'border-sky-500 bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200'
                : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-sky-300'
            }`}
          >
            {u.label}
          </button>
        ))}
      </div>

      <BreadthGauges gauges={bundle.gauges} />

      <ADSummation
        adNet={bundle.adNet}
        adHistory={bundle.adHistory}
        advancing={bundle.advancing}
        declining={bundle.declining}
      />

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
              tab === t.id
                ? 'bg-teal-800 text-white dark:bg-teal-700'
                : 'border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-ink-soft)] hover:border-teal-400'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sma' && (
        <MetricRows
          title={`Moving average breadth · ${universeLabel}`}
          blurb="% of stocks above key SMAs. Rising participation supports durable rallies; falling breadth warns of narrow leadership."
          rows={bundle.smaRows}
        />
      )}
      {tab === 'rsi' && (
        <MetricRows
          title={`RSI breadth · ${universeLabel}`}
          blurb="Share of stocks with RSI above thresholds. RSI ≥ 50 = positive momentum; ≥ 60 stronger; ≥ 70 overbought stretch."
          rows={bundle.rsiRows}
        />
      )}
      {tab === 'rsvol' && (
        <MetricRows
          title={`Relative strength & volume · ${universeLabel}`}
          blurb={`RS vs ASX200 (avg RS ${bundle.avgRs}). RVOL = today ÷ 20-day average volume (avg ${bundle.avgRvol}×).`}
          rows={bundle.rsVolRows}
        />
      )}
      {tab === 'charts' && <ChartsTab bundle={bundle} />}
      {tab === 'howto' && <HowToReadTab />}
      {tab === 'seasonality' && (
        <SeasonalityTab snapshot={snapshot} bundle={bundle} universeId={universeId} />
      )}
    </div>
  )
}
