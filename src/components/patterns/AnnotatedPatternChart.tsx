import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  type IPriceLine,
  type UTCTimestamp,
  type AutoscaleInfoProvider,
} from 'lightweight-charts'
import type { OhlcBar, PatternBias, PatternHit } from '../../lib/patterns'
import type { DrawnTool } from '../../lib/patterns/drawnPattern'
import { sanitizeOhlcBars } from '../../lib/ohlcSanitize'
import {
  applyIndicatorScaleMargins,
  activeSeriesKeys,
  ALL_DESK_SCALE_IDS,
  ALL_DESK_SERIES,
  defaultDeskIndicatorSet,
  allDeskIndicatorSet,
  macdHistogramData,
  seriesDataForKey,
  toLineData,
  volumeHistogramData,
  type DeskIndicatorId,
  type DeskSeriesKey,
} from '../../lib/chartIndicators'
import { useIsDark } from '../../lib/useIsDark'
import { DeskChartIndicatorBar } from './DeskChartIndicatorBar'
import { PatternDrawOverlay } from './PatternDrawOverlay'

type Props = {
  bars: OhlcBar[]
  selected: PatternHit | null
  intraday?: boolean
  drawEnabled?: boolean
  drawTools?: DrawnTool[]
  onDrawToolsChange?: (tools: DrawnTool[]) => void
  drawBias?: PatternBias
}

type IndicatorSeriesMap = Partial<
  Record<DeskSeriesKey, ISeriesApi<'Line'> | ISeriesApi<'Histogram'>>
>

