import { useEffect, useRef, useState } from 'react'
import {
  createChart,
  LineSeries,
  LineStyle,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { OhlcBar } from '../../lib/yahoo'
import { useIsDark } from '../../lib/useIsDark'

/** Fixed chart stack height — avoids autoSize + flex feedback loops. */
const CHART_HEIGHT_PX = 560
const INDEX_PANE_PX = Math.round(CHART_HEIGHT_PX * 0.42)
const BREADTH_PANE_PX = CHART_HEIGHT_PX - INDEX_PANE_PX

type Props = {
  indexBars: OhlcBar[]
  indexLabel: string
  indicatorLabel: string
  indicatorSeries: LineData<Time>[]
  indicatorColor?: string
  currentValue: number
  scale: 'percent' | 'thrust'
  referenceLevels: number[]
}

function barsToIndexLine(bars: OhlcBar[]): LineData<Time>[] {
  const out: LineData<Time>[] = []
  for (const b of bars) {
    const t = b.t
    const c = b.c
    if (!Number.isFinite(t) || !Number.isFinite(c)) continue
    out.push({ time: t as UTCTimestamp, value: c })
  }
  return out.sort((a, b) => (a.time as number) - (b.time as number))
}

export function DiffusionChart({
  indexBars,
  indexLabel,
  indicatorLabel,
  indicatorSeries,
  indicatorColor = '#22c55e',
  currentValue,
  scale,
  referenceLevels,
}: Props) {
  const dark = useIsDark()
  const [indexChartError, setIndexChartError] = useState<string | null>(null)
  const [breadthChartError, setBreadthChartError] = useState<string | null>(null)
  const indexWrapRef = useRef<HTMLDivElement>(null)
  const breadthWrapRef = useRef<HTMLDivElement>(null)
  const indexChartRef = useRef<IChartApi | null>(null)
  const breadthChartRef = useRef<IChartApi | null>(null)
  const indexSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const breadthSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const syncing = useRef(false)
  const fittedRef = useRef(false)

  useEffect(() => {
    setIndexChartError(null)
    setBreadthChartError(null)
    const indexEl = indexWrapRef.current
    const breadthEl = breadthWrapRef.current
    if (!indexEl || !breadthEl) return

    let indexChart: IChartApi | null = null
    let breadthChart: IChartApi | null = null
    let ro: ResizeObserver | null = null

    try {
      const chartLayout = {
        background: { color: dark ? '#0f1419' : '#ffffff' },
        textColor: dark ? '#c8d0d8' : '#334155',
        attributionLogo: false,
      }
      const grid = {
        vertLines: { color: dark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: dark ? '#1e293b' : '#e2e8f0' },
      }

      indexChart = createChart(indexEl, {
        width: Math.max(1, indexEl.clientWidth),
        height: INDEX_PANE_PX,
        layout: chartLayout,
        grid,
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      })
      breadthChart = createChart(breadthEl, {
        width: Math.max(1, breadthEl.clientWidth),
        height: BREADTH_PANE_PX,
        layout: chartLayout,
        grid,
        rightPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      })

      const indexSeries = indexChart.addSeries(LineSeries, {
        color: '#f97316',
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        title: indexLabel,
      })
      const breadthSeries = breadthChart.addSeries(LineSeries, {
        color: indicatorColor,
        lineWidth: 2,
        priceLineVisible: true,
        lastValueVisible: true,
        title: indicatorLabel,
      })

      indexChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.1, bottom: 0.1 } })
      breadthChart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } })

      const removeLogos = () => {
        indexEl.querySelector('#tv-attr-logo')?.remove()
        breadthEl.querySelector('#tv-attr-logo')?.remove()
      }
      removeLogos()
      requestAnimationFrame(removeLogos)

      const syncRange = (source: IChartApi, target: IChartApi) => {
        source.timeScale().subscribeVisibleLogicalRangeChange((range) => {
          if (syncing.current || !range) return
          syncing.current = true
          try {
            target.timeScale().setVisibleLogicalRange(range)
          } catch {
            /* ignore */
          }
          syncing.current = false
        })
      }
      syncRange(indexChart, breadthChart)
      syncRange(breadthChart, indexChart)

      ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.floor(entry.contentRect.width)
          if (w < 1) continue
          if (entry.target === indexEl) indexChart?.applyOptions({ width: w })
          if (entry.target === breadthEl) breadthChart?.applyOptions({ width: w })
        }
      })
      ro.observe(indexEl)
      ro.observe(breadthEl)

      indexChartRef.current = indexChart
      breadthChartRef.current = breadthChart
      indexSeriesRef.current = indexSeries
      breadthSeriesRef.current = breadthSeries
      fittedRef.current = false
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setIndexChartError(message)
      setBreadthChartError(message)
      indexChart?.remove()
      breadthChart?.remove()
      return undefined
    }

    return () => {
      ro?.disconnect()
      indexChart?.remove()
      breadthChart?.remove()
      indexChartRef.current = null
      breadthChartRef.current = null
      indexSeriesRef.current = null
      breadthSeriesRef.current = null
      priceLinesRef.current = []
    }
  }, [dark, indexLabel, indicatorLabel, indicatorColor])

  useEffect(() => {
    const indexSeries = indexSeriesRef.current
    const indexChart = indexChartRef.current
    if (!indexSeries || !indexChart) return
    if (!indexBars.length) return
    try {
      indexSeries.setData(barsToIndexLine(indexBars))
      indexChart.timeScale().fitContent()
      fittedRef.current = true
      setIndexChartError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setIndexChartError(message)
    }
  }, [indexBars])

  useEffect(() => {
    const breadthSeries = breadthSeriesRef.current
    const breadthChart = breadthChartRef.current
    if (!breadthSeries || !breadthChart) return

    try {
      for (const pl of priceLinesRef.current) {
        try {
          breadthSeries.removePriceLine(pl)
        } catch {
          /* ignore */
        }
      }
      priceLinesRef.current = []

      breadthSeries.applyOptions({
        color: indicatorColor,
        title: indicatorLabel,
        autoscaleInfoProvider:
          scale === 'percent'
            ? () => ({
                priceRange: { minValue: 0, maxValue: 100 },
              })
            : undefined,
      })
      breadthSeries.setData(indicatorSeries)

      for (const level of referenceLevels) {
        const pl = breadthSeries.createPriceLine({
          price: level,
          color: dark ? '#64748b' : '#94a3b8',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: String(level),
        })
        priceLinesRef.current.push(pl)
      }

      breadthChart.timeScale().fitContent()
      setBreadthChartError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setBreadthChartError(message)
    }
  }, [indicatorSeries, indicatorLabel, indicatorColor, referenceLevels, scale, dark])

  const valueLabel =
    scale === 'percent' ? `${currentValue.toFixed(1)}%` : currentValue.toFixed(3)

  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] lg:rounded-none lg:border-0"
      style={{ height: CHART_HEIGHT_PX }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 text-xs">
        <div className="font-semibold text-[var(--color-ink-soft)]">
          {indexLabel}
          <span className="ml-2 text-[var(--color-ink)]">Daily</span>
        </div>
        <div className="font-semibold text-[var(--color-ink-soft)]">
          {indicatorLabel}
          <span className="ml-2 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {valueLabel}
          </span>
        </div>
      </div>
      <div
        className="relative w-full overflow-hidden border-b border-[var(--color-border)]"
        style={{ height: INDEX_PANE_PX }}
      >
        <div ref={indexWrapRef} className="h-full w-full" />
        {!indexBars.length && !indexChartError && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--color-surface)]/90 text-xs text-[var(--color-ink-soft)]">
            Loading ASX 200 index…
          </div>
        )}
        {indexChartError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--color-surface)]/95 px-4 text-center text-xs text-rose-700 dark:text-rose-300">
            <p className="font-semibold">Index chart unavailable</p>
            <p className="font-mono text-[10px] text-[var(--color-ink-soft)]">{indexChartError}</p>
          </div>
        )}
      </div>
      <div className="relative w-full overflow-hidden" style={{ height: BREADTH_PANE_PX }}>
        <div ref={breadthWrapRef} className="h-full w-full" />
        {breadthChartError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[var(--color-surface)]/95 px-4 text-center text-xs text-rose-700 dark:text-rose-300">
            <p className="font-semibold">Breadth chart unavailable</p>
            <p className="font-mono text-[10px] text-[var(--color-ink-soft)]">{breadthChartError}</p>
          </div>
        )}
      </div>
    </div>
  )
}
