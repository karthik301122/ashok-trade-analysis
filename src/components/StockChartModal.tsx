import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { toTradingViewSymbol } from '../lib/tradingview'
import { fetchYahooOhlc } from '../lib/yahoo'
import {
  enrichScanWithPrefs,
  scanPatterns,
  detectAllCustomRules,
  filterBarsByWindow,
  filterHitsByWindow,
  scanWindowLabel,
  tradingViewRangeForWindow,
  type PatternBias,
  type PatternCategoryId,
  type PatternHit,
  type OhlcBar,
} from '../lib/patterns'
import { TradingViewChart } from './TradingViewChart'
import { PatternPanel } from './patterns/PatternPanel'
import { AnnotatedPatternChart } from './patterns/AnnotatedPatternChart'
import { usePatternPrefs } from './patterns/PatternPrefsContext'

/** Open chart already zoomed/annotated to a special (or other) pattern hit. */
export type ChartPatternFocus = {
  name: string
  bias: PatternBias
  startT: number
  endT: number
}

type Props = {
  ticker: string
  name?: string
  onClose: () => void
  /** When set, open on annotated chart at this hit instead of TradingView. */
  initialFocus?: ChartPatternFocus | null
}

function nearestBar(bars: OhlcBar[], t: number): OhlcBar {
  let best = bars[0]
  let bestDist = Math.abs(bars[0].t - t)
  for (const b of bars) {
    const d = Math.abs(b.t - t)
    if (d < bestDist) {
      best = b
      bestDist = d
    }
  }
  return best
}

function hitFromFocus(bars: OhlcBar[], focus: ChartPatternFocus): PatternHit {
  const start = nearestBar(bars, focus.startT)
  const end = nearestBar(bars, focus.endT)
  return {
    id: `focus-${focus.name}-${focus.startT}-${focus.endT}`,
    category: 'custom',
    name: focus.name,
    bias: focus.bias,
    startT: start.t,
    endT: end.t,
    confidence: 0.85,
    points: [
      { time: start.t, price: start.c },
      { time: end.t, price: end.c },
    ],
    note: 'Special pattern hit',
  }
}

function barsAroundHit(all: OhlcBar[], hit: PatternHit): OhlcBar[] {
  const from = Math.min(hit.startT, hit.endT) - 60 * 86400
  const to = Math.max(hit.startT, hit.endT) + 20 * 86400
  const sliced = all.filter((b) => b.t >= from && b.t <= to)
  return sliced.length >= 10 ? sliced : all.slice(-180)
}

