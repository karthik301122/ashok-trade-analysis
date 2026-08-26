import type { OhlcBar } from './types'
import type { PatternBias, PatternHit } from './types'
import { completedWeeklyBars } from './weeklyBars'

export type CandleTimeframe = 'daily' | 'weekly'
export type CandleDirection = 'either' | 'bullish' | 'bearish'
export type CandleContext = 'any' | 'after_decline' | 'after_rally'
export type BodyPosition = 'any' | 'near_top' | 'near_bottom'

/** Geometry rules for one candle (ratios are ignore-if-zero / ignore-if-1 where noted). */
export type CandleGeometry = {
  /** Lower wick must be ≥ this × body (0 = off) */
  minLowerWickBodyMult: number
  /** Upper wick must be ≥ this × body (0 = off) */
  minUpperWickBodyMult: number
  /** Upper wick ≤ this fraction of range (1 = off) */
  maxUpperWickRangeFrac: number
  /** Lower wick ≤ this fraction of range (1 = off) */
  maxLowerWickRangeFrac: number
  /** Body ≤ this fraction of range (1 = off) — small body */
  maxBodyRangeFrac: number
  /** Body ≥ this fraction of range (0 = off) */
  minBodyRangeFrac: number
  bodyPosition: BodyPosition
  /** How close to extreme: 0.35 = within top/bottom 35% of range */
  bodyPositionFrac: number
  direction: CandleDirection
  context: CandleContext
  /** Min (H−L)/close as % (e.g. 0.4 = 0.4%) to skip flat noise */
  minRangePct: number
}

export type CandleShapeSpec = {
  timeframe: CandleTimeframe
  /** 1 = single candle; 2 = two consecutive completed candles both matching geometry */
  candleCount: 1 | 2
  geometry: CandleGeometry
  presetId: string
}

export type CandlePreset = {
  id: string
  label: string
  bias: PatternBias
  description: string
  geometry: CandleGeometry
}

