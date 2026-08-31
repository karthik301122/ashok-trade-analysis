import { useEffect, useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
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
import { copyTickersToTradingView } from '../lib/tradingview'
import { fetchBreadthDaily, postBreadthDaily, type BreadthDailyPoint } from '../lib/breadthApi'
import { membershipSourceLabel } from '../data/indexMembership'

type Props = { snapshot: MarketSnapshot }
type TabId = 'sma' | 'rsi' | 'rsvol' | 'charts' | 'howto' | 'monthpulse'

const TABS: { id: TabId; label: string }[] = [
  { id: 'sma', label: 'SMA Breadth' },
  { id: 'rsi', label: 'RSI Breadth' },
  { id: 'rsvol', label: 'RS / Volume' },
  { id: 'charts', label: 'Charts' },
  { id: 'howto', label: 'How to Read' },
  { id: 'monthpulse', label: 'This Month' },
]

export function BreadthAnalysis({ snapshot }: Props) {
  const [universeId, setUniverseId] = useState<UniverseId>('asx200')
  const [tab, setTab] = useState<TabId>('sma')
  const [copied, setCopied] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [serverPoints, setServerPoints] = useState<BreadthDailyPoint[]>([])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const points = await fetchBreadthDaily(universeId)
      if (!cancelled) setServerPoints(points)
    })()
    return () => {
      cancelled = true
    }
  }, [universeId])

  const bundle = useMemo(
    () => computeBreadth(snapshot, universeId, { serverPoints }),
    [snapshot, universeId, serverPoints],
  )
  const universeLabel = UNIVERSES.find((u) => u.id === universeId)?.label ?? universeId

  useEffect(() => {
    let cancelled = false
    const b = computeBreadth(snapshot, universeId)
    const rsi30 =
      b.stocks.length > 0
        ? Math.round(
            (b.stocks.filter((s) => (s.rsi ?? 50) <= 30).length / b.stocks.length) * 1000,
          ) / 10
        : 0
    void postBreadthDaily(universeId, {
      above20: b.pctAbove20,
      above50: b.pctAbove50,
      above200: b.pctAbove200,
      rsi50: b.pctRsi50,
      adNet: b.adNet,
      advancing: b.advancing,
      declining: b.declining,
      near52w: b.pctNear52w,
      rsi70: b.pctRsi70,
      rsi30,
      rs50: b.pctRs50,
      rvol15: b.pctRvol15,
    }).then((points) => {
      if (!cancelled && points.length) setServerPoints(points)
    })
    return () => {
      cancelled = true
    }
  }, [universeId, snapshot])

  const copyUniverse = async () => {
    const tickers = bundle.stocks.map((s) => s.ticker)
    const ok = await copyTickersToTradingView(tickers)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

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
          <p className="mt-1 max-w-xl text-xs text-[var(--color-ink-soft)]">
            {membershipSourceLabel()}. Use Copy list to compare with your watchlist.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyUniverse}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-amber-500 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-200 dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-100"
          >
            <Copy size={14} />
            {copied ? 'Copied!' : `Copy ${universeLabel} list`}
          </button>
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] hover:border-sky-300"
          >
            {listOpen ? 'Hide tickers' : 'Show tickers'}
          </button>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${badgeClass(bundle.overall)}`}
          >
            {sentimentLabel(bundle.overall)} · {universeLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {UNIVERSES.map((u) => (
          <button
            key={u.id}
            type="button"
            title={u.hint}
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

      {listOpen && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="mb-2 text-xs font-semibold text-[var(--color-ink-soft)]">
            {universeLabel} tickers ({bundle.stocks.length}) — ranked by weight
          </p>
          <div className="max-h-64 overflow-auto font-mono text-[11px] leading-relaxed break-all">
            {bundle.stocks.map((s) => s.ticker).join(', ')}
          </div>
        </div>
      )}

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
          blurb={`RS vs ASX200 uses score 50 + (3M−index)×2.2 (avg ${bundle.avgRs}). RVOL = today ÷ 20-day average volume (avg ${bundle.avgRvol}×).`}
          rows={bundle.rsVolRows}
        />
      )}
      {tab === 'charts' && <ChartsTab bundle={bundle} />}
      {tab === 'howto' && <HowToReadTab />}
      {tab === 'monthpulse' && (
        <SeasonalityTab snapshot={snapshot} bundle={bundle} universeId={universeId} />
      )}
    </div>
  )
}
