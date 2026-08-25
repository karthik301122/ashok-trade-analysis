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
import { useIsDark } from '../../lib/useIsDark'

type Props = {
  bars: OhlcBar[]
  selected: PatternHit | null
}

export function AnnotatedPatternChart({ bars, selected }: Props) {
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
      },
      grid: {
        vertLines: { color: dark ? '#1e293b' : '#e2e8f0' },
        horzLines: { color: dark ? '#1e293b' : '#e2e8f0' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true },
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
    const data: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.t as UTCTimestamp,
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
    }))
    candle.setData(data)
    chart.timeScale().fitContent()
    chartRef.current = chart
    candleRef.current = candle
    lineRef.current = line

    return () => {
      chart.remove()
      chartRef.current = null
      candleRef.current = null
      lineRef.current = null
    }
  }, [bars, dark])

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
      chart.timeScale().fitContent()
      return
    }

    const color =
      selected.bias === 'bullish' ? '#059669' : selected.bias === 'bearish' ? '#e11d48' : '#ca8a04'

    const pts = selected.points?.length
      ? selected.points
      : [{ time: selected.endT, price: bars.find((b) => b.t === selected.endT)?.c ?? bars.at(-1)!.c }]

    const lineData: LineData<Time>[] = [...pts]
      .sort((a, b) => a.time - b.time)
      .map((p) => ({ time: p.time as UTCTimestamp, value: p.price }))
    line.applyOptions({ color })
    line.setData(lineData)

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

    chart.timeScale().setVisibleRange({
      from: (selected.startT - 25 * 86400) as UTCTimestamp,
      to: (selected.endT + 12 * 86400) as UTCTimestamp,
    })
  }, [selected, bars])

  return <div ref={wrapRef} className="h-full w-full" />
}
