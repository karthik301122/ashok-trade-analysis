import { useEffect, useState } from 'react'
import { ExternalLink, X } from 'lucide-react'
import { toTradingViewSymbol } from '../lib/tradingview'
import { fetchYahooOhlc } from '../lib/yahoo'
import {
  enrichScanWithPrefs,
  scanPatterns,
  type CategorySummary,
  type PatternCategoryId,
  type PatternHit,
  type OhlcBar,
} from '../lib/patterns'
import { TradingViewChart } from './TradingViewChart'
import { PatternPanel } from './patterns/PatternPanel'
import { AnnotatedPatternChart } from './patterns/AnnotatedPatternChart'
import { usePatternPrefs } from './patterns/PatternPrefsContext'

type Props = {
  ticker: string
  name?: string
  onClose: () => void
}

export function StockChartModal({ ticker, name, onClose }: Props) {
  const symbol = toTradingViewSymbol(ticker)
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`
  const { prefs, rememberHits } = usePatternPrefs()

  const [bars, setBars] = useState<OhlcBar[] | null>(null)
  const [baseCategories, setBaseCategories] = useState<CategorySummary[]>([])
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<PatternCategoryId | null>(null)
  const [selected, setSelected] = useState<PatternHit | null>(null)
  const [chartMode, setChartMode] = useState<'tv' | 'pattern'>('tv')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setSelected(null)
    setActiveCategory(null)
    setChartMode('tv')
    ;(async () => {
      const ohlc = await fetchYahooOhlc(ticker)
      if (cancelled) return
      if (!ohlc?.length) {
        setError('Could not load OHLC for pattern scan')
        setBars(null)
        setBaseCategories([])
        setLoading(false)
        return
      }
      const result = scanPatterns(ohlc)
      setBars(ohlc)
      setBaseCategories(result.categories)
      setCatalogTotal(result.catalogTotal)
      rememberHits(
        ticker,
        result.hits.map((h) => ({
          name: h.name,
          bias: h.bias,
          endT: h.endT,
          confidence: h.confidence,
        })),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ticker, rememberHits])

  const categories = enrichScanWithPrefs(baseCategories, prefs)

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
              : ' · TradingView + pattern scan'}
          </p>
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
          {chartMode === 'tv' || !bars ? (
            <TradingViewChart key={`tv-${ticker}`} ticker={ticker} fill />
          ) : (
            <AnnotatedPatternChart bars={bars} selected={selected} />
          )}
        </div>
        <div className="h-[40vh] shrink-0 md:h-auto md:w-[340px]">
          <PatternPanel
            loading={loading}
            error={error}
            categories={categories}
            catalogTotal={catalogTotal}
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
