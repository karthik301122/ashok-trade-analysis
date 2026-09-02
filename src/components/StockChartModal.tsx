import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, X } from 'lucide-react'
import { toTradingViewSymbol } from '../lib/tradingview'
import { fetchDeskIntraday, fetchYahooOhlc } from '../lib/yahoo'
import { fetchDeskServerConfig } from '../lib/deskConfig'
import {
  chartIntervalShort,
  intradayFetchRange,
  isIntradayDeskInterval,
  resolveChartInterval,
  tradingViewIntervalForPref,
  type DeskDataProvider,
} from '../lib/chartInterval'
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
import { PatternPanel } from './patterns/PatternPanel'
import { PatternCreateModal } from './patterns/PatternCreateModal'
import { AnnotatedPatternChart } from './patterns/AnnotatedPatternChart'
import { TradingViewChart } from './TradingViewChart'
import { usePatternPrefs } from './patterns/usePatternPrefs'
import type { DrawnTool } from '../lib/patterns/drawnPattern'
import { useAppNav } from '../lib/appPage'

/** Open chart zoomed/annotated to a special (or other) pattern hit. */
export type ChartPatternFocus = {
  name: string
  bias: PatternBias
  startT: number
  endT: number
}

type ChartView = 'desk' | 'tradingview'

