import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import type { OhlcBar, PatternBias } from '../../lib/patterns'
import { useIsDark } from '../../lib/useIsDark'
import { getDrawToolDef } from '../../lib/patterns/drawToolCatalog'
import {
  hitTestDrawnTool,
  renderDrawnTool,
  type ChartDrawContext,
} from '../../lib/patterns/drawToolRender'
import {
  newDrawnTool,
  snapAnchorToBar,
  type DrawnAnchor,
  type DrawnTool,
  type DrawnToolType,
} from '../../lib/patterns/drawnPattern'
import {
  PatternDrawToolbar,
  helpForDrawTool,
  type ActiveDrawTool,
} from './PatternDrawToolbar'

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

  const [activeTool, setActiveTool] = useState<ActiveDrawTool>('cursor')
  const [pending, setPending] = useState<DrawnAnchor[]>([])
  const [hoverAnchor, setHoverAnchor] = useState<DrawnAnchor | null>(null)
  const [snapEnabled, setSnapEnabled] = useState(true)
  const [toolbarOpen, setToolbarOpen] = useState(false)
  const [brushStroke, setBrushStroke] = useState<DrawnAnchor[]>([])
  const brushing = useRef(false)

  const snapBars = bars.length > 260 ? bars.slice(-260) : bars
  const chartToolActive = activeTool !== 'cursor' && activeTool !== 'eraser'
  const pointerOnOverlay = activeTool !== 'cursor'

  const buildContext = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number): ChartDrawContext | null => {
      const chart = chartRef.current
      const series = seriesRef.current
      if (!chart || !series) return null
      const timeScale = chart.timeScale()
      return {
        ctx,
        width: w,
        height: h,
        dark,
        toXY: (anchor: DrawnAnchor) => {
          const x = timeScale.timeToCoordinate(anchor.time as UTCTimestamp)
          const y = series.priceToCoordinate(anchor.price)
          if (x == null || y == null) return null
          return { x, y }
        },
        priceToY: (price: number) => series.priceToCoordinate(price),
        drawPriceLabel: (x: number, y: number, price: number, color: string) => {
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
        },
      }
    },
    [chartRef, seriesRef, dark],
  )

  const redrawOverlay = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return

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

    const c = buildContext(ctx, w, h)
    if (!c) return

    for (const tool of tools) {
      renderDrawnTool(c, tool, false)
    }

    const previewType =
      activeTool === 'cursor' || activeTool === 'eraser' ? null : activeTool
    if (previewType && pending.length && hoverAnchor) {
      const previewTool = newDrawnTool(previewType, [pending[0], hoverAnchor], bias)
      renderDrawnTool(c, previewTool, true)
    }
    if (brushStroke.length >= 2 && previewType && getDrawToolDef(previewType)?.kind === 'brush') {
      renderDrawnTool(c, newDrawnTool(previewType, brushStroke, bias), true)
    }

    for (const p of pending) {
      const xy = c.toXY(p)
      if (!xy) continue
      ctx.fillStyle = dark ? '#f472b6' : '#db2777'
      ctx.beginPath()
      ctx.arc(xy.x, xy.y, 5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [
    tools,
    pending,
    hoverAnchor,
    brushStroke,
    activeTool,
    bias,
    dark,
    buildContext,
    wrapRef,
  ])

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
  }, [tools, pending, hoverAnchor, brushStroke, redrawOverlay, chartReady])

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

  const hitTestTool = useCallback(
    (clientX: number, clientY: number): string | null => {
      const wrap = wrapRef.current
      const canvas = canvasRef.current
      if (!wrap || !canvas) return null
      const rect = wrap.getBoundingClientRect()
      const px = clientX - rect.left
      const py = clientY - rect.top
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      const c = buildContext(ctx, canvas.width, canvas.height)
      if (!c) return null
      for (const tool of tools) {
        if (hitTestDrawnTool(c, tool, px, py)) return tool.id
      }
      return null
    },
    [tools, buildContext, wrapRef],
  )

  const finishTool = useCallback(
    (type: DrawnToolType, points: DrawnAnchor[], text?: string) => {
      const tool = newDrawnTool(type, points, bias, text)
      onToolsChange([...tools, tool])
      setPending([])
      setHoverAnchor(null)
      setBrushStroke([])
    },
    [bias, onToolsChange, tools],
  )

  const tryFinishPending = useCallback(
    (anchor: DrawnAnchor) => {
      if (activeTool === 'cursor' || activeTool === 'eraser') return
      const def = getDrawToolDef(activeTool)
      if (!def) return

      if (def.clickCount === -1) {
        setPending((prev) => [...prev, anchor])
        return
      }

      if (def.clickCount === 1) {
        const text =
          def.kind === 'annotation'
            ? prompt('Label (optional):', def.id === 'price_label' ? anchor.price.toFixed(2) : '') ??
              undefined
            : undefined
        finishTool(activeTool, [anchor], text)
        return
      }

      const next = [...pending, anchor]
      if (next.length < def.clickCount) {
        setPending(next)
        return
      }
      finishTool(activeTool, next.slice(0, def.clickCount))
    },
    [activeTool, pending, finishTool],
  )

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'cursor') return
    if (activeTool === 'eraser') {
      const id = hitTestTool(e.clientX, e.clientY)
      if (id) onToolsChange(tools.filter((t) => t.id !== id))
      return
    }
    const def = getDrawToolDef(activeTool)
    if (def?.kind === 'brush') return
    const anchor = pointerToAnchor(e.clientX, e.clientY)
    if (!anchor) return
    tryFinishPending(anchor)
  }

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const def = getDrawToolDef(activeTool)
    if (!def || def.kind !== 'brush') return
    const anchor = pointerToAnchor(e.clientX, e.clientY)
    if (!anchor) return
    brushing.current = true
    setBrushStroke([anchor])
  }

  const onCanvasMouseUp = () => {
    if (!brushing.current) return
    brushing.current = false
    if (brushStroke.length >= 2 && activeTool !== 'cursor' && activeTool !== 'eraser') {
      finishTool(activeTool, brushStroke)
    }
    setBrushStroke([])
  }

  const onCanvasMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (brushing.current && getDrawToolDef(activeTool)?.kind === 'brush') {
      const anchor = pointerToAnchor(e.clientX, e.clientY)
      if (anchor) {
        setBrushStroke((prev) => {
          if (!prev.length) return [anchor]
          const last = prev[prev.length - 1]
          if (Math.hypot(last.time - anchor.time, last.price - anchor.price) < 1e-6) return prev
          return [...prev, anchor]
        })
      }
      return
    }
    if (!chartToolActive) {
      setHoverAnchor(null)
      return
    }
    setHoverAnchor(pointerToAnchor(e.clientX, e.clientY))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPending([])
        setHoverAnchor(null)
        setBrushStroke([])
        setToolbarOpen(false)
        brushing.current = false
      }
      if (e.key === 'Enter' && pending.length >= 2 && activeTool !== 'cursor' && activeTool !== 'eraser') {
        const def = getDrawToolDef(activeTool)
        if (def?.clickCount === -1) {
          finishTool(activeTool, pending)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTool, pending, finishTool])

  const clearAllDrawings = useCallback(() => {
    onToolsChange([])
    setPending([])
    setHoverAnchor(null)
    setBrushStroke([])
    setActiveTool('cursor')
  }, [onToolsChange])

  const helpText = helpForDrawTool(activeTool, pending.length)
  const showFloatingHelp = activeTool !== 'cursor' || pending.length > 0

  if (!chartReady || !snapBars.length) return null

  return (
    <>
      <div
        className="pointer-events-auto absolute bottom-2 left-2 top-2 z-20 flex max-h-full items-start gap-1"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <PatternDrawToolbar
          open={toolbarOpen}
          onOpenChange={setToolbarOpen}
          activeTool={activeTool}
          onSelectTool={(tool) => {
            setActiveTool(tool)
            setPending([])
            setHoverAnchor(null)
            setBrushStroke([])
          }}
          snapEnabled={snapEnabled}
          onSnapChange={setSnapEnabled}
          pendingCount={pending.length}
          helpText={helpText}
          drawingCount={tools.length}
          onClearAll={clearAllDrawings}
        />
        {!toolbarOpen && showFloatingHelp && (
          <div className="max-w-[240px] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] text-[var(--color-ink-soft)] shadow-sm">
            {helpText}
            {pending.length > 0 && (
              <span className="mt-0.5 block font-mono text-[9px]">
                {pending.length} point{pending.length === 1 ? '' : 's'} placed · Esc cancel
              </span>
            )}
          </div>
        )}
      </div>

      {tools.length > 0 && activeTool === 'cursor' && !toolbarOpen && (
        <div className="absolute bottom-3 left-2 z-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] text-[var(--color-ink-soft)] shadow-sm">
          {tools.length} drawing{tools.length === 1 ? '' : 's'} · Open Draw → eraser or trash to remove
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{
          pointerEvents: pointerOnOverlay ? 'auto' : 'none',
          cursor:
            activeTool === 'eraser'
              ? 'pointer'
              : chartToolActive
                ? 'crosshair'
                : 'default',
        }}
        onClick={onCanvasClick}
        onMouseDown={onCanvasMouseDown}
        onMouseUp={onCanvasMouseUp}
        onMouseLeave={() => {
          setHoverAnchor(null)
          if (brushing.current) onCanvasMouseUp()
        }}
        onMouseMove={onCanvasMove}
      />
    </>
  )
}
