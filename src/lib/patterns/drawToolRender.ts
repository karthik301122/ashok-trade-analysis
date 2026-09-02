import type { DrawnAnchor, DrawnTool } from './drawnPattern'
import { FIB_LEVELS, PATTERN_POINT_LABELS, type DrawnToolType } from './drawToolCatalog'

export type ChartDrawContext = {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
  dark: boolean
  toXY: (anchor: DrawnAnchor) => { x: number; y: number } | null
  priceToY: (price: number) => number | null
  drawPriceLabel: (x: number, y: number, price: number, color: string) => void
}

const HIT = 10

export function toolStrokeColor(type: DrawnToolType, dark: boolean): string {
  if (type.startsWith('fib') || type === 'pitchfan') return dark ? '#fbbf24' : '#d97706'
  if (type.startsWith('gann')) return dark ? '#a78bfa' : '#7c3aed'
  if (type.includes('elliott') || type.endsWith('pattern') || type === 'xabcd' || type === 'abcd')
    return dark ? '#38bdf8' : '#0284c7'
  if (type === 'long_position') return dark ? '#34d399' : '#059669'
  if (type === 'short_position') return dark ? '#f87171' : '#dc2626'
  if (type === 'highlighter') return dark ? '#facc15' : '#ca8a04'
  if (type === 'brush') return dark ? '#f472b6' : '#db2777'
  if (type === 'zone' || type === 'rectangle' || type.includes('channel'))
    return dark ? '#fbbf24' : '#d97706'
  if (type === 'ray') return dark ? '#34d399' : '#059669'
  if (type === 'hline' || type === 'hray' || type === 'vline' || type === 'crossline')
    return dark ? '#38bdf8' : '#0284c7'
  return dark ? '#a78bfa' : '#7c3aed'
}

function line(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  dashed = false,
  width = 2,
) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.setLineDash(dashed ? [6, 4] : [])
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.stroke()
  ctx.setLineDash([])
}

function infiniteLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w: number,
  h: number,
  color: string,
  dashed = false,
  oneWay = false,
) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (!len) return
  const ux = dx / len
  const uy = dy / len
  const ext = Math.max(w, h) * 2
  const sx = oneWay ? x1 : x1 - ux * ext
  const sy = oneWay ? y1 : y1 - uy * ext
  line(ctx, sx, sy, x1 + ux * ext, y1 + uy * ext, color, dashed)
}

function drawFibLevels(c: ChartDrawContext, a: DrawnAnchor, b: DrawnAnchor, dashed = false) {
  const p1 = c.toXY(a)
  const p2 = c.toXY(b)
  if (!p1 || !p2) return
  const color = toolStrokeColor('fib_retracement', c.dark)
  const lo = Math.min(a.price, b.price)
  const hi = Math.max(a.price, b.price)
  const left = Math.min(p1.x, p2.x)
  const right = Math.max(p1.x, p2.x)
  for (const lv of FIB_LEVELS) {
    const price = hi - (hi - lo) * lv
    const y = c.priceToY(price)
    if (y == null) continue
    line(c.ctx, left, y, right, y, color, dashed, 1)
    c.ctx.font = '10px system-ui'
    c.ctx.fillStyle = color
    c.ctx.fillText(`${(lv * 100).toFixed(1)}%`, right + 4, y + 3)
  }
  line(c.ctx, p1.x, p1.y, p2.x, p2.y, color, dashed, 1.5)
}

function drawForecastBox(c: ChartDrawContext, tool: DrawnTool, long: boolean, dashed = false) {
  if (tool.points.length < 2) return
  const p1 = c.toXY(tool.points[0])
  const p2 = c.toXY(tool.points[1])
  if (!p1 || !p2) return
  const left = Math.min(p1.x, p2.x)
  const right = Math.max(p1.x, p2.x)
  const top = Math.min(p1.y, p2.y)
  const bottom = Math.max(p1.y, p2.y)
  const entryH = (bottom - top) * 0.25
  if (!dashed) {
    c.ctx.fillStyle = long ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'
    c.ctx.fillRect(left, long ? top : bottom - (bottom - top), right - left, bottom - top - entryH)
    c.ctx.fillStyle = long ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'
    c.ctx.fillRect(left, long ? bottom - entryH : top, right - left, entryH)
  }
  c.ctx.strokeStyle = toolStrokeColor(tool.type, c.dark)
  c.ctx.lineWidth = 1.5
  c.ctx.setLineDash(dashed ? [6, 4] : [])
  c.ctx.strokeRect(left, top, right - left, bottom - top)
  c.ctx.setLineDash([])
}

