import { useCallback, useEffect, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import type { OhlcBar, PatternBias } from '../../lib/patterns'
import { sanitizeOhlcBars } from '../../lib/ohlcSanitize'
import { useIsDark } from '../../lib/useIsDark'
import {
  describeDrawnTool,
  newDrawnTool,
  snapAnchorToBar,
  type DrawnAnchor,
  type DrawnTool,
  type DrawnToolType,
} from '../../lib/patterns/drawnPattern'

type Props = {
  bars: OhlcBar[]
  tools: DrawnTool[]
  onToolsChange: (tools: DrawnTool[]) => void
  bias: PatternBias
}

const TOOL_LABELS: Record<DrawnToolType, string> = {
  hline: 'Horizontal',
  trendline: 'Trendline',
  zone: 'Zone',
}

function barsToCandleData(bars: OhlcBar[]) {
  const clean = sanitizeOhlcBars(bars)
  return clean.map((b) => ({
    time: b.t as UTCTimestamp,
    open: b.o,
    high: b.h,
    low: b.l,
    close: b.c,
  }))
}

function toolColor(type: DrawnToolType, dark: boolean): string {
  switch (type) {
    case 'hline':
      return dark ? '#38bdf8' : '#0284c7'
    case 'trendline':
      return dark ? '#a78bfa' : '#7c3aed'
    case 'zone':
      return dark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(245, 158, 11, 0.35)'
    default:
      return '#0ea5e9'
  }
}

export function PatternDrawChart({ bars, tools, onToolsChange, bias }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const dark = useIsDark()

  const [activeType, setActiveType] = useState<DrawnToolType>('hline')
  const [pending, setPending] = useState<DrawnAnchor[]>([])
  const [snapEnabled, setSnapEnabled] = useState(true)

  const displayBars = bars.length > 260 ? bars.slice(-260) : bars

  const redrawOverlay = useCallback(() => {
    const canvas = canvasRef.current
    const chart = chartRef.current
    const series = seriesRef.current
    const wrap = wrapRef.current
    if (!canvas || !chart || !series || !wrap) return

    const rect = wrap.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, w, h)

    const timeScale = chart.timeScale()

    const toXY = (anchor: DrawnAnchor): { x: number; y: number } | null => {
      const x = timeScale.timeToCoordinate(anchor.time as UTCTimestamp)
      const y = series.priceToCoordinate(anchor.price)
      if (x == null || y == null) return null
      return { x, y }
    }

    const drawHLine = (price: number, color: string) => {
      const y = series.priceToCoordinate(price)
      if (y == null) return
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash([])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
    }

    const drawTrendline = (a: DrawnAnchor, b: DrawnAnchor, color: string) => {
      const p1 = toXY(a)
      const p2 = toXY(b)
      if (!p1 || !p2) return
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx === 0 && dy === 0) return
      const len = Math.sqrt(dx * dx + dy * dy)
      const ux = dx / len
      const uy = dy / len
      const extend = Math.max(w, h) * 2
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(p1.x - ux * extend, p1.y - uy * extend)
      ctx.lineTo(p2.x + ux * extend, p2.y + uy * extend)
      ctx.stroke()
    }

    const drawZone = (a: DrawnAnchor, b: DrawnAnchor, fill: string, stroke: string) => {
      const p1 = toXY(a)
      const p2 = toXY(b)
      if (!p1 || !p2) return
      const left = Math.min(p1.x, p2.x)
      const right = Math.max(p1.x, p2.x)
      const top = Math.min(p1.y, p2.y)
      const bottom = Math.max(p1.y, p2.y)
      ctx.fillStyle = fill
      ctx.fillRect(left, top, right - left, bottom - top)
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.strokeRect(left, top, right - left, bottom - top)
    }

    for (const tool of tools) {
      const stroke =
        tool.type === 'zone'
          ? dark
            ? '#fbbf24'
            : '#d97706'
          : toolColor(tool.type, dark)
      if (tool.type === 'hline') {
        drawHLine(tool.points[0].price, stroke)
      } else if (tool.type === 'trendline' && tool.points.length >= 2) {
        drawTrendline(tool.points[0], tool.points[1], stroke)
      } else if (tool.type === 'zone' && tool.points.length >= 2) {
        drawZone(tool.points[0], tool.points[1], toolColor('zone', dark), stroke)
      }
    }

    for (const p of pending) {
      const xy = toXY(p)
      if (!xy) continue
      ctx.fillStyle = dark ? '#f472b6' : '#db2777'
      ctx.beginPath()
      ctx.arc(xy.x, xy.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [tools, pending, dark])

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
      timeScale: { borderVisible: false, timeVisible: false, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#059669',
      downColor: '#e11d48',
      borderVisible: false,
      wickUpColor: '#059669',
      wickDownColor: '#e11d48',
    })
    chartRef.current = chart
    seriesRef.current = series

    const onRange = () => redrawOverlay()
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)

    const removeTvLogo = () => el.querySelector('#tv-attr-logo')?.remove()
    removeTvLogo()
    requestAnimationFrame(removeTvLogo)

    return () => {
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [dark, redrawOverlay])

  useEffect(() => {
    const chart = chartRef.current
    const series = seriesRef.current
    if (!chart || !series || !displayBars.length) return
    series.setData(barsToCandleData(displayBars))
    chart.timeScale().fitContent()
    requestAnimationFrame(() => redrawOverlay())
  }, [displayBars, redrawOverlay])

  useEffect(() => {
    redrawOverlay()
  }, [tools, pending, redrawOverlay])

  const pointerToAnchor = useCallback(
    (clientX: number, clientY: number): DrawnAnchor | null => {
      const chart = chartRef.current
      const series = seriesRef.current
      const wrap = wrapRef.current
      if (!chart || !series || !wrap || !displayBars.length) return null
      const rect = wrap.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const time = chart.timeScale().coordinateToTime(x)
      const price = series.coordinateToPrice(y)
      if (time == null || price == null || !Number.isFinite(price)) return null
      const t = Number(time)
      if (snapEnabled) return snapAnchorToBar(displayBars, t, price)
      return { time: t, price }
    },
    [displayBars, snapEnabled],
  )

  const finishTool = useCallback(
    (type: DrawnToolType, points: DrawnAnchor[]) => {
      const tool = newDrawnTool(type, points, bias)
      onToolsChange([...tools, tool])
      setPending([])
    },
    [bias, onToolsChange, tools],
  )

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const anchor = pointerToAnchor(e.clientX, e.clientY)
    if (!anchor) return

    if (activeType === 'hline') {
      finishTool('hline', [anchor])
      return
    }

    if (activeType === 'trendline') {
      if (pending.length === 0) {
        setPending([anchor])
      } else {
        finishTool('trendline', [pending[0], anchor])
      }
      return
    }

    if (activeType === 'zone') {
      if (pending.length === 0) {
        setPending([anchor])
      } else {
        finishTool('zone', [pending[0], anchor])
      }
    }
  }

  const removeTool = (id: string) => {
    onToolsChange(tools.filter((t) => t.id !== id))
  }

  const clearAll = () => {
    onToolsChange([])
    setPending([])
  }

  if (!displayBars.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-ink-soft)]">
        Load chart data to draw pattern levels on this stock.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(TOOL_LABELS) as DrawnToolType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              setActiveType(type)
              setPending([])
            }}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
              activeType === type
                ? 'bg-teal-700 text-white'
                : 'border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-muted)]'
            }`}
          >
            {TOOL_LABELS[type]}
          </button>
        ))}
        <label className="ml-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-ink-soft)]">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(e) => setSnapEnabled(e.target.checked)}
          />
          Snap to bar
        </label>
        <button
          type="button"
          disabled={!tools.length && !pending.length}
          onClick={clearAll}
          className="rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold hover:bg-[var(--color-muted)] disabled:opacity-40"
        >
          Clear drawing
        </button>
      </div>
      <p className="text-xs text-[var(--color-ink-soft)]">
        {activeType === 'hline'
          ? 'Click once on the chart to place a horizontal level.'
          : activeType === 'trendline'
            ? pending.length
              ? 'Click the second point to complete the trendline.'
              : 'Click two points to draw a trendline.'
            : pending.length
              ? 'Click opposite corner to complete the zone.'
              : 'Click two corners to draw a support/resistance zone.'}
      </p>
      <div
        ref={wrapRef}
        className="relative h-[min(52vh,420px)] w-full overflow-hidden rounded-xl border border-[var(--color-border)]"
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 z-10 cursor-crosshair"
          onClick={onCanvasClick}
        />
      </div>
      {tools.length > 0 && (
        <ul className="space-y-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs">
          {tools.map((tool) => (
            <li key={tool.id} className="flex items-start justify-between gap-2">
              <span>
                <span className="font-semibold">{TOOL_LABELS[tool.type]}</span>
                <span className="text-[var(--color-ink-soft)]"> · {describeDrawnTool(tool)}</span>
              </span>
              <button
                type="button"
                onClick={() => removeTool(tool.id)}
                className="shrink-0 text-rose-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
