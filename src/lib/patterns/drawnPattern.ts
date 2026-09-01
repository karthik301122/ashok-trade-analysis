import type { OhlcBar } from './types'
import type { PatternBias, PatternHit } from './types'
import { completedWeeklyBars } from './weeklyBars'

export type DrawnAnchor = { time: number; price: number }

export type DrawnToolType = 'hline' | 'trendline' | 'zone'

export type DrawnTrigger =
  | 'near'
  | 'break_above'
  | 'break_below'
  | 'inside_zone'
  | 'touch_support'
  | 'touch_resistance'

export type DrawnTool = {
  id: string
  type: DrawnToolType
  points: DrawnAnchor[]
  trigger: DrawnTrigger
  /** % tolerance for near/break (default 0.5) */
  tolerancePct: number
}

export type DrawnPatternSpec = {
  timeframe: 'daily' | 'weekly'
  tools: DrawnTool[]
}

const LOOKBACK = 12
const DEFAULT_TOLERANCE = 0.5

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function clampTol(n: number): number {
  return Math.max(0.05, Math.min(5, n))
}

export function defaultTriggerForTool(type: DrawnToolType, bias: PatternBias): DrawnTrigger {
  if (type === 'zone') return 'inside_zone'
  if (type === 'hline') {
    if (bias === 'bullish') return 'break_above'
    if (bias === 'bearish') return 'break_below'
    return 'near'
  }
  if (bias === 'bullish') return 'break_above'
  if (bias === 'bearish') return 'break_below'
  return 'near'
}

