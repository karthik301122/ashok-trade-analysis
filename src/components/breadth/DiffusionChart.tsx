import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  LineSeries,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type LineData,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { OhlcBar } from '../../lib/deskSeries'
import { useIsDark } from '../../lib/useIsDark'
import type { DrawnTool } from '../../lib/patterns/drawnPattern'
import { PatternDrawOverlay } from '../patterns/PatternDrawOverlay'

/** Fixed chart stack height */
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

function timeToUnix(time: Time): number {
  if (typeof time === 'string' && time.length >= 10) {
    return Math.floor(new Date(`${time.slice(0, 10)}T12:00:00Z`).getTime() / 1000)
  }
  if (typeof time === 'number' && Number.isFinite(time)) return time
  return 0
}

function coerceBarField(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : NaN
}

/** Synthetic OHLC for draw snap (line charts have no real H/L). */
function linePointsToSnapBars(points: { time: UTCTimestamp; value: number }[]): OhlcBar[] {
  return points.map((p) => {
    const t = Number(p.time)
    const c = p.value
    return { t, o: c, h: c, l: c, c, v: 0 }
  })
}

type PaneScale = 'index' | 'percent' | 'thrust'

function PaneLineChart({
  height,
  points,
  color,
  paneScale,
  referenceLevels,
  emptyMessage,
  drawTools,
  onDrawToolsChange,
}: {
  height: number
  points: { time: UTCTimestamp; value: number }[]
  color: string
  paneScale: PaneScale
  referenceLevels?: number[]
  emptyMessage: string
  drawTools: DrawnTool[]
  onDrawToolsChange: (tools: DrawnTool[]) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const [chartReady, setChartReady] = useState(false)
  const dark = useIsDark()
  const snapBars = useMemo(() => linePointsToSnapBars(points), [points])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return

    const priceFormat =
      paneScale === 'percent'
        ? ({ type: 'percent' } as const)
        : paneScale === 'thrust'
          ? ({ type: 'price', precision: 3, minMove: 0.001 } as const)
          : ({ type: 'price', precision: 2, minMove: 0.01 } as const)

    const chart = createChart(el, {
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
      timeScale: { borderVisible: false, timeVisible: false, secondsVisible: false },
      crosshair: { mode: 1 },
    })

    const series = chart.addSeries(LineSeries, {
      color,
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      priceFormat,
    })

    const removeTvLogo = () => el.querySelector('#tv-attr-logo')?.remove()
    removeTvLogo()
    requestAnimationFrame(removeTvLogo)
    setTimeout(removeTvLogo, 250)

    chartRef.current = chart
    seriesRef.current = series
    setChartReady(true)

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      priceLinesRef.current = []
      setChartReady(false)
    }
  }, [dark, color, paneScale])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series) return

    if (points.length < 2) {
      series.setData([])
      return
    }

    series.setData(points)

    for (const pl of priceLinesRef.current) {
      try {
        series.removePriceLine(pl)
      } catch {
        /* chart may have been remounted */
      }
    }
    priceLinesRef.current = []

    for (const level of referenceLevels ?? []) {
      priceLinesRef.current.push(
        series.createPriceLine({
          price: level,
          color: dark ? '#64748b' : '#94a3b8',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: '',
        }),
      )
    }

    chart.timeScale().fitContent()
  }, [points, referenceLevels, dark])

  if (points.length < 2) {
    return (
      <div
        className="flex items-center justify-center px-4 text-center text-xs text-[var(--color-ink-soft)]"
        style={{ height }}
      >
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div ref={wrapRef} className="h-full w-full" />
      {chartReady && (
        <PatternDrawOverlay
          bars={snapBars}
          tools={drawTools}
          onToolsChange={onDrawToolsChange}
          bias="neutral"
          chartRef={chartRef}
          seriesRef={seriesRef}
          wrapRef={wrapRef}
          chartReady={chartReady}
        />
      )}
    </div>
  )
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
  const [indexDrawTools, setIndexDrawTools] = useState<DrawnTool[]>([])
  const [breadthDrawTools, setBreadthDrawTools] = useState<DrawnTool[]>([])

  const indexPoints = useMemo(() => {
    const byDay = new Map<string, { time: UTCTimestamp; value: number }>()
    for (const b of indexBars) {
      const t = coerceBarField(b.t)
      const c = coerceBarField(b.c)
      if (!Number.isFinite(t) || !Number.isFinite(c)) continue
      const day = new Date(t * 1000).toISOString().slice(0, 10)
      const noon = Math.floor(new Date(`${day}T12:00:00Z`).getTime() / 1000) as UTCTimestamp
      byDay.set(day, { time: noon, value: c })
    }
    return [...byDay.values()].sort((a, b) => Number(a.time) - Number(b.time))
  }, [indexBars])

  const breadthPoints = useMemo(() => {
    return indicatorSeries
      .filter((p) => typeof p.value === 'number' && !Number.isNaN(p.value))
      .map((p) => ({
        time: timeToUnix(p.time) as UTCTimestamp,
        value: p.value as number,
      }))
      .filter((p) => p.time > 0)
      .sort((a, b) => Number(a.time) - Number(b.time))
  }, [indicatorSeries])

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
          <span className="ml-2 font-normal text-[var(--color-ink-soft)]">· Draw on each pane</span>
        </div>
        <div className="font-semibold text-[var(--color-ink-soft)]">
          {indicatorLabel}
          <span className="ml-2 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {valueLabel}
          </span>
        </div>
      </div>

      <div
        className="border-b border-[var(--color-border)] bg-[var(--color-surface)]"
        style={{ height: INDEX_PANE_PX }}
      >
        <PaneLineChart
          height={INDEX_PANE_PX}
          points={indexPoints}
          color="#f97316"
          paneScale="index"
          emptyMessage={`${indexLabel} line unavailable — breadth chart below still uses your selected universe.`}
          drawTools={indexDrawTools}
          onDrawToolsChange={setIndexDrawTools}
        />
      </div>

      <div style={{ height: BREADTH_PANE_PX }} className="bg-[var(--color-surface)]">
        <PaneLineChart
          height={BREADTH_PANE_PX}
          points={breadthPoints}
          color={indicatorColor}
          paneScale={scale === 'percent' ? 'percent' : 'thrust'}
          referenceLevels={referenceLevels}
          emptyMessage="Not enough breadth history to chart yet."
          drawTools={breadthDrawTools}
          onDrawToolsChange={setBreadthDrawTools}
        />
      </div>
    </div>
  )
}