function drawPatternLabels(c: ChartDrawContext, tool: DrawnTool, dashed = false) {
  const labels = PATTERN_POINT_LABELS[tool.type]
  const color = toolStrokeColor(tool.type, c.dark)
  tool.points.forEach((pt, i) => {
    const xy = c.toXY(pt)
    if (!xy) return
    c.ctx.fillStyle = color
    c.ctx.beginPath()
    c.ctx.arc(xy.x, xy.y, 4, 0, Math.PI * 2)
    c.ctx.fill()
    if (labels?.[i]) {
      c.ctx.font = 'bold 11px system-ui'
      c.ctx.fillStyle = c.dark ? '#fff' : '#111'
      c.ctx.fillText(labels[i], xy.x + 6, xy.y - 6)
    }
  })
  for (let i = 1; i < tool.points.length; i++) {
    const a = c.toXY(tool.points[i - 1])
    const b = c.toXY(tool.points[i])
    if (a && b) line(c.ctx, a.x, a.y, b.x, b.y, color, dashed)
  }
}

function drawParallelChannel(c: ChartDrawContext, points: DrawnAnchor[], dashed = false) {
  if (points.length < 3) return
  const p0 = c.toXY(points[0])
  const p1 = c.toXY(points[1])
  const p2 = c.toXY(points[2])
  if (!p0 || !p1 || !p2) return
  const color = toolStrokeColor('parallel_channel', c.dark)
  infiniteLine(c.ctx, p0.x, p0.y, p1.x, p1.y, c.width, c.height, color, dashed)
  const dx = p1.x - p0.x
  const dy = p1.y - p0.y
  infiniteLine(c.ctx, p2.x, p2.y, p2.x + dx, p2.y + dy, c.width, c.height, color, dashed)
}

function drawPitchfork(c: ChartDrawContext, points: DrawnAnchor[], dashed = false) {
  if (points.length < 3) return
  const pivot = c.toXY(points[0])
  const a = c.toXY(points[1])
  const b = c.toXY(points[2])
  if (!pivot || !a || !b) return
  const color = toolStrokeColor('pitchfork', c.dark)
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2
  infiniteLine(c.ctx, pivot.x, pivot.y, midX, midY, c.width, c.height, color, dashed)
  infiniteLine(c.ctx, pivot.x, pivot.y, a.x, a.y, c.width, c.height, color, dashed)
  infiniteLine(c.ctx, pivot.x, pivot.y, b.x, b.y, c.width, c.height, color, dashed)
}

function drawBrush(c: ChartDrawContext, tool: DrawnTool, dashed = false) {
  if (tool.points.length < 2) return
  const color = toolStrokeColor(tool.type, c.dark)
  c.ctx.strokeStyle = color
  c.ctx.lineWidth = tool.type === 'highlighter' ? 14 : 2
  c.ctx.globalAlpha = tool.type === 'highlighter' ? 0.45 : 1
  c.ctx.lineCap = 'round'
  c.ctx.lineJoin = 'round'
  c.ctx.setLineDash(dashed ? [6, 4] : [])
  c.ctx.beginPath()
  const first = c.toXY(tool.points[0])
  if (!first) return
  c.ctx.moveTo(first.x, first.y)
  for (let i = 1; i < tool.points.length; i++) {
    const p = c.toXY(tool.points[i])
    if (p) c.ctx.lineTo(p.x, p.y)
  }
  c.ctx.stroke()
  c.ctx.setLineDash([])
  c.ctx.globalAlpha = 1
}

