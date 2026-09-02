import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { fetchYahooOhlc } from '../../lib/yahoo'
import { filterBarsByWindow } from '../../lib/patterns'
import type { OhlcBar, PatternBias, PatternCategoryId } from '../../lib/patterns'
import type { DrawnTool } from '../../lib/patterns/drawnPattern'
import { AnnotatedPatternChart } from './AnnotatedPatternChart'
import { PatternCreatePanel, type DetectMode } from './PatternCreatePanel'
import { usePatternPrefs } from './usePatternPrefs'

type Props = {
  ticker: string
  name?: string
  onClose: () => void
  onSaved?: (category: PatternCategoryId) => void
}

export function PatternCreateModal({ ticker, name, onClose, onSaved }: Props) {
  const { prefs } = usePatternPrefs()
  const [dailyBars, setDailyBars] = useState<OhlcBar[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [drawTools, setDrawTools] = useState<DrawnTool[]>([])
  const [drawTimeframe, setDrawTimeframe] = useState<'daily' | 'weekly'>('daily')
  const [detectMode, setDetectMode] = useState<DetectMode>('rules')
  const [createBias, setCreateBias] = useState<PatternBias>('bullish')

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setDailyBars(null)
    setDrawTools([])
    ;(async () => {
      const ohlc = await fetchYahooOhlc(ticker)
      if (cancelled) return
      if (!ohlc?.length) {
        setError('Could not load chart data for this ticker')
        setDailyBars(null)
      } else {
        setDailyBars(ohlc)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [ticker])

  const chartBars = useMemo(() => {
    if (!dailyBars?.length) return null
    const daily = filterBarsByWindow(dailyBars, prefs.scanWindow)
    const base =
      daily.length >= 10
        ? daily
        : dailyBars.slice(-Math.min(260, dailyBars.length))
    return base.length > 260 ? base.slice(-260) : base
  }, [dailyBars, prefs.scanWindow])

  const showChart = detectMode === 'draw' && Boolean(chartBars?.length)

  const modal = (
    <div
      className="fixed inset-0 z-[110] isolate flex flex-col bg-[var(--color-bg)]"
      role="dialog"
      aria-modal="true"
      aria-label="Create my pattern"
    >
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-teal-900 dark:text-teal-100">
            Create my pattern
          </h1>
          <p className="text-xs text-[var(--color-ink-soft)]">
            {ticker}
            {name ? ` · ${name}` : ''} · Private pattern on this device · scans full ASX when saved
          </p>
          {detectMode === 'draw' && chartBars && (
            <p className="mt-0.5 text-[10px] text-teal-700 dark:text-teal-300">
              Open Draw on the chart, place levels/lines, then save below.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--color-muted)]"
        >
          <X size={16} />
          Close
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {showChart && (
          <div
            className={`relative isolate min-h-[40vh] min-w-0 overflow-hidden border-b border-[var(--color-border)] bg-[var(--color-muted)]/30 lg:min-h-0 lg:flex-1 lg:border-b-0 lg:border-r ${
              detectMode === 'draw' ? '' : 'lg:max-w-[45%]'
            }`}
          >
            {loading ? (
              <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-2 text-sm text-[var(--color-ink-soft)]">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-200 border-t-teal-600" />
                Loading chart…
              </div>
            ) : error ? (
              <div className="flex h-full min-h-[40vh] items-center justify-center px-6 text-sm text-rose-600">
                {error}
              </div>
            ) : chartBars ? (
              <AnnotatedPatternChart
                key={`create-${ticker}`}
                bars={chartBars}
                selected={null}
                drawEnabled={detectMode === 'draw'}
                drawTools={drawTools}
                onDrawToolsChange={setDrawTools}
                drawBias={createBias}
              />
            ) : null}
          </div>
        )}

        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-bg)] ${
            showChart ? 'lg:max-w-[min(640px,48vw)] lg:shrink-0' : 'mx-auto w-full max-w-3xl'
          }`}
        >
          <PatternCreatePanel
            variant="studio"
            ticker={ticker}
            drawTools={drawTools}
            onDrawToolsChange={setDrawTools}
            drawTimeframe={drawTimeframe}
            onDrawTimeframeChange={setDrawTimeframe}
            onDetectModeChange={setDetectMode}
            onBiasChange={setCreateBias}
            onSaved={(category) => {
              onSaved?.(category)
              onClose()
            }}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
