import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import type { MarketSnapshot } from '../data/types'
import {
  UNIVERSES,
  type UniverseId,
  appendDailyBreadthPoint,
  computeBreadth,
  badgeClass,
  sentimentLabel,
  type BreadthBundle,
} from './breadth/breadthMath'
import { BreadthGauges } from './breadth/BreadthGauges'
import { ADSummation } from './breadth/ADSummation'
import { MetricRows } from './breadth/MetricRows'
import { ChartsTab } from './breadth/ChartsTab'
import { DiffusionIndicatorsView } from './breadth/DiffusionIndicatorsView'
import { HowToReadTab } from './breadth/HowToReadTab'
import { SeasonalityTab } from './breadth/SeasonalityTab'
import { copyTickersToTradingView } from '../lib/tradingview'
import { fetchBreadthDaily, postBreadthDaily, type BreadthDailyPoint } from '../lib/breadthApi'
import { membershipSourceLabel } from '../data/indexMembership'

type Props = { snapshot: MarketSnapshot; active?: boolean }
type TabId = 'sma' | 'rsi' | 'rsvol' | 'charts' | 'howto' | 'monthpulse'
type ViewMode = 'diffusion' | 'classic'

const TABS: { id: TabId; label: string }[] = [
  { id: 'sma', label: 'SMA Breadth' },
  { id: 'rsi', label: 'RSI Breadth' },
  { id: 'rsvol', label: 'RS / Volume' },
  { id: 'charts', label: 'Charts' },
  { id: 'howto', label: 'How to Read' },
  { id: 'monthpulse', label: 'This Month' },
]

function BreadthAnalysisBody({
  snapshot,
  paused,
}: {
  snapshot: MarketSnapshot
  paused: boolean
}) {
  const bundleCache = useRef<BreadthBundle | null>(null)
  const [universeId, setUniverseId] = useState<UniverseId>('asx200')
  const [viewMode, setViewMode] = useState<ViewMode>('diffusion')
  const [tab, setTab] = useState<TabId>('sma')
  const [copied, setCopied] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [serverPoints, setServerPoints] = useState<BreadthDailyPoint[]>([])
  const [chartHistory, setChartHistory] = useState<BreadthDailyPoint[]>([])

  useEffect(() => {
    if (paused) return
    let cancelled = false
    void (async () => {
      const { points, chartHistory: history } = await fetchBreadthDaily(universeId)
      if (!cancelled) {
        setServerPoints(points)
        setChartHistory(history)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [universeId, paused])

  const bundle = useMemo(() => {
    if (paused && bundleCache.current) return bundleCache.current
    const next = computeBreadth(snapshot, universeId, { serverPoints, chartHistory })
    bundleCache.current = next
    return next
  }, [paused, snapshot, universeId, serverPoints, chartHistory])

  const universeLabel = UNIVERSES.find((u) => u.id === universeId)?.label ?? universeId

  useEffect(() => {
    if (paused) return
    let cancelled = false
    const rsi30 =
      bundle.stocks.length > 0
        ? Math.round(
            (bundle.stocks.filter((s) => (s.rsi ?? 50) <= 30).length / bundle.stocks.length) *
              1000,
          ) / 10
        : 0
    const point = {
      above20: bundle.pctAbove20,
      above50: bundle.pctAbove50,
      above200: bundle.pctAbove200,
      rsi50: bundle.pctRsi50,
      adNet: bundle.adNet,
      advancing: bundle.advancing,
      declining: bundle.declining,
      near52w: bundle.pctNear52w,
      rsi70: bundle.pctRsi70,
      rsi30,
      rs50: bundle.pctRs50,
      rvol15: bundle.pctRvol15,
    }
    appendDailyBreadthPoint(universeId, point)
    void postBreadthDaily(universeId, point).then((points) => {
      if (!cancelled && points.length) setServerPoints(points)
    })
    return () => {
      cancelled = true
    }
  }, [
    paused,
    universeId,
    snapshot.asOf,
    bundle.pctAbove20,
    bundle.pctAbove50,
    bundle.pctAbove200,
    bundle.pctRsi50,
    bundle.adNet,
    bundle.advancing,
    bundle.declining,
    bundle.pctNear52w,
    bundle.pctRsi70,
    bundle.pctRs50,
    bundle.pctRvol15,
    bundle.stocks.length,
  ])

  const copyUniverse = async () => {
    const tickers = bundle.stocks.map((s) => s.ticker)
    const ok = await copyTickersToTradingView(tickers)
    if (ok) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className={paused ? 'hidden' : 'space-y-5'} aria-hidden={paused}>
      {viewMode === 'diffusion' ? (
        <>
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
          <DiffusionIndicatorsView
            bundle={bundle}
            universeId={universeId}
            onUniverseChange={setUniverseId}
            onOpenClassic={() => setViewMode('classic')}
          />
        </>
      ) : (
        <>
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
            onClick={() => setViewMode('diffusion')}
            className="rounded-lg border border-sky-500 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 dark:bg-sky-950/50 dark:text-sky-100"
          >
            Diffusion charts
          </button>
          <button
            type="button"
            onClick={copyUniverse}
            disabled={paused}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-amber-500 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-200 disabled:opacity-50 dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-100"
          >
            <Copy size={14} />
            {copied ? 'Copied!' : `Copy ${universeLabel} list`}
          </button>
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            disabled={paused}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--color-ink-soft)] hover:border-sky-300 disabled:opacity-50"
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
            disabled={paused}
            onClick={() => setUniverseId(u.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
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
            disabled={paused}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:opacity-50 ${
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
        </>
      )}
    </div>
  )
}

function BreadthAnalysisShell({ snapshot, active }: Props) {
  const [mounted, setMounted] = useState(active)

  useEffect(() => {
    if (active) {
      setMounted(true)
      return
    }
    const id = window.setTimeout(() => setMounted(false), 4000)
    return () => window.clearTimeout(id)
  }, [active])

  if (!mounted) return null

  return <BreadthAnalysisBody snapshot={snapshot} paused={!active} />
}

export const BreadthAnalysis = memo(
  BreadthAnalysisShell,
  (prev, next) => {
    if (!prev.active && !next.active) return true
    if (prev.active !== next.active) return false
    return prev.snapshot === next.snapshot
  },
)
