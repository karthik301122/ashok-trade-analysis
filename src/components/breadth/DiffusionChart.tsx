import { useEffect, useRef } from 'react'
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
  return bars.map((b) => ({
    time: b.t as UTCTimestamp,
    value: b.c,
  }))
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
  const indexWrapRef = useRef<HTMLDivElement>(null)
  const breadthWrapRef = useRef<HTMLDivElement>(null)
  const indexChartRef = useRef<IChartApi | null>(null)
  const breadthChartRef = useRef<IChartApi | null>(null)
  const indexSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const breadthSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const syncing = useRef(false)

  useEffect(() => {
    const indexEl = indexWrapRef.current
    const breadthEl = breadthWrapRef.current
    if (!indexEl || !breadthEl) return

    const indexChart = createChart(indexEl, {
      autoSize: true,
      layout: {
        background: { color: dark ? '#0f1419' : '#ffffff' },
        textColor: dark ? '#c8d0d8' : '#334155',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: dark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: dark ? '#1e293b' : '#e2e8f0' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
    })
    const breadthChart = createChart(breadthEl, {
      autoSize: true,
      layout: {
        background: { color: dark ? '#0f1419' : '#ffffff' },
        textColor: dark ? '#c8d0d8' : '#334155',
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: dark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: dark ? '#1e293b' : '#e2e8f0' },
      },
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

    indexChartRef.current = indexChart
    breadthChartRef.current = breadthChart
    indexSeriesRef.current = indexSeries
    breadthSeriesRef.current = breadthSeries

    return () => {
      indexChart.remove()
      breadthChart.remove()
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
    if (!indexSeries || !indexChart || !indexBars.length) return
    indexSeries.setData(barsToIndexLine(indexBars))
    indexChart.timeScale().fitContent()
  }, [indexBars])

  useEffect(() => {
    const breadthSeries = breadthSeriesRef.current
    const breadthChart = breadthChartRef.current
    if (!breadthSeries || !breadthChart) return

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
  }, [indicatorSeries, indicatorLabel, indicatorColor, referenceLevels, scale, dark])

  const valueLabel =
    scale === 'percent' ? `${currentValue.toFixed(1)}%` : currentValue.toFixed(3)

  return (
    <div className="flex h-full min-h-[520px] flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] lg:rounded-none lg:border-0">
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
      <div ref={indexWrapRef} className="h-[42%] min-h-[180px] w-full border-b border-[var(--color-border)]" />
      <div ref={breadthWrapRef} className="h-[58%] min-h-[240px] w-full flex-1" />
    </div>
  )
}