function drawAnnotation(c: ChartDrawContext, tool: DrawnTool, dashed = false) {
  const pt = tool.points[0]
  const xy = c.toXY(pt)
  if (!xy) return
  const color = toolStrokeColor(tool.type, c.dark)
  const text = tool.text?.trim() || (tool.type === 'note' ? 'Note' : 'Text')
  c.ctx.font = '12px system-ui'
  const pad = 6
  const tw = c.ctx.measureText(text).width
  const boxW = tw + pad * 2
  const boxH = 22
  const bx = xy.x + 8
  const by = xy.y - boxH / 2
  if (tool.type === 'arrow_up' || tool.type === 'arrow_down') {
    const dir = tool.type === 'arrow_up' ? -1 : 1
    line(c.ctx, xy.x, xy.y, xy.x, xy.y + dir * 24, color, dashed, 2)
    c.ctx.fillStyle = color
    c.ctx.beginPath()
    if (dir < 0) {
      c.ctx.moveTo(xy.x, xy.y - 28)
      c.ctx.lineTo(xy.x - 6, xy.y - 18)
      c.ctx.lineTo(xy.x + 6, xy.y - 18)
    } else {
      c.ctx.moveTo(xy.x, xy.y + 28)
      c.ctx.lineTo(xy.x - 6, xy.y + 18)
      c.ctx.lineTo(xy.x + 6, xy.y + 18)
    }
    c.ctx.closePath()
    c.ctx.fill()
    return
  }
  if (tool.type === 'pin' || tool.type === 'flag') {
    c.ctx.fillStyle = color
    c.ctx.beginPath()
    c.ctx.arc(xy.x, xy.y, 5, 0, Math.PI * 2)
    c.ctx.fill()
    return
  }
  c.ctx.fillStyle = color
  c.ctx.globalAlpha = dashed ? 0.5 : 0.92
  c.ctx.beginPath()
  c.ctx.roundRect(bx, by, boxW, boxH, 4)
  c.ctx.fill()
  c.ctx.globalAlpha = 1
  c.ctx.fillStyle = '#fff'
  c.ctx.fillText(text, bx + pad, by + 15)
  if (tool.type === 'callout' || tool.type === 'comment') {
    line(c.ctx, xy.x, xy.y, bx, by + boxH / 2, color, dashed)
  }
}