type Props = {
  ticker: string
  name?: string
  onClose: () => void
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

function barsAroundHit(all: OhlcBar[], hit: PatternHit, intraday = false): OhlcBar[] {
  const padBefore = intraday ? 3 * 86400 : 60 * 86400
  const padAfter = intraday ? 1 * 86400 : 20 * 86400
  const from = Math.min(hit.startT, hit.endT) - padBefore
  const to = Math.max(hit.startT, hit.endT) + padAfter
  const sliced = all.filter((b) => b.t >= from && b.t <= to)
  return sliced.length >= 10 ? sliced : all.slice(-Math.min(all.length, intraday ? 400 : 180))
}

export function StockChartModal({ ticker, name, onClose, initialFocus = null }: Props) {
  const symbol = toTradingViewSymbol(ticker)
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`
  const { page } = useAppNav()
  const { prefs, rememberHits, setScanWindow, chartInterval, setChartInterval } = usePatternPrefs()

  const [dailyBars, setDailyBars] = useState<OhlcBar[] | null>(null)
  const [displayBars, setDisplayBars] = useState<OhlcBar[] | null>(null)
  const [chartBarInterval, setChartBarInterval] = useState<string>('1d')
  const [dataProvider, setDataProvider] = useState<DeskDataProvider>('eodhd')
  const [chartView, setChartView] = useState<ChartView>('desk')
  const [deskFallbackNote, setDeskFallbackNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<PatternCategoryId | null>(null)
  const [selected, setSelected] = useState<PatternHit | null>(null)
  const [saveDrawOpen, setSaveDrawOpen] = useState(false)
  const [drawTools, setDrawTools] = useState<DrawnTool[]>([])
  const [drawTimeframe, setDrawTimeframe] = useState<'daily' | 'weekly'>('daily')
  const [intradayLoading, setIntradayLoading] = useState(false)
  const intradayFetchGen = useRef(0)
  const [fund, setFund] = useState<{
    pe: number | null
    forwardPe: number | null
    dividendYield: number | null
    marketCap: number | null
  } | null>(null)

  useEffect(() => {
    if (page === 'create-pattern') onClose()
  }, [page, onClose])

  useEffect(() => {
    let cancelled = false
    void fetchDeskServerConfig().then((cfg) => {
      if (cancelled) return
      const p = cfg?.provider
      setDataProvider(p === 'yahoo-finance2' ? 'yahoo-finance2' : p === 'eodhd' ? 'eodhd' : 'eodhd')
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelected(null)
    setActiveCategory(null)
    setIntradayLoading(false)
    intradayFetchGen.current += 1
    setFund(null)
    setDailyBars(null)
    setDisplayBars(null)
    setChartBarInterval('1d')
    setChartView('desk')
    setDeskFallbackNote(null)
    setDrawTools([])
    setDrawTimeframe('daily')
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
        setError('Could not load daily OHLC from the desk data feed')
        setDailyBars(null)
        setDisplayBars(null)
        setChartView('tradingview')
        setDeskFallbackNote('Desk data unavailable — showing TradingView chart.')
        setLoading(false)
        setIntradayLoading(false)
        return
      }
      const resolved = resolveChartInterval(chartInterval, prefs.scanWindow, dataProvider)
      setDailyBars(ohlc)
      if (isIntradayDeskInterval(resolved)) {
        setChartBarInterval(resolved)
        setDisplayBars(null)
        setIntradayLoading(true)
        setLoading(true)
      } else {
        setDisplayBars(ohlc)
        setChartBarInterval('1d')
        setIntradayLoading(false)
        setLoading(false)
      }
      if (focusSnapshot) {
        setSelected(hitFromFocus(ohlc, focusSnapshot))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ticker, initialFocus])

  useEffect(() => {
    let cancelled = false
    if (!dailyBars?.length) return
    const fetchGen = ++intradayFetchGen.current
    const asOf = dailyBars[dailyBars.length - 1].t
    const resolved = resolveChartInterval(chartInterval, prefs.scanWindow, dataProvider)
    if (!isIntradayDeskInterval(resolved)) {
      setIntradayLoading(false)
      setLoading(false)
      setDisplayBars(dailyBars)
      setChartBarInterval('1d')
      return
    }
    const interval = resolved
    setChartBarInterval(interval)
    setIntradayLoading(true)
    setDisplayBars(null)
    const { fromTs, toTs } = intradayFetchRange(prefs.scanWindow, asOf)
    ;(async () => {
      const intraday = await fetchDeskIntraday(ticker, interval, fromTs, toTs)
      if (cancelled || fetchGen !== intradayFetchGen.current) return
      setIntradayLoading(false)
      setLoading(false)
      if (intraday?.bars.length) {
        setDisplayBars(intraday.bars)
        const prov = intraday.meta.provider
        if (prov === 'yahoo-finance2' || prov === 'eodhd') {
          setDataProvider(prov)
        }
        setChartBarInterval(intraday.meta.interval || interval)
        return
      }
      setDisplayBars(dailyBars)
      setChartBarInterval('1d')
    })()
    return () => {
      cancelled = true
    }
  }, [dailyBars, chartInterval, prefs.scanWindow, ticker, dataProvider])

  const scanResult = useMemo(() => {
    if (!dailyBars?.length) return null
    return scanPatterns(dailyBars, { window: prefs.scanWindow })
  }, [dailyBars, prefs.scanWindow])

  const baseCategories = scanResult?.categories ?? []
  const catalogTotal = scanResult?.catalogTotal ?? 0

  useEffect(() => {
    if (!dailyBars?.length || !scanResult?.asOf) return
    const builtIn = scanResult.hits
    const customHits = filterHitsByWindow(
      detectAllCustomRules(dailyBars, prefs.customPatterns),
      prefs.scanWindow,
      scanResult.asOf,
    )
    rememberHits(
      ticker,
      [...builtIn, ...customHits].map((h) => ({
        name: h.name,
        bias: h.bias,
        startT: h.startT,
        endT: h.endT,
        confidence: h.confidence,
      })),
      { scanWindow: prefs.scanWindow, asOf: scanResult.asOf },
    )
  }, [dailyBars, scanResult, prefs.customPatterns, prefs.scanWindow, rememberHits, ticker])

  const categories = enrichScanWithPrefs(
    baseCategories,
    prefs,
    dailyBars,
    prefs.scanWindow,
    ticker,
  )

  const windowBars = useMemo(
    () => (displayBars?.length ? filterBarsByWindow(displayBars, prefs.scanWindow) : null),
    [displayBars, prefs.scanWindow],
  )

  const effectiveInterval = useMemo(
    () => resolveChartInterval(chartInterval, prefs.scanWindow, dataProvider),
    [chartInterval, prefs.scanWindow, dataProvider],
  )

  const chartBars = useMemo(() => {
    if (!displayBars?.length) return null
    const isIntradayView = isIntradayDeskInterval(effectiveInterval)
    if (selected) return barsAroundHit(displayBars, selected, isIntradayView)
    return windowBars
  }, [displayBars, selected, windowBars, effectiveInterval])

  const tvInterval = tradingViewIntervalForPref(chartInterval, prefs.scanWindow, dataProvider)
  const tvRange = tradingViewRangeForWindow(prefs.scanWindow)
  const tvIntervalDeferred = useDeferredValue(tvInterval)
  const tvRangeDeferred = useDeferredValue(tvRange)

  const deskChartReady = Boolean(chartBars?.length) && !intradayLoading
  const showTradingView = chartView === 'tradingview' || (!deskChartReady && !intradayLoading && !loading)

  useEffect(() => {
    if (loading) return
    if (!deskChartReady && chartView === 'desk') {
      setChartView('tradingview')
      setDeskFallbackNote('Desk chart data unavailable for this view — showing TradingView.')
    }
  }, [loading, deskChartReady, chartView])

  useEffect(() => {
    if (!selected) return
    if (selected.id.startsWith('focus-')) return
    const stillVisible = categories.some((c) => c.hits.some((h) => h.id === selected.id))
    if (!stillVisible) setSelected(null)
  }, [categories, selected])

  const onSelectPattern = (hit: PatternHit) => {
    setSelected(hit)
    if (chartView === 'tradingview') {
      setChartView('desk')
      setDeskFallbackNote(null)
    }
  }

  const chartModeLabel =
    showTradingView
      ? 'TradingView'
      : isIntradayDeskInterval(effectiveInterval)
        ? `${chartIntervalShort(chartBarInterval as '5m' | '30m' | '1h' | '1d')} desk OHLC`
        : 'daily desk OHLC'

  const drawBias: PatternBias = selected?.bias ?? 'bullish'

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  if (saveDrawOpen && drawTools.length > 0) {
    return (
      <PatternCreateModal
        ticker={ticker}
        name={name}
        mode="draw-save"
        initialDraw={{ tools: drawTools, timeframe: drawTimeframe }}
        onClose={() => setSaveDrawOpen(false)}
        onSaved={(category) => {
          setSaveDrawOpen(false)
          setDrawTools([])
          setActiveCategory(category)
        }}
      />
    )
  }

  const modal = (
    <div
      className="fixed inset-0 z-[100] isolate flex flex-col bg-[var(--color-bg)]"
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
            {symbol} · {chartModeLabel}
            {selected ? ` · ${selected.name}` : ` · ${scanWindowLabel(prefs.scanWindow)}`}
          </p>
          {deskFallbackNote && (
            <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-300">{deskFallbackNote}</p>
          )}
          {showTradingView && selected && !deskFallbackNote && (
            <p className="mt-0.5 text-[10px] text-[var(--color-ink-soft)]">
              Pattern overlays are on the desk chart — switch to Desk to see lines on the chart.
            </p>
          )}
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
          <div className="flex rounded-lg border border-[var(--color-border)] text-[10px] font-bold">
            <button
              type="button"
              onClick={() => {
                setChartView('desk')
                setDeskFallbackNote(null)
              }}
              disabled={!deskChartReady}
              className={`rounded-l-lg px-2.5 py-1.5 ${
                !showTradingView
                  ? 'bg-sky-700 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]'
              } disabled:opacity-40`}
            >
              Desk
            </button>
            <button
              type="button"
              onClick={() => setChartView('tradingview')}
              className={`rounded-r-lg px-2.5 py-1.5 ${
                showTradingView
                  ? 'bg-sky-700 text-white'
                  : 'bg-[var(--color-bg)] text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]'
              }`}
            >
              TV
            </button>
          </div>
          {!showTradingView && drawTools.length > 0 && (
            <>
              <label className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--color-ink-soft)]">
                Scan
                <select
                  value={drawTimeframe}
                  onChange={(e) =>
                    setDrawTimeframe(e.target.value === 'weekly' ? 'weekly' : 'daily')
                  }
                  className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-[10px] font-bold"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </label>
              <button
                type="button"
                onClick={() => setSaveDrawOpen(true)}
                className="rounded-lg border border-teal-600 bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-900 dark:bg-teal-950/50 dark:text-teal-100"
              >
                Save drawing as pattern
              </button>
            </>
          )}
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-muted)]"
            >
              Clear pattern
            </button>
          )}
          <a
              href={tvUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-600 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-100"
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
        <div className="relative isolate min-h-[50vh] min-w-0 flex-1 overflow-hidden md:min-h-0">
          {loading || intradayLoading ? (
            <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-2 text-sm text-[var(--color-ink-soft)]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
              <span>
                {intradayLoading
                  ? `Loading ${chartIntervalShort(effectiveInterval)} bars…`
                  : 'Loading chart…'}
              </span>
            </div>
          ) : showTradingView ? (
            <TradingViewChart
              key={`tv-${ticker}`}
              ticker={ticker}
              fill
              range={tvRangeDeferred}
              interval={tvIntervalDeferred}
            />
          ) : (
            <AnnotatedPatternChart
              key={`desk-${ticker}`}
              bars={chartBars!}
              selected={selected}
              intraday={isIntradayDeskInterval(effectiveInterval)}
              drawEnabled
              drawTools={drawTools}
              onDrawToolsChange={setDrawTools}
              drawBias={drawBias}
            />
          )}
        </div>
        <div
          className="relative z-10 flex h-[45vh] min-h-0 shrink-0 flex-col border-t border-[var(--color-border)] bg-[var(--color-bg)] md:h-auto md:w-[min(400px,32vw)] md:border-l md:border-t-0"
        >
          <PatternPanel
            loading={loading}
            error={error}
            categories={categories}
            catalogTotal={catalogTotal}
            scanWindow={prefs.scanWindow}
            onScanWindowChange={setScanWindow}
            chartInterval={chartInterval}
            onChartIntervalChange={setChartInterval}
            chartBarInterval={effectiveInterval}
            activeCategory={activeCategory}
            selectedPatternId={selected?.id ?? null}
            onSelectCategory={setActiveCategory}
            onSelectPattern={onSelectPattern}
          />
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