function nearestBar(bars: OhlcBar[], t: number): OhlcBar | null {
  if (!bars.length) return null
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

function priceAt(bars: OhlcBar[], t: number): number {
  return nearestBar(bars, t)?.c ?? bars.at(-1)!.c
}

function priceRangeForBars(bars: { l: number; h: number }[]) {
  if (!bars.length) return null
  let min = bars[0].l
  let max = bars[0].h
  for (const b of bars) {
    if (b.l < min) min = b.l
    if (b.h > max) max = b.h
  }
  const span = max - min
  const pad = span > 0 ? span * 0.06 : max * 0.02 || 1
  return { minValue: min - pad, maxValue: max + pad }
}

function barsToCandleData(bars: OhlcBar[]): CandlestickData<Time>[] {
  const clean = sanitizeOhlcBars(bars)
  return clean.map((b) => ({
    time: b.t as UTCTimestamp,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
  }))
}

const intradayAutoscale: AutoscaleInfoProvider = (original) => {
  const res = original()
  if (!res?.priceRange) return res
  const { minValue, maxValue } = res.priceRange
  const mid = (maxValue + minValue) / 2
  const span = maxValue - minValue
  const minSpan = Math.max(mid * 0.012, 0.05)
  if (span >= minSpan) return res
  return {
    priceRange: {
      minValue: mid - minSpan / 2,
      maxValue: mid + minSpan / 2,
    },
  }
}

export function AnnotatedPatternChart({
  bars,
  selected,
  intraday = false,
  drawEnabled = false,
  drawTools = [],
  onDrawToolsChange,
  drawBias = 'neutral',
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const indicatorRefs = useRef<IndicatorSeriesMap>({})
  const priceLinesRef = useRef<IPriceLine[]>([])
  const [chartReady, setChartReady] = useState(false)
  const [activeIndicators, setActiveIndicators] = useState<Set<DeskIndicatorId>>(
    () => defaultDeskIndicatorSet(),
  )
  const dark = useIsDark()

  const toggleIndicator = useCallback((id: DeskIndicatorId) => {
    setActiveIndicators((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const allIndicatorsOn = useCallback(() => setActiveIndicators(allDeskIndicatorSet()), [])
  const allIndicatorsOff = useCallback(() => setActiveIndicators(new Set()), [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
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
      timeScale: {
        borderVisible: false,
        timeVisible: intraday,
        secondsVisible: false,
      },
    })
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#059669',
      downColor: '#e11d48',
      borderVisible: false,
      wickUpColor: '#059669',
      wickDownColor: '#e11d48',
    })
    const line = chart.addSeries(LineSeries, {
      color: '#0ea5e9',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    })

    const indMap: IndicatorSeriesMap = {}
    for (const s of ALL_DESK_SERIES) {
      if (s.kind === 'histogram') {
        indMap[s.key] = chart.addSeries(HistogramSeries, {
          priceScaleId: s.scaleId,
          priceFormat: s.key === 'volume' ? { type: 'volume' } : undefined,
          lastValueVisible: false,
          priceLineVisible: false,
        })
      } else {
        indMap[s.key] = chart.addSeries(LineSeries, {
          color: s.color,
          lineWidth: (s.lineWidth ?? 2) as 1 | 2 | 3 | 4,
          priceScaleId: s.scaleId,
          lastValueVisible: false,
          priceLineVisible: false,
        })
      }
    }

    chart.priceScale('right').applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    })
    for (const scaleId of ALL_DESK_SCALE_IDS) {
      if (scaleId === 'right') continue
      chart.priceScale(scaleId).applyOptions({ visible: false })
    }

    const removeTvLogo = () => wrapRef.current?.querySelector('#tv-attr-logo')?.remove()
    removeTvLogo()
    requestAnimationFrame(removeTvLogo)
    setTimeout(removeTvLogo, 250)
    chartRef.current = chart
    candleRef.current = candle
    lineRef.current = line
    indicatorRefs.current = indMap
    setChartReady(true)

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      lineRef.current = null
      indicatorRefs.current = {}
      setChartReady(false)
    }
  }, [dark])

  useEffect(() => {
    const chart = chartRef.current
    const candle = candleRef.current
    if (!chart || !candle || !bars.length) return

    const clean = sanitizeOhlcBars(bars).map((b) => ({ ...b, v: b.v ?? 0 }))
    const priceRange = priceRangeForBars(clean)
    candle.applyOptions({
      autoscaleInfoProvider: intraday
        ? intradayAutoscale
        : priceRange
          ? () => ({
              priceRange: {
                minValue: priceRange.minValue,
                maxValue: priceRange.maxValue,
              },
            })
          : undefined,
    })
    chart.timeScale().applyOptions({
      timeVisible: intraday,
      barSpacing: intraday && clean.length > 40 ? 6 : undefined,
      minBarSpacing: intraday && clean.length > 40 ? 4 : undefined,
      maxBarSpacing: intraday && clean.length > 40 ? 10 : undefined,
    })
    candle.setData(barsToCandleData(bars))
    chart.timeScale().fitContent()
  }, [bars, intraday])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady || !bars.length) return

    const clean = sanitizeOhlcBars(bars).map((b) => ({ ...b, v: b.v ?? 0 }))
    applyIndicatorScaleMargins(chart, activeIndicators)

    const keys = activeSeriesKeys(activeIndicators)
    for (const s of ALL_DESK_SERIES) {
      const series = indicatorRefs.current[s.key]
      if (!series) continue
      if (!keys.has(s.key)) {
        series.setData([])
        continue
      }
      if (s.kind === 'histogram') {
        const hist = series as ISeriesApi<'Histogram'>
        if (s.key === 'volume') hist.setData(volumeHistogramData(clean))
        else if (s.key === 'macd_hist') hist.setData(macdHistogramData(clean))
        else hist.setData(toLineData(seriesDataForKey(s.key, clean)))
      } else {
        ;(series as ISeriesApi<'Line'>).setData(toLineData(seriesDataForKey(s.key, clean)))
      }
    }
  }, [bars, activeIndicators, chartReady])

  useEffect(() => {
    const candle = candleRef.current
    const line = lineRef.current
    const chart = chartRef.current
    if (!candle || !line || !chart) return

    for (const pl of priceLinesRef.current) {
      try {
        candle.removePriceLine(pl)
      } catch {
        /* ignore */
      }
    }
    priceLinesRef.current = []
    line.setData([])

    if (!selected) {
      return
    }

    const color =
      selected.bias === 'bullish' ? '#059669' : selected.bias === 'bearish' ? '#e11d48' : '#ca8a04'

    const startBar = nearestBar(bars, selected.startT)
    const endBar = nearestBar(bars, selected.endT)
    const pts = selected.points?.length
      ? selected.points.map((p) => ({
          time: nearestBar(bars, p.time)?.t ?? p.time,
          price: p.price || priceAt(bars, p.time),
        }))
      : [
          {
            time: startBar?.t ?? selected.startT,
            price: startBar?.c ?? priceAt(bars, selected.startT),
          },
          {
            time: endBar?.t ?? selected.endT,
            price: endBar?.c ?? priceAt(bars, selected.endT),
          },
        ]

    const lineData: LineData<Time>[] = [...pts]
      .sort((a, b) => a.time - b.time)
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.price }))
    const dedup: LineData<Time>[] = []
    for (const p of lineData) {
      if (dedup.length && dedup[dedup.length - 1].time === p.time) {
        dedup[dedup.length - 1] = p
      } else {
        dedup.push(p)
      }
    }
    line.applyOptions({ color })
    line.setData(dedup)

    const mid = pts.reduce((a, p) => a + p.price, 0) / pts.length
    const pl = candle.createPriceLine({
      price: mid,
      color,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: selected.name,
    })
    priceLinesRef.current.push(pl)

    const fromT = Math.min(selected.startT, selected.endT) - (intraday ? 6 * 3600 : 40 * 86400)
    const toT = Math.max(selected.startT, selected.endT) + (intraday ? 2 * 3600 : 15 * 86400)
    try {
      chart.timeScale().setVisibleRange({
        from: fromT as UTCTimestamp,
        to: toT as UTCTimestamp,
      })
    } catch {
      chart.timeScale().fitContent()
    }
  }, [selected, bars, intraday])

  const showDrawOverlay = drawEnabled && onDrawToolsChange && drawTools && chartReady

  return (
    <div className="relative h-full w-full">
      <div ref={wrapRef} className="h-full w-full" />
      {chartReady && (
        <DeskChartIndicatorBar
          active={activeIndicators}
          onToggle={toggleIndicator}
          onAllOn={allIndicatorsOn}
          onAllOff={allIndicatorsOff}
        />
      )}
      {showDrawOverlay && (
        <PatternDrawOverlay
          bars={bars}
          tools={drawTools}
          onToolsChange={onDrawToolsChange}
          bias={drawBias}
          chartRef={chartRef}
          seriesRef={candleRef}
          wrapRef={wrapRef}
          chartReady={chartReady}
        />
      )}
    </div>
  )
}
