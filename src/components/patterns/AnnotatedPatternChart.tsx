import { useEffect, useRef } from 'react'
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
  type IPriceLine,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { OhlcBar, PatternHit } from '../../lib/patterns'
import { sanitizeOhlcBars } from '../../lib/ohlcSanitize'
import { useIsDark } from '../../lib/useIsDark'

type Props = {
  bars: OhlcBar[]
  selected: PatternHit | null
  intraday?: boolean
}

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

function priceRangeForBars(
  bars: { l: number; h: number }[],
) {
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

export function AnnotatedPatternChart({ bars, selected, intraday = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const lineRef = useRef<ISeriesApi<'Line'> | null>(null)
  const priceLinesRef = useRef<IPriceLine[]>([])
  const dark = useIsDark()

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
    const clean = sanitizeOhlcBars(bars)
    const priceRange = priceRangeForBars(clean)
    const data: CandlestickData<Time>[] = clean.map((b) => ({
      time: b.t as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }))
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#059669',
      downColor: '#e11d48',
      borderVisible: false,
      wickUpColor: '#059669',
      wickDownColor: '#e11d48',
      autoscaleInfoProvider: priceRange
        ? () => ({
            priceRange: {
              minValue: priceRange.minValue,
              maxValue: priceRange.maxValue,
            },
          })
        : undefined,
    })
    const line = chart.addSeries(LineSeries, {
      color: '#0ea5e9',
      lineWidth: 2,
      lastValueVisible: false,
      priceLineVisible: false,
    })
    candle.setData(data)
    if (intraday && clean.length > 40) {
      const spacing = 6
      chart.timeScale().applyOptions({
        barSpacing: spacing,
        minBarSpacing: spacing,
        maxBarSpacing: spacing,
      })
    }
    chart.priceScale('right').applyOptions({
      autoScale: true,
      scaleMargins: { top: 0.08, bottom: 0.08 },
    })
    chart.timeScale().fitContent()
    const removeTvLogo = () => wrapRef.current?.querySelector('#tv-attr-logo')?.remove()
    removeTvLogo()
    requestAnimationFrame(removeTvLogo)
    setTimeout(removeTvLogo, 250)
    chartRef.current = chart
    candleRef.current = candle
    lineRef.current = line

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      lineRef.current = null
    }
  }, [bars, dark, intraday])

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
    // Deduplicate identical times for lightweight-charts
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

    const fromT = Math.min(selected.startT, selected.endT) - 40 * 86400
    const toT = Math.max(selected.startT, selected.endT) + 15 * 86400
    try {
      chart.timeScale().setVisibleRange({
        from: fromT as UTCTimestamp,
        to: toT as UTCTimestamp,
      })
    } catch {
      chart.timeScale().fitContent()
    }
  }, [selected, bars])

  return <div ref={wrapRef} className="h-full w-full" />
}
