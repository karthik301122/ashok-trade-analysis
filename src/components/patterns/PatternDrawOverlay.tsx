import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { ArrowUpRight, Crosshair, Eraser, Minus, Pencil, Square, TrendingUp, X } from 'lucide-react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { OhlcBar, PatternBias } from '../../lib/patterns'
import { useIsDark } from '../../lib/useIsDark'
import {
  newDrawnTool,
  snapAnchorToBar,
  type DrawnAnchor,
  type DrawnTool,
  type DrawnToolType,
} from '../../lib/patterns/drawnPattern'

type ActiveTool = 'cursor' | 'eraser' | DrawnToolType

type Props = {
  bars: OhlcBar[]
  tools: DrawnTool[]
  onToolsChange: (tools: DrawnTool[]) => void
  bias: PatternBias
  chartRef: RefObject<IChartApi | null>
  seriesRef: RefObject<ISeriesApi<'Candlestick'> | null>
  wrapRef: RefObject<HTMLDivElement | null>
  chartReady: boolean
}

const TOOL_LABELS: Record<DrawnToolType, string> = {
  hline: 'Horizontal line',
  trendline: 'Trend line',
  ray: 'Ray',
  zone: 'Rectangle zone',
}

const HIT_PX = 10

function toolColor(type: DrawnToolType, dark: boolean): string {
  switch (type) {
    case 'hline':
      return dark ? '#38bdf8' : '#0284c7'
    case 'trendline':
      return dark ? '#a78bfa' : '#7c3aed'
    case 'ray':
      return dark ? '#34d399' : '#059669'
    case 'zone':
      return dark ? 'rgba(251, 191, 36, 0.35)' : 'rgba(245, 158, 11, 0.35)'
    default:
      return '#0ea5e9'
  }
}

function distToInfiniteLine(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len === 0) return Math.hypot(px - x1, py - y1)
  return Math.abs((dy * px - dx * py + x2 * y1 - y2 * x1) / len)
}

function helpForTool(active: ActiveTool, pending: number): string {
  if (active === 'cursor') return 'Crosshair — pan and zoom the chart.'
  if (active === 'eraser') return 'Click a drawing to remove it.'
  if (active === 'hline') return 'Click once to place a horizontal level.'
  if (active === 'trendline') {
    return pending
      ? 'Click second point for trend line.'
      : 'Click two points for a trend line.'
  }
  if (active === 'ray') {
    return pending ? 'Click to set ray direction.' : 'Click start, then direction for ray.'
  }
  return pending ? 'Click opposite corner for zone.' : 'Click two corners for a zone.'
}