export function StockChartModal({ ticker, name, onClose, initialFocus = null }: Props) {
  const symbol = toTradingViewSymbol(ticker)
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`
  const { prefs, rememberHits, setScanWindow } = usePatternPrefs()

  const [bars, setBars] = useState<OhlcBar[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<PatternCategoryId | null>(null)
  const [selected, setSelected] = useState<PatternHit | null>(null)
  const [chartMode, setChartMode] = useState<'tv' | 'pattern'>(initialFocus ? 'pattern' : 'tv')
  const [fund, setFund] = useState<{
    pe: number | null
    forwardPe: number | null
    dividendYield: number | null
    marketCap: number | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelected(null)
    setActiveCategory(null)
    setChartMode(initialFocus ? 'pattern' : 'tv')
    setFund(null)
    const focusSnapshot = initialFocus
      ? {
          name: initialFocus.name,
          bias: initialFocus.bias,
          startT: initialFocus.startT,
          endT: initialFocus.endT,
        }
      : null
    ;(async () => {
      const [ohlc, fundRes] = await Promise.all([
        fetchYahooOhlc(ticker),
        fetch(`/api/fundamentals/${encodeURIComponent(ticker)}`, { credentials: 'include' })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ])
      if (cancelled) return
      if (fundRes) {
        setFund({
          pe: fundRes.pe ?? null,
          forwardPe: fundRes.forwardPe ?? null,
          dividendYield: fundRes.dividendYield ?? null,
          marketCap: fundRes.marketCap ?? null,
        })
      }
      if (!ohlc?.length) {
        setError('Could not load OHLC for pattern scan')
        setBars(null)
        setLoading(false)
        return
      }
      setBars(ohlc)
      if (focusSnapshot) {
        setSelected(hitFromFocus(ohlc, focusSnapshot))
        setChartMode('pattern')
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [
    ticker,
    initialFocus?.name,
    initialFocus?.bias,
    initialFocus?.startT,
    initialFocus?.endT,
  ])

  const scanResult = useMemo(() => {
    if (!bars?.length) return null
    return scanPatterns(bars, { window: prefs.scanWindow })
  }, [bars, prefs.scanWindow])

  const baseCategories = scanResult?.categories ?? []
  const catalogTotal = scanResult?.catalogTotal ?? 0

  useEffect(() => {
    if (!bars?.length || !scanResult?.asOf) return
    const builtIn = scanResult.hits
    const customHits = filterHitsByWindow(
      detectAllCustomRules(bars, prefs.customPatterns),
      prefs.scanWindow,
      scanResult.asOf,
    )
    rememberHits(
      ticker,
      [...builtIn, ...customHits].map((h) => ({
        name: h.name,
        bias: h.bias,
        endT: h.endT,
        confidence: h.confidence,
      })),
      { scanWindow: prefs.scanWindow, asOf: scanResult.asOf },
    )
  }, [bars, scanResult, prefs.customPatterns, prefs.scanWindow, rememberHits, ticker])

  const categories = enrichScanWithPrefs(baseCategories, prefs, bars, prefs.scanWindow, ticker)

  const windowBars = useMemo(
    () => (bars?.length ? filterBarsByWindow(bars, prefs.scanWindow) : null),
    [bars, prefs.scanWindow],
  )
  const chartBars = useMemo(() => {
    if (!bars?.length) return null
    if (selected && chartMode === 'pattern') return barsAroundHit(bars, selected)
    return windowBars
  }, [bars, selected, chartMode, windowBars])

  const tvRange = tradingViewRangeForWindow(prefs.scanWindow)

  useEffect(() => {
    if (!selected) return
    // Keep external special-pattern focus even if it isn't in the chart scan categories
    if (selected.id.startsWith('focus-')) return
    const stillVisible = categories.some((c) => c.hits.some((h) => h.id === selected.id))
    if (!stillVisible) {
      setSelected(null)
      setChartMode('tv')
    }
  }, [categories, selected])

  const onSelectPattern = (hit: PatternHit) => {
    setSelected(hit)
    setChartMode('pattern')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label={`${ticker} chart`}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight">
            {ticker}
            {name ? <span className="ml-2 text-sm font-medium text-[var(--color-ink-soft)]">{name}</span> : null}
          </h2>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {symbol}
            {selected && chartMode === 'pattern'
              ? ` · showing ${selected.name}`
              : ` · chart range ${scanWindowLabel(prefs.scanWindow)}`}
          </p>
          {fund && (
            <p className="mt-1 flex flex-wrap gap-3 text-[11px] font-semibold tabular-nums text-[var(--color-ink-soft)]">
              <span>PE {fund.pe != null ? fund.pe.toFixed(1) : '—'}</span>
              <span>Fwd PE {fund.forwardPe != null ? fund.forwardPe.toFixed(1) : '—'}</span>
              <span>
                Yield{' '}
                {fund.dividendYield != null ? `${(fund.dividendYield * 100).toFixed(1)}%` : '—'}
              </span>
              <span>
                Mkt cap{' '}
                {fund.marketCap != null
                  ? fund.marketCap >= 1e9
                    ? `$${(fund.marketCap / 1e9).toFixed(1)}B`
                    : `$${(fund.marketCap / 1e6).toFixed(0)}M`
                  : '—'}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {chartMode === 'pattern' && (
            <button
              type="button"
              onClick={() => {
                setChartMode('tv')
                setSelected(null)
              }}
              className="rounded-lg border border-sky-500 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-200"
            >
              Back to TradingView
            </button>
          )}
          <a
            href={tvUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-semibold hover:border-sky-400"
          >
            <ExternalLink size={14} />
            Open in TradingView
          </a>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-muted)]"
            aria-label="Close chart"
          >
            <span className="inline-flex items-center gap-1">
              <X size={16} />
              Close
            </span>
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="min-h-[50vh] min-w-0 flex-1 md:min-h-0">
          {chartMode === 'tv' || !chartBars ? (
            <TradingViewChart
              key={`tv-${ticker}-${tvRange}`}
              ticker={ticker}
              fill
              range={tvRange}
            />
          ) : (
            <AnnotatedPatternChart
              key={`pat-${ticker}-${selected?.id ?? 'none'}`}
              bars={chartBars}
              selected={selected}
            />
          )}
        </div>
        <div className="h-[40vh] shrink-0 md:h-auto md:w-[340px]">
          <PatternPanel
            loading={loading}
            error={error}
            categories={categories}
            catalogTotal={catalogTotal}
            scanWindow={prefs.scanWindow}
            onScanWindowChange={setScanWindow}
            activeCategory={activeCategory}
            selectedPatternId={selected?.id ?? null}
            onSelectCategory={setActiveCategory}
            onSelectPattern={onSelectPattern}
          />
        </div>
      </div>
    </div>
  )
}