export function renderDrawnTool(c: ChartDrawContext, tool: DrawnTool, dashed = false) {
  const color = toolStrokeColor(tool.type, c.dark)
  const pts = tool.points

  switch (tool.type) {
    case 'hline':
    case 'anchored_vwap':
      const y = c.priceToY(pts[0].price)
      if (y != null) {
        line(c.ctx, 0, y, c.width, y, color, dashed)
        if (!dashed) c.drawPriceLabel(c.width - 80, y, pts[0].price, color)
      }
      break
    case 'hray':
      const yh = c.priceToY(pts[0].price)
      const xh = c.toXY(pts[0])
      if (yh != null && xh) line(c.ctx, xh.x, yh, c.width, yh, color, dashed)
      break
    case 'vline':
    case 'cyclic_lines':
      const xv = c.toXY(pts[0])
      if (xv) line(c.ctx, xv.x, 0, xv.x, c.height, color, dashed)
      break
    case 'crossline':
      const xc = c.toXY(pts[0])
      const yc = c.priceToY(pts[0].price)
      if (xc && yc != null) {
        line(c.ctx, 0, yc, c.width, yc, color, dashed)
        line(c.ctx, xc.x, 0, xc.x, c.height, color, dashed)
      }
      break
    case 'trendline':
    case 'extended_line':
    case 'info_line':
    case 'trend_angle':
    case 'regression_channel':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) {
          infiniteLine(c.ctx, p1.x, p1.y, p2.x, p2.y, c.width, c.height, color, dashed)
          if (tool.type === 'info_line' && !dashed) {
            c.drawPriceLabel(p2.x, p2.y, pts[1].price, color)
            c.drawPriceLabel(p1.x, p1.y, pts[0].price, color)
          }
        }
      }
      break
    case 'ray':
    case 'arrow':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) infiniteLine(c.ctx, p1.x, p1.y, p2.x, p2.y, c.width, c.height, color, dashed, true)
      }
      break
    case 'zone':
    case 'rectangle':
    case 'volume_profile':
    case 'anchored_volume_profile':
    case 'gann_box':
    case 'gann_square':
    case 'date_price_range':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (!p1 || !p2) break
        const left = Math.min(p1.x, p2.x)
        const top = Math.min(p1.y, p2.y)
        const w = Math.abs(p2.x - p1.x)
        const h = Math.abs(p2.y - p1.y)
        if (!dashed) {
          c.ctx.fillStyle = tool.type.includes('gann')
            ? c.dark ? 'rgba(167, 139, 250, 0.15)' : 'rgba(124, 58, 237, 0.12)'
            : c.dark ? 'rgba(251, 191, 36, 0.2)' : 'rgba(245, 158, 11, 0.15)'
          c.ctx.fillRect(left, top, w, h)
        }
        c.ctx.strokeStyle = color
        c.ctx.lineWidth = 1.5
        c.ctx.setLineDash(dashed ? [6, 4] : [])
        c.ctx.strokeRect(left, top, w, h)
        c.ctx.setLineDash([])
      }
      break
    case 'price_range':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) {
          const left = Math.min(p1.x, p2.x)
          const right = Math.max(p1.x, p2.x)
          line(c.ctx, left, p1.y, right, p1.y, color, dashed)
        }
      }
      break
    case 'date_range':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) {
          const top = Math.min(p1.y, p2.y)
          const bottom = Math.max(p1.y, p2.y)
          line(c.ctx, p1.x, top, p1.x, bottom, color, dashed)
        }
      }
      break
    case 'long_position':
      drawForecastBox(c, tool, true, dashed)
      break
    case 'short_position':
      drawForecastBox(c, tool, false, dashed)
      break
    case 'forecast':
    case 'bars_pattern':
    case 'ghost_feed':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) line(c.ctx, p1.x, p1.y, p2.x, p2.y, color, true)
      }
      break
    case 'fib_retracement':
    case 'fib_timezone':
      if (pts.length >= 2) drawFibLevels(c, pts[0], pts[1], dashed)
      break
    case 'fib_extension':
    case 'fib_channel':
    case 'fib_wedge':
    case 'pitchfan':
      if (pts.length >= 2) drawFibLevels(c, pts[0], pts[1], dashed)
      if (pts.length >= 3) drawParallelChannel(c, pts, dashed)
      break
    case 'fib_fan':
    case 'gann_fan':
      if (pts.length >= 2) {
        const origin = c.toXY(pts[0])
        const end = c.toXY(pts[1])
        if (origin && end) {
          for (const f of [0.382, 0.5, 0.618]) {
            const y = origin.y + (end.y - origin.y) * f
            infiniteLine(c.ctx, origin.x, origin.y, end.x, y, c.width, c.height, color, dashed, true)
          }
        }
      }
      break
    case 'fib_circles':
      if (pts.length >= 2) {
        const c1 = c.toXY(pts[0])
        const c2 = c.toXY(pts[1])
        if (c1 && c2) {
          const r = Math.hypot(c2.x - c1.x, c2.y - c1.y)
          c.ctx.strokeStyle = color
          c.ctx.setLineDash(dashed ? [6, 4] : [])
          c.ctx.beginPath()
          c.ctx.arc(c1.x, c1.y, r, 0, Math.PI * 2)
          c.ctx.stroke()
          c.ctx.setLineDash([])
        }
      }
      break
    case 'parallel_channel':
    case 'flat_channel':
      drawParallelChannel(c, pts, dashed)
      break
    case 'disjoint_channel':
      if (pts.length >= 4) {
        drawParallelChannel(c, [pts[0], pts[1], pts[2]], dashed)
        drawParallelChannel(c, [pts[2], pts[3], pts[0]], dashed)
      }
      break
    case 'pitchfork':
    case 'schiff_pitchfork':
    case 'modified_schiff_pitchfork':
    case 'inside_pitchfork':
      drawPitchfork(c, pts, dashed)
      break
    case 'circle':
      if (pts.length >= 2) {
        const c1 = c.toXY(pts[0])
        const c2 = c.toXY(pts[1])
        if (c1 && c2) {
          const r = Math.hypot(c2.x - c1.x, c2.y - c1.y)
          c.ctx.strokeStyle = color
          c.ctx.beginPath()
          c.ctx.arc(c1.x, c1.y, r, 0, Math.PI * 2)
          c.ctx.stroke()
        }
      }
      break
    case 'ellipse':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) {
          const rx = Math.abs(p2.x - p1.x) / 2
          const ry = Math.abs(p2.y - p1.y) / 2
          c.ctx.strokeStyle = color
          c.ctx.beginPath()
          c.ctx.ellipse((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, rx, ry, 0, 0, Math.PI * 2)
          c.ctx.stroke()
        }
      }
      break
    case 'triangle':
      if (pts.length >= 3) {
        const ps = pts.map((p) => c.toXY(p)).filter(Boolean) as { x: number; y: number }[]
        if (ps.length >= 3) {
          c.ctx.strokeStyle = color
          c.ctx.beginPath()
          c.ctx.moveTo(ps[0].x, ps[0].y)
          ps.slice(1).forEach((p) => c.ctx.lineTo(p.x, p.y))
          c.ctx.closePath()
          c.ctx.stroke()
        }
      }
      break
    case 'arc':
    case 'curve':
    case 'double_curve':
    case 'sine_line':
    case 'time_cycles':
      if (pts.length >= 2) {
        const p1 = c.toXY(pts[0])
        const p2 = c.toXY(pts[1])
        if (p1 && p2) {
          c.ctx.strokeStyle = color
          c.ctx.beginPath()
          c.ctx.moveTo(p1.x, p1.y)
          c.ctx.quadraticCurveTo((p1.x + p2.x) / 2, p2.y, p2.x, p1.y)
          c.ctx.stroke()
        }
      }
      break
    case 'brush':
    case 'highlighter':
    case 'path':
    case 'polyline':
      drawBrush(c, tool, dashed)
      break
    case 'rotated_rectangle':
      if (pts.length >= 3) {
        const p0 = c.toXY(pts[0])
        const p1 = c.toXY(pts[1])
        const p2 = c.toXY(pts[2])
        if (p0 && p1 && p2) {
          c.ctx.strokeStyle = color
          c.ctx.beginPath()
          c.ctx.moveTo(p0.x, p0.y)
          c.ctx.lineTo(p1.x, p1.y)
          c.ctx.lineTo(p2.x, p2.y)
          c.ctx.closePath()
          c.ctx.stroke()
        }
      }
      break
    case 'xabcd':
    case 'cypher':
    case 'head_shoulders':
    case 'abcd':
    case 'triangle_pattern':
    case 'three_drives':
    case 'elliott_impulse':
    case 'elliott_correction':
    case 'elliott_triangle':
    case 'elliott_combo':
    case 'elliott_triple_combo':
      drawPatternLabels(c, tool, dashed)
      break
    default:
      break
  }

  if (
    tool.type === 'text' ||
    tool.type === 'note' ||
    tool.type === 'price_note' ||
    tool.type === 'pin' ||
    tool.type === 'callout' ||
    tool.type === 'comment' ||
    tool.type === 'flag' ||
    tool.type === 'arrow_up' ||
    tool.type === 'arrow_down' ||
    tool.type === 'arrow_marker' ||
    tool.type === 'price_label'
  ) {
    drawAnnotation(c, tool, dashed)
  }
}