export function PatternDrawOverlay({
  bars,
  tools,
  onToolsChange,
  bias,
  chartRef,
  seriesRef,
  wrapRef,
  chartReady,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dark = useIsDark()

  const [activeTool, setActiveTool] = useState<ActiveTool>('hline')
  const [pending, setPending] = useState<DrawnAnchor[]>([])
  const [hoverAnchor, setHoverAnchor] = useState<DrawnAnchor | null>(null)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [toolbarOpen, setToolbarOpen] = useState(false)

  const snapBars = bars.length > 260 ? bars.slice(-260) : bars
  const drawingActive = activeTool !== 'cursor'

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

    const drawPriceLabel = (x: number, y: number, price: number, color: string) => {
      const text = price.toFixed(2)
      ctx.font = '11px system-ui, sans-serif'
      const pad = 4
      const tw = ctx.measureText(text).width
      const boxW = tw + pad * 2
      const boxH = 18
      const bx = Math.min(Math.max(4, x + 6), w - boxW - 4)
      const by = Math.min(Math.max(4, y - boxH / 2), h - boxH - 4)
      ctx.fillStyle = color
      ctx.globalAlpha = 0.92
      ctx.beginPath()
      ctx.roundRect(bx, by, boxW, boxH, 3)
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#fff'
      ctx.fillText(text, bx + pad, by + 13)
    }

    const drawHLine = (price: number, color: string, dashed = false) => {
      const y = series.priceToCoordinate(price)
      if (y == null) return
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash(dashed ? [6, 4] : [])
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(w, y)
      ctx.stroke()
      ctx.setLineDash([])
      if (!dashed) drawPriceLabel(w - 80, y, price, color)
    }

    const drawTrendline = (a: DrawnAnchor, b: DrawnAnchor, color: string, dashed = false) => {
      const p1 = toXY(a)
      const p2 = toXY(b)
      if (!p1 || !p2) return
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx === 0 && dy === 0) return
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const extend = Math.max(w, h) * 2
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash(dashed ? [6, 4] : [])
      ctx.beginPath()
      ctx.moveTo(p1.x - ux * extend, p1.y - uy * extend)
      ctx.lineTo(p2.x + ux * extend, p2.y + uy * extend)
      ctx.stroke()
      ctx.setLineDash([])
    }

    const drawRay = (a: DrawnAnchor, b: DrawnAnchor, color: string, dashed = false) => {
      const p1 = toXY(a)
      const p2 = toXY(b)
      if (!p1 || !p2) return
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      if (dx === 0 && dy === 0) return
      const len = Math.hypot(dx, dy)
      const ux = dx / len
      const uy = dy / len
      const extend = Math.max(w, h) * 2
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.setLineDash(dashed ? [6, 4] : [])
      ctx.beginPath()
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p1.x + ux * extend, p1.y + uy * extend)
      ctx.stroke()
      ctx.setLineDash([])
      if (!dashed) drawPriceLabel(p1.x, p1.y, a.price, color)
    }

    const drawZone = (
      a: DrawnAnchor,
      b: DrawnAnchor,
      fill: string,
      stroke: string,
      dashed = false,
    ) => {
      const p1 = toXY(a)
      const p2 = toXY(b)
      if (!p1 || !p2) return
      const left = Math.min(p1.x, p2.x)
      const right = Math.max(p1.x, p2.x)
      const top = Math.min(p1.y, p2.y)
      const bottom = Math.max(p1.y, p2.y)
      if (!dashed) {
        ctx.fillStyle = fill
        ctx.fillRect(left, top, right - left, bottom - top)
      }
      ctx.strokeStyle = stroke
      ctx.lineWidth = 1.5
      ctx.setLineDash(dashed ? [6, 4] : [])
      ctx.strokeRect(left, top, right - left, bottom - top)
      ctx.setLineDash([])
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
      } else if (tool.type === 'ray' && tool.points.length >= 2) {
        drawRay(tool.points[0], tool.points[1], stroke)
      } else if (tool.type === 'zone' && tool.points.length >= 2) {
        drawZone(tool.points[0], tool.points[1], toolColor('zone', dark), stroke)
      }
    }

    const previewType =
      activeTool === 'cursor' || activeTool === 'eraser' ? null : activeTool
    if (previewType && pending.length && hoverAnchor) {
      const previewColor = dark ? '#f472b6' : '#db2777'
      if (previewType === 'hline') {
        drawHLine(hoverAnchor.price, previewColor, true)
      } else if (previewType === 'trendline') {
        drawTrendline(pending[0], hoverAnchor, previewColor, true)
      } else if (previewType === 'ray') {
        drawRay(pending[0], hoverAnchor, previewColor, true)
      } else if (previewType === 'zone') {
        drawZone(
          pending[0],
          hoverAnchor,
          dark ? 'rgba(244, 114, 182, 0.2)' : 'rgba(219, 39, 119, 0.15)',
          previewColor,
          true,
        )
      }
    }

    for (const p of pending) {
      const xy = toXY(p)
      if (!xy) continue
      ctx.fillStyle = dark ? '#f472b6' : '#db2777'
      ctx.beginPath()
      ctx.arc(xy.x, xy.y, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }, [tools, pending, hoverAnchor, activeTool, dark, chartRef, seriesRef, wrapRef])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !chartReady) return
    const onRange = () => redrawOverlay()
    chart.timeScale().subscribeVisibleLogicalRangeChange(onRange)
    redrawOverlay()
    return () => chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange)
  }, [chartReady, chartRef, redrawOverlay])

  useEffect(() => {
    redrawOverlay()
  }, [tools, pending, hoverAnchor, redrawOverlay, chartReady])

  const pointerToAnchor = useCallback(
    (clientX: number, clientY: number): DrawnAnchor | null => {
      const chart = chartRef.current
      const series = seriesRef.current
      const wrap = wrapRef.current
      if (!chart || !series || !wrap || !snapBars.length) return null
      const rect = wrap.getBoundingClientRect()
      const x = clientX - rect.left
      const y = clientY - rect.top
      const time = chart.timeScale().coordinateToTime(x)
      const price = series.coordinateToPrice(y)
      if (time == null || price == null || !Number.isFinite(price)) return null
      const t = Number(time)
      if (snapEnabled) return snapAnchorToBar(snapBars, t, price)
      return { time: t, price }
    },
    [snapBars, snapEnabled, chartRef, seriesRef, wrapRef],
  )

  const pointerToXY = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current
      if (!wrap) return null
      const rect = wrap.getBoundingClientRect()
      return { x: clientX - rect.left, y: clientY - rect.top }
    },
    [wrapRef],
  )

  const hitTestTool = useCallback(
    (clientX: number, clientY: number): string | null => {
      const chart = chartRef.current
      const series = seriesRef.current
      if (!chart || !series) return null
      const pt = pointerToXY(clientX, clientY)
      if (!pt) return null
      const timeScale = chart.timeScale()

      const toXY = (anchor: DrawnAnchor): { x: number; y: number } | null => {
        const x = timeScale.timeToCoordinate(anchor.time as UTCTimestamp)
        const y = series.priceToCoordinate(anchor.price)
        if (x == null || y == null) return null
        return { x, y }
      }

      let bestId: string | null = null
      let bestDist = HIT_PX

      for (const tool of tools) {
        if (tool.type === 'hline') {
          const y = series.priceToCoordinate(tool.points[0].price)
          if (y == null) continue
          const d = Math.abs(pt.y - y)
          if (d < bestDist) {
            bestDist = d
            bestId = tool.id
          }
          continue
        }

        if (tool.points.length < 2) continue
        const p1 = toXY(tool.points[0])
        const p2 = toXY(tool.points[1])
        if (!p1 || !p2) continue

        if (tool.type === 'zone') {
          const left = Math.min(p1.x, p2.x)
          const right = Math.max(p1.x, p2.x)
          const top = Math.min(p1.y, p2.y)
          const bottom = Math.max(p1.y, p2.y)
          const inside =
            pt.x >= left - HIT_PX &&
            pt.x <= right + HIT_PX &&
            pt.y >= top - HIT_PX &&
            pt.y <= bottom + HIT_PX
          const edgeDist = Math.min(
            Math.abs(pt.x - left),
            Math.abs(pt.x - right),
            Math.abs(pt.y - top),
            Math.abs(pt.y - bottom),
          )
          if (inside && edgeDist < bestDist) {
            bestDist = edgeDist
            bestId = tool.id
          }
          continue
        }

        const d = distToInfiniteLine(pt.x, pt.y, p1.x, p1.y, p2.x, p2.y)
        if (d < bestDist) {
          bestDist = d
          bestId = tool.id
        }
      }

      return bestId
    },
    [pointerToXY, tools, chartRef, seriesRef],
  )

  const finishTool = useCallback(
    (type: DrawnToolType, points: DrawnAnchor[]) => {
      const tool = newDrawnTool(type, points, bias)
      onToolsChange([...tools, tool])
      setPending([])
      setHoverAnchor(null)
    },
    [bias, onToolsChange, tools],
  )

  const selectTool = (tool: ActiveTool) => {
    setActiveTool(tool)
    setPending([])
    setHoverAnchor(null)
  }

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'cursor') return

    if (activeTool === 'eraser') {
      const id = hitTestTool(e.clientX, e.clientY)
      if (id) onToolsChange(tools.filter((t) => t.id !== id))
      return
    }

    const anchor = pointerToAnchor(e.clientX, e.clientY)
    if (!anchor) return

    if (activeTool === 'hline') {
      finishTool('hline', [anchor])
      return
    }

    if (activeTool === 'trendline' || activeTool === 'ray' || activeTool === 'zone') {
      if (pending.length === 0) {
        setPending([anchor])
      } else {
        finishTool(activeTool, [pending[0], anchor])
      }
    }
  }

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawingActive || activeTool === 'eraser') {
      setHoverAnchor(null)
      return
    }
    const anchor = pointerToAnchor(e.clientX, e.clientY)
    setHoverAnchor(anchor)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending([])
        setHoverAnchor(null)
        setToolbarOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toolbarBtn = (tool: ActiveTool, icon: ReactNode, label: string) => (
    <button
      key={tool}
      type="button"
      title={label}
      onClick={() => selectTool(tool)}
      className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
        activeTool === tool
          ? 'bg-teal-700 text-white shadow-sm'
          : 'text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)] hover:text-[var(--color-ink)]'
      }`}
    >
      {icon}
    </button>
  )

  const showHelp = toolbarOpen || activeTool !== 'cursor' || pending.length > 0

  if (!chartReady || !snapBars.length) return null

  return (
    <>
      <div
        className="absolute left-2 top-2 z-20"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {!toolbarOpen ? (
          <button
            type="button"
            title="Draw tools"
            onClick={() => setToolbarOpen(true)}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 shadow-md transition-colors hover:bg-[var(--color-muted)] text-teal-700 dark:text-teal-300"
          >
            <Pencil className="h-4 w-4" />
            <span className="text-[10px] font-bold uppercase tracking-wide">Draw</span>
          </button>
        ) : (
          <div className="flex flex-col gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-md">
            <div className="flex items-center justify-between gap-1 px-0.5 pb-0.5">
              <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--color-ink-soft)]">
                Draw
              </span>
              <button
                type="button"
                onClick={() => {
                  setToolbarOpen(false)
                  setPending([])
                  setHoverAnchor(null)
                }}
                className="rounded p-0.5 text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
                title="Close"
                aria-label="Close draw tools"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {toolbarBtn('cursor', <Crosshair className="h-4 w-4" />, 'Crosshair (pan & zoom)')}
            <div className="my-0.5 h-px bg-[var(--color-border)]" />
            {toolbarBtn('hline', <Minus className="h-4 w-4" />, TOOL_LABELS.hline)}
            {toolbarBtn('trendline', <TrendingUp className="h-4 w-4" />, TOOL_LABELS.trendline)}
            {toolbarBtn('ray', <ArrowUpRight className="h-4 w-4" />, TOOL_LABELS.ray)}
            {toolbarBtn('zone', <Square className="h-4 w-4" />, TOOL_LABELS.zone)}
            <div className="my-0.5 h-px bg-[var(--color-border)]" />
            {toolbarBtn('eraser', <Eraser className="h-4 w-4" />, 'Eraser')}
            <label
              className="mt-0.5 flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[var(--color-ink-soft)] hover:bg-[var(--color-muted)]"
              title="Snap to OHLC"
            >
              <input
                type="checkbox"
                checked={snapEnabled}
                onChange={(e) => setSnapEnabled(e.target.checked)}
              />
              Snap
            </label>
          </div>
        )}
      </div>

      <canvas
        ref={canvasRef}
        className={`absolute inset-0 z-10 ${
          drawingActive
            ? activeTool === 'eraser'
              ? 'cursor-cell'
              : 'cursor-crosshair'
            : 'pointer-events-none'
        }`}
        onClick={onCanvasClick}
        onMouseMove={onCanvasMove}
        onMouseLeave={() => setHoverAnchor(null)}
        onDoubleClick={() => {
          setPending([])
          setHoverAnchor(null)
        }}
      />

      {showHelp && (
        <div className="absolute bottom-2 left-2 z-20 max-w-[min(calc(100%-1rem),360px)] rounded-md bg-[var(--color-surface)]/90 px-2.5 py-1.5 text-[10px] text-[var(--color-ink-soft)] shadow-sm backdrop-blur-sm">
          {helpForTool(activeTool, pending.length)}
          {pending.length > 0 && ' Esc to cancel.'}
        </div>
      )}
    </>
  )
}