const LOOKBACK = 16

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function num(v: unknown, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function defaultCandleGeometry(): CandleGeometry {
  return {
    minLowerWickBodyMult: 2,
    minUpperWickBodyMult: 0,
    maxUpperWickRangeFrac: 0.12,
    maxLowerWickRangeFrac: 1,
    maxBodyRangeFrac: 0.45,
    minBodyRangeFrac: 0,
    bodyPosition: 'near_top',
    bodyPositionFrac: 0.35,
    direction: 'either',
    context: 'after_decline',
    minRangePct: 0.4,
  }
}

export const CANDLE_SHAPE_PRESETS: CandlePreset[] = [
  {
    id: 'hammer',
    label: 'Hammer',
    bias: 'bullish',
    description: 'Long lower wick, small upper wick, body near top — often after a decline',
    geometry: {
      ...defaultCandleGeometry(),
      minLowerWickBodyMult: 2,
      maxUpperWickRangeFrac: 0.12,
      maxBodyRangeFrac: 0.4,
      bodyPosition: 'near_top',
      context: 'after_decline',
      direction: 'either',
    },
  },
  {
    id: 'inverted-hammer',
    label: 'Inverted hammer',
    bias: 'bullish',
    description: 'Long upper wick, small lower wick, body near bottom — after a decline',
    geometry: {
      ...defaultCandleGeometry(),
      minLowerWickBodyMult: 0,
      minUpperWickBodyMult: 2,
      maxLowerWickRangeFrac: 0.12,
      maxUpperWickRangeFrac: 1,
      maxBodyRangeFrac: 0.4,
      bodyPosition: 'near_bottom',
      context: 'after_decline',
      direction: 'either',
    },
  },
  {
    id: 'shooting-star',
    label: 'Shooting star',
    bias: 'bearish',
    description: 'Long upper wick, small lower wick, body near bottom — after a rally',
    geometry: {
      ...defaultCandleGeometry(),
      minLowerWickBodyMult: 0,
      minUpperWickBodyMult: 2,
      maxLowerWickRangeFrac: 0.12,
      maxUpperWickRangeFrac: 1,
      maxBodyRangeFrac: 0.4,
      bodyPosition: 'near_bottom',
      context: 'after_rally',
      direction: 'either',
    },
  },
  {
    id: 'doji',
    label: 'Doji',
    bias: 'neutral',
    description: 'Very small body relative to the range',
    geometry: {
      ...defaultCandleGeometry(),
      minLowerWickBodyMult: 0,
      minUpperWickBodyMult: 0,
      maxUpperWickRangeFrac: 1,
      maxLowerWickRangeFrac: 1,
      maxBodyRangeFrac: 0.12,
      minBodyRangeFrac: 0,
      bodyPosition: 'any',
      context: 'any',
      direction: 'either',
      minRangePct: 0.3,
    },
  },
  {
    id: 'marubozu-bull',
    label: 'Bullish marubozu',
    bias: 'bullish',
    description: 'Large body, tiny wicks, bullish close',
    geometry: {
      ...defaultCandleGeometry(),
      minLowerWickBodyMult: 0,
      minUpperWickBodyMult: 0,
      maxUpperWickRangeFrac: 0.08,
      maxLowerWickRangeFrac: 0.08,
      maxBodyRangeFrac: 1,
      minBodyRangeFrac: 0.75,
      bodyPosition: 'any',
      context: 'any',
      direction: 'bullish',
      minRangePct: 0.5,
    },
  },
  {
    id: 'marubozu-bear',
    label: 'Bearish marubozu',
    bias: 'bearish',
    description: 'Large body, tiny wicks, bearish close',
    geometry: {
      ...defaultCandleGeometry(),
      minLowerWickBodyMult: 0,
      minUpperWickBodyMult: 0,
      maxUpperWickRangeFrac: 0.08,
      maxLowerWickRangeFrac: 0.08,
      maxBodyRangeFrac: 1,
      minBodyRangeFrac: 0.75,
      bodyPosition: 'any',
      context: 'any',
      direction: 'bearish',
      minRangePct: 0.5,
    },
  },
  {
    id: 'custom',
    label: 'Custom ratios',
    bias: 'neutral',
    description: 'Start from hammer-like defaults and edit every ratio',
    geometry: defaultCandleGeometry(),
  },
]

export function candlePresetById(id: string): CandlePreset | undefined {
  return CANDLE_SHAPE_PRESETS.find((p) => p.id === id)
}

export function normalizeCandleGeometry(raw: unknown): CandleGeometry {
  const d = defaultCandleGeometry()
  if (raw == null || typeof raw !== 'object') return d
  const o = raw as Partial<CandleGeometry>
  const bodyPosition: BodyPosition =
    o.bodyPosition === 'near_top' || o.bodyPosition === 'near_bottom' || o.bodyPosition === 'any'
      ? o.bodyPosition
      : d.bodyPosition
  const direction: CandleDirection =
    o.direction === 'bullish' || o.direction === 'bearish' || o.direction === 'either'
      ? o.direction
      : d.direction
  const context: CandleContext =
    o.context === 'after_decline' || o.context === 'after_rally' || o.context === 'any'
      ? o.context
      : d.context
  return {
    minLowerWickBodyMult: clamp(num(o.minLowerWickBodyMult, d.minLowerWickBodyMult), 0, 10),
    minUpperWickBodyMult: clamp(num(o.minUpperWickBodyMult, d.minUpperWickBodyMult), 0, 10),
    maxUpperWickRangeFrac: clamp(num(o.maxUpperWickRangeFrac, d.maxUpperWickRangeFrac), 0, 1),
    maxLowerWickRangeFrac: clamp(num(o.maxLowerWickRangeFrac, d.maxLowerWickRangeFrac), 0, 1),
    maxBodyRangeFrac: clamp(num(o.maxBodyRangeFrac, d.maxBodyRangeFrac), 0.01, 1),
    minBodyRangeFrac: clamp(num(o.minBodyRangeFrac, d.minBodyRangeFrac), 0, 1),
    bodyPosition,
    bodyPositionFrac: clamp(num(o.bodyPositionFrac, d.bodyPositionFrac), 0.05, 0.5),
    direction,
    context,
    minRangePct: clamp(num(o.minRangePct, d.minRangePct), 0, 5),
  }
}

export function normalizeCandleShape(raw: unknown): CandleShapeSpec | null {
  if (raw == null || typeof raw !== 'object') return null
  const o = raw as Partial<CandleShapeSpec>
  const timeframe: CandleTimeframe = o.timeframe === 'weekly' ? 'weekly' : 'daily'
  const candleCount: 1 | 2 = o.candleCount === 2 ? 2 : 1
  const presetId = typeof o.presetId === 'string' && o.presetId ? o.presetId : 'custom'
  return {
    timeframe,
    candleCount,
    presetId,
    geometry: normalizeCandleGeometry(o.geometry),
  }
}

export function defaultCandleShape(presetId = 'hammer'): CandleShapeSpec {
  const preset = candlePresetById(presetId) ?? CANDLE_SHAPE_PRESETS[0]
  return {
    timeframe: 'daily',
    candleCount: 1,
    presetId: preset.id,
    geometry: { ...preset.geometry },
  }
}

function bodySize(b: OhlcBar): number {
  return Math.abs(b.c - b.o)
}

function lowerWick(b: OhlcBar): number {
  return Math.min(b.o, b.c) - b.l
}

function upperWick(b: OhlcBar): number {
  return b.h - Math.max(b.o, b.c)
}

function range(b: OhlcBar): number {
  return Math.max(b.h - b.l, 1e-12)
}

export function geometryPasses(bars: OhlcBar[], i: number, g: CandleGeometry): boolean {
  if (i < 0 || i >= bars.length) return false
  const b = bars[i]
  const rng = range(b)
  const body = Math.max(bodySize(b), rng * 0.02) // floor so wick×body isn't auto-true on dojis
  const lw = lowerWick(b)
  const uw = upperWick(b)
  const close = Math.max(Math.abs(b.c), 1e-9)
  const rangePct = (rng / close) * 100
  if (rangePct < g.minRangePct) return false

  if (g.minLowerWickBodyMult > 0 && lw < g.minLowerWickBodyMult * body) return false
  if (g.minUpperWickBodyMult > 0 && uw < g.minUpperWickBodyMult * body) return false
  if (g.maxUpperWickRangeFrac < 1 && uw > g.maxUpperWickRangeFrac * rng) return false
  if (g.maxLowerWickRangeFrac < 1 && lw > g.maxLowerWickRangeFrac * rng) return false
  if (g.maxBodyRangeFrac < 1 && bodySize(b) > g.maxBodyRangeFrac * rng) return false
  if (g.minBodyRangeFrac > 0 && bodySize(b) < g.minBodyRangeFrac * rng) return false

  const top = Math.max(b.o, b.c)
  const bot = Math.min(b.o, b.c)
  if (g.bodyPosition === 'near_top') {
    if (top < b.h - g.bodyPositionFrac * rng) return false
  } else if (g.bodyPosition === 'near_bottom') {
    if (bot > b.l + g.bodyPositionFrac * rng) return false
  }

  if (g.direction === 'bullish' && b.c < b.o) return false
  if (g.direction === 'bearish' && b.c > b.o) return false

  const prior = bars[i + 1]
  if (g.context === 'after_decline') {
    if (!prior || !(prior.c > b.c)) return false
  } else if (g.context === 'after_rally') {
    if (!prior || !(prior.c < b.c)) return false
  }

  return true
}

export function shapePassesAt(bars: OhlcBar[], i: number, spec: CandleShapeSpec): boolean {
  if (!geometryPasses(bars, i, spec.geometry)) return false
  if (spec.candleCount === 2) {
    return geometryPasses(bars, i + 1, spec.geometry)
  }
  return true
}

function seriesForSpec(daily: OhlcBar[], spec: CandleShapeSpec): OhlcBar[] {
  if (spec.timeframe === 'weekly') {
    return completedWeeklyBars(daily)
  }
  // Newest first so index 0 = latest completed session; prior = i+1
  return [...daily].sort((a, b) => b.t - a.t)
}

/**
 * Newest hit in lookback. Series is newest-first.
 */
export function detectCandleShape(
  daily: OhlcBar[],
  pattern: {
    id: string
    name: string
    bias: PatternBias
    description?: string
    candleShape: CandleShapeSpec
  },
): PatternHit | null {
  const spec = normalizeCandleShape(pattern.candleShape)
  if (!spec) return null
  const series = seriesForSpec(daily, spec)
  const need = spec.candleCount === 2 ? 3 : 2
  if (series.length < need) return null

  const to = Math.min(LOOKBACK, series.length - (spec.candleCount === 2 ? 2 : 1))
  let bestI = -1
  for (let i = 0; i < to; i++) {
    if (shapePassesAt(series, i, spec)) {
      bestI = i
      break
    }
  }
  if (bestI < 0) return null
  const bar = series[bestI]
  const older = spec.candleCount === 2 ? series[bestI + 1] : bar
  return {
    id: `candle-shape-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: older.t,
    endT: bar.t,
    confidence: 0.75,
    points: [
      { time: older.t, price: older.c },
      { time: bar.t, price: bar.c },
    ],
    note: pattern.description?.trim() || describeCandleShape(spec),
  }
}

export function detectAllCandleShapes(
  daily: OhlcBar[],
  customs: {
    id: string
    name: string
    bias: PatternBias
    description?: string
    candleShape?: CandleShapeSpec | null
  }[],
): PatternHit[] {
  const hits: PatternHit[] = []
  for (const c of customs) {
    if (!c.candleShape) continue
    const hit = detectCandleShape(daily, {
      id: c.id,
      name: c.name,
      bias: c.bias,
      description: c.description,
      candleShape: c.candleShape,
    })
    if (hit) hits.push(hit)
  }
  return hits
}

export function describeCandleShape(spec: CandleShapeSpec | null | undefined): string {
  if (!spec) return ''
  const preset = candlePresetById(spec.presetId)
  const g = spec.geometry
  const parts: string[] = [
    spec.timeframe === 'weekly' ? 'Weekly' : 'Daily',
    spec.candleCount === 2 ? '×2' : '×1',
  ]
  if (preset && preset.id !== 'custom') parts.push(preset.label)
  if (g.minLowerWickBodyMult > 0) parts.push(`LW≥${g.minLowerWickBodyMult}×body`)
  if (g.minUpperWickBodyMult > 0) parts.push(`UW≥${g.minUpperWickBodyMult}×body`)
  if (g.maxUpperWickRangeFrac < 1) parts.push(`UW≤${Math.round(g.maxUpperWickRangeFrac * 100)}%rng`)
  if (g.maxLowerWickRangeFrac < 1) parts.push(`LW≤${Math.round(g.maxLowerWickRangeFrac * 100)}%rng`)
  if (g.bodyPosition !== 'any') parts.push(g.bodyPosition.replace('_', ' '))
  if (g.context !== 'any') parts.push(g.context.replace('_', ' '))
  return parts.join(' · ')
}