export function hitTestDrawnTool(c: ChartDrawContext, tool: DrawnTool, px: number, py: number): boolean {
  if (tool.type === 'hline' || tool.type === 'anchored_vwap') {
    const y = c.priceToY(tool.points[0].price)
    return y != null && Math.abs(py - y) < HIT
  }
  if (tool.type === 'vline' || tool.type === 'cyclic_lines') {
    const x = c.toXY(tool.points[0])?.x
    return x != null && Math.abs(px - x) < HIT
  }
  if (tool.points.length >= 2) {
    const p1 = c.toXY(tool.points[0])
    const p2 = c.toXY(tool.points[1])
    if (!p1 || !p2) return false
    if (
      tool.type === 'zone' ||
      tool.type === 'rectangle' ||
      tool.type === 'long_position' ||
      tool.type === 'short_position'
    ) {
      const left = Math.min(p1.x, p2.x) - HIT
      const right = Math.max(p1.x, p2.x) + HIT
      const top = Math.min(p1.y, p2.y) - HIT
      const bottom = Math.max(p1.y, p2.y) + HIT
      return px >= left && px <= right && py >= top && py <= bottom
    }
    const dx = p2.x - p1.x
    const dy = p2.y - p1.y
    const len = Math.hypot(dx, dy)
    if (!len) return Math.hypot(px - p1.x, py - p1.y) < HIT
    const d = Math.abs((dy * px - dx * py + p2.x * p1.y - p2.y * p1.x) / len)
    return d < HIT
  }
  const pt = c.toXY(tool.points[0])
  return pt ? Math.hypot(px - pt.x, py - pt.y) < HIT + 8 : false
}