export function newDrawnTool(
  type: DrawnToolType,
  points: DrawnAnchor[],
  bias: PatternBias = 'neutral',
): DrawnTool {
  return {
    id: `dt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    points,
    trigger: defaultTriggerForTool(type, bias),
    tolerancePct: DEFAULT_TOLERANCE,
  }
}

export function normalizeDrawnTool(raw: unknown): DrawnTool | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Partial<DrawnTool>
  const type: DrawnToolType | null =
    o.type === 'hline' || o.type === 'trendline' || o.type === 'zone' ? o.type : null
  if (!type) return null
  if (!Array.isArray(o.points) || o.points.length < 1) return null

  const points: DrawnAnchor[] = []
  const need = type === 'hline' ? 1 : 2
  for (const p of o.points.slice(0, need)) {
    if (!p || typeof p !== 'object') continue
    const time = num((p as DrawnAnchor).time, NaN)
    const price = num((p as DrawnAnchor).price, NaN)
    if (!Number.isFinite(time) || !Number.isFinite(price)) continue
    points.push({ time, price })
  }
  if (points.length < need) return null

  const triggers: DrawnTrigger[] = [
    'near',
    'break_above',
    'break_below',
    'inside_zone',
    'touch_support',
    'touch_resistance',
  ]
  const trigger = triggers.includes(o.trigger as DrawnTrigger)
    ? (o.trigger as DrawnTrigger)
    : defaultTriggerForTool(type, 'neutral')

  return {
    id: typeof o.id === 'string' ? o.id : newDrawnTool(type, points).id,
    type,
    points,
    trigger,
    tolerancePct: clampTol(num(o.tolerancePct, DEFAULT_TOLERANCE)),
  }
}

export function normalizeDrawnSpec(raw: unknown): DrawnPatternSpec | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Partial<DrawnPatternSpec>
  if (!Array.isArray(o.tools) || !o.tools.length) return null
  const tools = o.tools.map(normalizeDrawnTool).filter((t): t is DrawnTool => t != null)
  if (!tools.length) return null
  const timeframe = o.timeframe === 'weekly' ? 'weekly' : 'daily'
  return { timeframe, tools }
}

export function describeDrawnTool(tool: DrawnTool): string {
  const tol = tool.tolerancePct
  const triggerLabels: Record<DrawnTrigger, string> = {
    near: `near level (±${tol}%)`,
    break_above: `break above (±${tol}%)`,
    break_below: `break below (±${tol}%)`,
    inside_zone: 'inside zone',
    touch_support: `touch support (±${tol}%)`,
    touch_resistance: `touch resistance (±${tol}%)`,
  }
  const typeLabels: Record<DrawnToolType, string> = {
    hline: 'Horizontal',
    trendline: 'Trendline',
    zone: 'Zone',
  }
  return `${typeLabels[tool.type]} · ${triggerLabels[tool.trigger]}`
}

export function describeDrawnSpec(spec: DrawnPatternSpec | null | undefined): string {
  if (!spec?.tools?.length) return ''
  const tf = spec.timeframe === 'weekly' ? 'weekly' : 'daily'
  return `${tf} · ${spec.tools.map(describeDrawnTool).join('; ')}`
}

function barsForSpec(bars: OhlcBar[], spec: DrawnPatternSpec): OhlcBar[] {
  if (spec.timeframe === 'weekly') return completedWeeklyBars(bars)
  return bars
}

function trendlinePriceAt(tool: DrawnTool, t: number): number {
  const [a, b] = tool.points
  if (tool.points.length < 2) return a.price
  if (a.time === b.time) return a.price
  const slope = (b.price - a.price) / (b.time - a.time)
  return a.price + slope * (t - a.time)
}

function zoneBounds(tool: DrawnTool): { top: number; bottom: number } {
  const [a, b] = tool.points
  return {
    top: Math.max(a.price, b.price),
    bottom: Math.min(a.price, b.price),
  }
}

function levelPrice(tool: DrawnTool, t: number): number {
  if (tool.type === 'hline') return tool.points[0].price
  if (tool.type === 'trendline') return trendlinePriceAt(tool, t)
  const { top, bottom } = zoneBounds(tool)
  return (top + bottom) / 2
}

function toolTriggeredAt(bars: OhlcBar[], i: number, tool: DrawnTool): boolean {
  if (i < 0 || i >= bars.length) return false
  const bar = bars[i]
  const prev = i > 0 ? bars[i - 1] : bar
  const tol = tool.tolerancePct / 100
  const close = bar.c
  const prevClose = prev.c
  const low = bar.l
  const high = bar.h

  if (tool.type === 'zone') {
    const { top, bottom } = zoneBounds(tool)
    const padTop = top * tol
    const padBottom = bottom * tol
    switch (tool.trigger) {
      case 'inside_zone':
        return close >= bottom - padBottom && close <= top + padTop
      case 'touch_support':
        return low <= bottom + padBottom && close >= bottom - padBottom
      case 'touch_resistance':
        return high >= top - padTop && close <= top + padTop
      case 'break_above':
        return close > top + padTop && prevClose <= top + padTop
      case 'break_below':
        return close < bottom - padBottom && prevClose >= bottom - padBottom
      default:
        return close >= bottom && close <= top
    }
  }

  const level = levelPrice(tool, bar.t)
  const prevLevel = levelPrice(tool, prev.t)
  const above = level * (1 + tol)
  const below = level * (1 - tol)
  const prevAbove = prevLevel * (1 + tol)
  const prevBelow = prevLevel * (1 - tol)

  switch (tool.trigger) {
    case 'near':
      return Math.abs(close - level) / level <= tol
    case 'break_above':
      return close > above && prevClose <= prevAbove
    case 'break_below':
      return close < below && prevClose >= prevBelow
    case 'touch_support':
      return low <= below && close >= below * (1 - tol)
    case 'touch_resistance':
      return high >= above && close <= above * (1 + tol)
    case 'inside_zone':
      return close >= below && close <= above
    default:
      return false
  }
}

function allToolsTriggeredAt(bars: OhlcBar[], i: number, tools: DrawnTool[]): boolean {
  return tools.every((tool) => toolTriggeredAt(bars, i, tool))
}

function hitPointsFromTools(tools: DrawnTool[]): DrawnAnchor[] {
  const pts: DrawnAnchor[] = []
  for (const tool of tools) {
    for (const p of tool.points) pts.push({ ...p })
  }
  return pts.sort((a, b) => a.time - b.time)
}

export function detectDrawnPattern(
  bars: OhlcBar[],
  pattern: {
    id: string
    name: string
    bias: PatternBias
    description?: string
    drawnSpec: DrawnPatternSpec
  },
): PatternHit | null {
  const series = barsForSpec(bars, pattern.drawnSpec)
  if (series.length < 3 || !pattern.drawnSpec.tools.length) return null

  const from = Math.max(1, series.length - LOOKBACK)
  let bestI = -1
  for (let i = from; i < series.length; i++) {
    if (allToolsTriggeredAt(series, i, pattern.drawnSpec.tools)) bestI = i
  }
  if (bestI < 0) return null

  const bar = series[bestI]
  const points = hitPointsFromTools(pattern.drawnSpec.tools)
  const startT = points.length ? points[0].time : bar.t
  const endT = bar.t
  const note =
    pattern.description?.trim() || describeDrawnSpec(pattern.drawnSpec) || 'Drawn pattern'

  return {
    id: `custom-drawn-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: Math.min(startT, endT),
    endT,
    confidence: 0.78,
    points: points.length ? points : [{ time: bar.t, price: bar.c }],
    note,
  }
}

export function detectAllDrawnPatterns(
  bars: OhlcBar[],
  customs: {
    id: string
    name: string
    bias: PatternBias
    description?: string
    drawnSpec?: DrawnPatternSpec | null
  }[],
): PatternHit[] {
  const hits: PatternHit[] = []
  for (const c of customs) {
    if (!c.drawnSpec?.tools?.length) continue
    const hit = detectDrawnPattern(bars, {
      id: c.id,
      name: c.name,
      bias: c.bias,
      description: c.description,
      drawnSpec: c.drawnSpec,
    })
    if (hit) hits.push(hit)
  }
  return hits
}

/** Snap click to nearest bar; price to closest of high/low/close. */
export function snapAnchorToBar(bars: OhlcBar[], time: number, price: number): DrawnAnchor {
  if (!bars.length) return { time, price }
  let best = bars[0]
  let bestDist = Math.abs(bars[0].t - time)
  for (const b of bars) {
    const d = Math.abs(b.t - time)
    if (d < bestDist) {
      best = b
      bestDist = d
    }
  }
  const candidates = [best.h, best.l, best.c]
  let snapped = best.c
  let snapDist = Math.abs(best.c - price)
  for (const p of candidates) {
    const d = Math.abs(p - price)
    if (d < snapDist) {
      snapped = p
      snapDist = d
    }
  }
  return { time: best.t, price: snapped }
}
