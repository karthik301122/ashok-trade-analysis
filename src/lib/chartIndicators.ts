import type { UTCTimestamp } from 'lightweight-charts'
import type { OhlcBar } from './patterns/types'

/** User-facing toggle */
export type DeskIndicatorId =
  | 'sma20'
  | 'sma50'
  | 'sma200'
  | 'ema9'
  | 'ema21'
  | 'wma20'
  | 'bbands'
  | 'vwap'
  | 'rsi'
  | 'macd'
  | 'stochastic'
  | 'cci'
  | 'atr'
  | 'adx'
  | 'obv'
  | 'volume'

/** Chart series key (one toggle may map to several) */
export type DeskSeriesKey =
  | 'sma20'
  | 'sma50'
  | 'sma200'
  | 'ema9'
  | 'ema21'
  | 'wma20'
  | 'bb_upper'
  | 'bb_mid'
  | 'bb_lower'
  | 'vwap'
  | 'rsi'
  | 'macd_line'
  | 'macd_signal'
  | 'macd_hist'
  | 'stoch_k'
  | 'stoch_d'
  | 'cci'
  | 'atr'
  | 'adx'
  | 'obv'
  | 'volume'

export type IndicatorPoint = { time: number; value: number }

export type DeskSeriesDef = {
  key: DeskSeriesKey
  color: string
  scaleId: string
  kind: 'line' | 'histogram'
  lineWidth?: number
}

export type DeskIndicatorDef = {
  id: DeskIndicatorId
  label: string
  color: string
  defaultOn: boolean
  series: DeskSeriesDef[]
}

export const DESK_INDICATORS: DeskIndicatorDef[] = [
  {
    id: 'sma20',
    label: 'SMA 20',
    color: '#f59e0b',
    defaultOn: true,
    series: [{ key: 'sma20', color: '#f59e0b', scaleId: 'right', kind: 'line' }],
  },
  {
    id: 'sma50',
    label: 'SMA 50',
    color: '#3b82f6',
    defaultOn: true,
    series: [{ key: 'sma50', color: '#3b82f6', scaleId: 'right', kind: 'line' }],
  },
  {
    id: 'sma200',
    label: 'SMA 200',
    color: '#a855f7',
    defaultOn: false,
    series: [{ key: 'sma200', color: '#a855f7', scaleId: 'right', kind: 'line', lineWidth: 1 }],
  },
  {
    id: 'ema9',
    label: 'EMA 9',
    color: '#14b8a6',
    defaultOn: false,
    series: [{ key: 'ema9', color: '#14b8a6', scaleId: 'right', kind: 'line' }],
  },
  {
    id: 'ema21',
    label: 'EMA 21',
    color: '#ec4899',
    defaultOn: false,
    series: [{ key: 'ema21', color: '#ec4899', scaleId: 'right', kind: 'line' }],
  },
  {
    id: 'wma20',
    label: 'WMA 20',
    color: '#0ea5e9',
    defaultOn: false,
    series: [{ key: 'wma20', color: '#0ea5e9', scaleId: 'right', kind: 'line' }],
  },
  {
    id: 'bbands',
    label: 'Bollinger',
    color: '#94a3b8',
    defaultOn: false,
    series: [
      { key: 'bb_upper', color: '#94a3b8', scaleId: 'right', kind: 'line', lineWidth: 1 },
      { key: 'bb_mid', color: '#cbd5e1', scaleId: 'right', kind: 'line', lineWidth: 1 },
      { key: 'bb_lower', color: '#94a3b8', scaleId: 'right', kind: 'line', lineWidth: 1 },
    ],
  },
  {
    id: 'vwap',
    label: 'VWAP',
    color: '#f97316',
    defaultOn: false,
    series: [{ key: 'vwap', color: '#f97316', scaleId: 'right', kind: 'line', lineWidth: 2 }],
  },
  {
    id: 'rsi',
    label: 'RSI 14',
    color: '#8b5cf6',
    defaultOn: true,
    series: [{ key: 'rsi', color: '#8b5cf6', scaleId: 'rsi', kind: 'line' }],
  },
  {
    id: 'macd',
    label: 'MACD',
    color: '#2563eb',
    defaultOn: false,
    series: [
      { key: 'macd_line', color: '#2563eb', scaleId: 'macd', kind: 'line' },
      { key: 'macd_signal', color: '#f59e0b', scaleId: 'macd', kind: 'line', lineWidth: 1 },
      { key: 'macd_hist', color: '#64748b', scaleId: 'macd', kind: 'histogram' },
    ],
  },
  {
    id: 'stochastic',
    label: 'Stoch 14',
    color: '#06b6d4',
    defaultOn: false,
    series: [
      { key: 'stoch_k', color: '#06b6d4', scaleId: 'stoch', kind: 'line' },
      { key: 'stoch_d', color: '#f43f5e', scaleId: 'stoch', kind: 'line', lineWidth: 1 },
    ],
  },
  {
    id: 'cci',
    label: 'CCI 20',
    color: '#84cc16',
    defaultOn: false,
    series: [{ key: 'cci', color: '#84cc16', scaleId: 'cci', kind: 'line' }],
  },
  {
    id: 'atr',
    label: 'ATR 14',
    color: '#eab308',
    defaultOn: false,
    series: [{ key: 'atr', color: '#eab308', scaleId: 'atr', kind: 'line' }],
  },
  {
    id: 'adx',
    label: 'ADX 14',
    color: '#6366f1',
    defaultOn: false,
    series: [{ key: 'adx', color: '#6366f1', scaleId: 'adx', kind: 'line' }],
  },
  {
    id: 'obv',
    label: 'OBV',
    color: '#78716c',
    defaultOn: false,
    series: [{ key: 'obv', color: '#78716c', scaleId: 'obv', kind: 'line' }],
  },
  {
    id: 'volume',
    label: 'Volume',
    color: '#64748b',
    defaultOn: true,
    series: [{ key: 'volume', color: '#64748b', scaleId: 'volume', kind: 'histogram' }],
  },
]

/** Bottom-to-top pane stack (oscillator bands) */
export const DESK_INDICATOR_PANES: Array<{
  toggleId: DeskIndicatorId
  scaleId: string
  fraction: number
}> = [
  { toggleId: 'volume', scaleId: 'volume', fraction: 0.1 },
  { toggleId: 'obv', scaleId: 'obv', fraction: 0.09 },
  { toggleId: 'atr', scaleId: 'atr', fraction: 0.09 },
  { toggleId: 'macd', scaleId: 'macd', fraction: 0.12 },
  { toggleId: 'rsi', scaleId: 'rsi', fraction: 0.1 },
  { toggleId: 'stochastic', scaleId: 'stoch', fraction: 0.1 },
  { toggleId: 'cci', scaleId: 'cci', fraction: 0.1 },
  { toggleId: 'adx', scaleId: 'adx', fraction: 0.1 },
]

export const ALL_DESK_SERIES: DeskSeriesDef[] = DESK_INDICATORS.flatMap((d) => d.series)

export const ALL_DESK_SCALE_IDS = [
  'right',
  ...DESK_INDICATOR_PANES.map((p) => p.scaleId),
]

export function defaultDeskIndicatorSet(): Set<DeskIndicatorId> {
  return new Set(DESK_INDICATORS.filter((d) => d.defaultOn).map((d) => d.id))
}

export function allDeskIndicatorSet(): Set<DeskIndicatorId> {
  return new Set(DESK_INDICATORS.map((d) => d.id))
}

export function activeSeriesKeys(active: Set<DeskIndicatorId>): Set<DeskSeriesKey> {
  const keys = new Set<DeskSeriesKey>()
  for (const def of DESK_INDICATORS) {
    if (!active.has(def.id)) continue
    for (const s of def.series) keys.add(s.key)
  }
  return keys
}

function smaAt(closes: number[], end: number, period: number): number | null {
  if (end + 1 < period) return null
  let sum = 0
  for (let i = end - period + 1; i <= end; i++) sum += closes[i]
  return sum / period
}

function emaSeriesValues(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period) return out
  let e = closes.slice(0, period).reduce((s, v) => s + v, 0) / period
  out[period - 1] = e
  const k = 2 / (period + 1)
  for (let i = period; i < closes.length; i++) {
    e = closes[i] * k + e * (1 - k)
    out[i] = e
  }
  return out
}

function emaFromNullable(values: (number | null)[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null)
  const seed: number[] = []
  let start = -1
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue
    seed.push(values[i]!)
    start = i
    if (seed.length >= period) break
  }
  if (seed.length < period || start < 0) return out
  let e = seed.slice(0, period).reduce((s, v) => s + v, 0) / period
  out[start] = e
  const k = 2 / (period + 1)
  for (let i = start + 1; i < values.length; i++) {
    const v = values[i]
    if (v == null) continue
    e = v * k + e * (1 - k)
    out[i] = e
  }
  return out
}

function wmaSeriesValues(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  for (let i = period - 1; i < closes.length; i++) {
    let sum = 0
    let wsum = 0
    for (let j = 0; j < period; j++) {
      const w = j + 1
      sum += closes[i - period + 1 + j] * w
      wsum += w
    }
    out[i] = sum / wsum
  }
  return out
}

function rsiSeriesValues(closes: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(closes.length).fill(null)
  if (closes.length < period + 1) return out
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d >= 0) avgGain += d
    else avgLoss -= d
  }
  avgGain /= period
  avgLoss /= period
  const rsiAt = (g: number, l: number) => (l === 0 ? 100 : 100 - 100 / (1 + g / l))
  out[period] = rsiAt(avgGain, avgLoss)
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = rsiAt(avgGain, avgLoss)
  }
  return out
}

function toPoints(bars: OhlcBar[], values: (number | null)[]): IndicatorPoint[] {
  const pts: IndicatorPoint[] = []
  for (let i = 0; i < bars.length; i++) {
    const v = values[i]
    if (v == null || !Number.isFinite(v)) continue
    pts.push({ time: bars[i].t, value: v })
  }
  return pts
}

function bollingerSeries(
  bars: OhlcBar[],
  period = 20,
  mult = 2,
): { upper: IndicatorPoint[]; mid: IndicatorPoint[]; lower: IndicatorPoint[] } {
  const closes = bars.map((b) => b.c)
  const upper: IndicatorPoint[] = []
  const mid: IndicatorPoint[] = []
  const lower: IndicatorPoint[] = []
  for (let i = period - 1; i < bars.length; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const m = slice.reduce((s, v) => s + v, 0) / period
    let varSum = 0
    for (const v of slice) varSum += (v - m) ** 2
    const std = Math.sqrt(varSum / period)
    const t = bars[i].t
    mid.push({ time: t, value: m })
    upper.push({ time: t, value: m + mult * std })
    lower.push({ time: t, value: m - mult * std })
  }
  return { upper, mid, lower }
}

function macdSeries(bars: OhlcBar[]): {
  line: IndicatorPoint[]
  signal: IndicatorPoint[]
  hist: IndicatorPoint[]
} {
  const closes = bars.map((b) => b.c)
  const ema12 = emaSeriesValues(closes, 12)
  const ema26 = emaSeriesValues(closes, 26)
  const macdVals: (number | null)[] = new Array(closes.length).fill(null)
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] != null && ema26[i] != null) macdVals[i] = ema12[i]! - ema26[i]!
  }
  const signalVals = emaFromNullable(macdVals, 9)
  const line: IndicatorPoint[] = []
  const signal: IndicatorPoint[] = []
  const hist: IndicatorPoint[] = []
  for (let i = 0; i < bars.length; i++) {
    const m = macdVals[i]
    const s = signalVals[i]
    if (m != null) line.push({ time: bars[i].t, value: m })
    if (s != null) signal.push({ time: bars[i].t, value: s })
    if (m != null && s != null) hist.push({ time: bars[i].t, value: m - s })
  }
  return { line, signal, hist }
}

function stochasticSeries(bars: OhlcBar[], period = 14, smooth = 3): {
  k: IndicatorPoint[]
  d: IndicatorPoint[]
} {
  const kVals: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    let lo = bars[i].l
    let hi = bars[i].h
    for (let j = i - period + 1; j <= i; j++) {
      if (bars[j].l < lo) lo = bars[j].l
      if (bars[j].h > hi) hi = bars[j].h
    }
    const span = hi - lo
    kVals[i] = span > 0 ? (100 * (bars[i].c - lo)) / span : 50
  }
  const dVals: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = period - 1 + smooth - 1; i < bars.length; i++) {
    let sum = 0
    let n = 0
    for (let j = i - smooth + 1; j <= i; j++) {
      if (kVals[j] == null) continue
      sum += kVals[j]!
      n++
    }
    if (n === smooth) dVals[i] = sum / smooth
  }
  return { k: toPoints(bars, kVals), d: toPoints(bars, dVals) }
}

function cciSeries(bars: OhlcBar[], period = 20): IndicatorPoint[] {
  const tp = bars.map((b) => (b.h + b.l + b.c) / 3)
  const out: (number | null)[] = new Array(bars.length).fill(null)
  for (let i = period - 1; i < bars.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1)
    const mean = slice.reduce((s, v) => s + v, 0) / period
    let devSum = 0
    for (const v of slice) devSum += Math.abs(v - mean)
    const md = devSum / period
    if (md === 0) out[i] = 0
    else out[i] = (tp[i] - mean) / (0.015 * md)
  }
  return toPoints(bars, out)
}

function atrSeries(bars: OhlcBar[], period = 14): IndicatorPoint[] {
  const tr: number[] = new Array(bars.length).fill(0)
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) tr[i] = bars[i].h - bars[i].l
    else {
      const prev = bars[i - 1].c
      tr[i] = Math.max(
        bars[i].h - bars[i].l,
        Math.abs(bars[i].h - prev),
        Math.abs(bars[i].l - prev),
      )
    }
  }
  const out: (number | null)[] = new Array(bars.length).fill(null)
  if (bars.length < period) return []
  let atr = tr.slice(0, period).reduce((s, v) => s + v, 0) / period
  out[period - 1] = atr
  for (let i = period; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr[i]) / period
    out[i] = atr
  }
  return toPoints(bars, out)
}

function adxSeries(bars: OhlcBar[], period = 14): IndicatorPoint[] {
  const len = bars.length
  if (len < period + 1) return []
  const tr: number[] = new Array(len).fill(0)
  const plusDm: number[] = new Array(len).fill(0)
  const minusDm: number[] = new Array(len).fill(0)
  for (let i = 1; i < len; i++) {
    const up = bars[i].h - bars[i - 1].h
    const down = bars[i - 1].l - bars[i].l
    plusDm[i] = up > down && up > 0 ? up : 0
    minusDm[i] = down > up && down > 0 ? down : 0
    const prev = bars[i - 1].c
    tr[i] = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - prev), Math.abs(bars[i].l - prev))
  }
  let trSum = 0
  let plusSum = 0
  let minusSum = 0
  for (let i = 1; i <= period; i++) {
    trSum += tr[i]
    plusSum += plusDm[i]
    minusSum += minusDm[i]
  }
  const dx: (number | null)[] = new Array(len).fill(null)
  for (let i = period; i < len; i++) {
    if (i > period) {
      trSum = trSum - trSum / period + tr[i]
      plusSum = plusSum - plusSum / period + plusDm[i]
      minusSum = minusSum - minusSum / period + minusDm[i]
    }
    const plusDi = trSum > 0 ? (100 * plusSum) / trSum : 0
    const minusDi = trSum > 0 ? (100 * minusSum) / trSum : 0
    const diSum = plusDi + minusDi
    dx[i] = diSum > 0 ? (100 * Math.abs(plusDi - minusDi)) / diSum : 0
  }
  const adxVals: (number | null)[] = new Array(len).fill(null)
  let start = period * 2 - 1
  if (start >= len) return []
  let sumDx = 0
  for (let i = period; i <= start; i++) {
    if (dx[i] != null) sumDx += dx[i]!
  }
  adxVals[start] = sumDx / period
  for (let i = start + 1; i < len; i++) {
    if (dx[i] == null || adxVals[i - 1] == null) continue
    adxVals[i] = (adxVals[i - 1]! * (period - 1) + dx[i]!) / period
  }
  return toPoints(bars, adxVals)
}

function obvSeries(bars: OhlcBar[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = []
  if (!bars.length) return out
  let obv = 0
  out.push({ time: bars[0].t, value: 0 })
  for (let i = 1; i < bars.length; i++) {
    const v = bars[i].v ?? 0
    if (bars[i].c > bars[i - 1].c) obv += v
    else if (bars[i].c < bars[i - 1].c) obv -= v
    out.push({ time: bars[i].t, value: obv })
  }
  return out
}

function vwapSeries(bars: OhlcBar[]): IndicatorPoint[] {
  const out: IndicatorPoint[] = []
  let cumVp = 0
  let cumV = 0
  for (const b of bars) {
    const v = b.v ?? 0
    if (v <= 0) continue
    const tp = (b.h + b.l + b.c) / 3
    cumVp += tp * v
    cumV += v
    if (cumV > 0) out.push({ time: b.t, value: cumVp / cumV })
  }
  return out
}

export function smaIndicatorSeries(bars: OhlcBar[], period: number): IndicatorPoint[] {
  const closes = bars.map((b) => b.c)
  const pts: IndicatorPoint[] = []
  for (let i = 0; i < bars.length; i++) {
    const v = smaAt(closes, i, period)
    if (v == null) continue
    pts.push({ time: bars[i].t, value: v })
  }
  return pts
}

export function emaIndicatorSeries(bars: OhlcBar[], period: number): IndicatorPoint[] {
  const closes = bars.map((b) => b.c)
  return toPoints(bars, emaSeriesValues(closes, period))
}

export function seriesDataForKey(key: DeskSeriesKey, bars: OhlcBar[]): IndicatorPoint[] {
  switch (key) {
    case 'sma20':
      return smaIndicatorSeries(bars, 20)
    case 'sma50':
      return smaIndicatorSeries(bars, 50)
    case 'sma200':
      return smaIndicatorSeries(bars, 200)
    case 'ema9':
      return emaIndicatorSeries(bars, 9)
    case 'ema21':
      return emaIndicatorSeries(bars, 21)
    case 'wma20':
      return toPoints(bars, wmaSeriesValues(bars.map((b) => b.c), 20))
    case 'bb_upper':
      return bollingerSeries(bars).upper
    case 'bb_mid':
      return bollingerSeries(bars).mid
    case 'bb_lower':
      return bollingerSeries(bars).lower
    case 'vwap':
      return vwapSeries(bars)
    case 'rsi':
      return toPoints(bars, rsiSeriesValues(bars.map((b) => b.c), 14))
    case 'macd_line':
      return macdSeries(bars).line
    case 'macd_signal':
      return macdSeries(bars).signal
    case 'macd_hist':
      return macdSeries(bars).hist
    case 'stoch_k':
      return stochasticSeries(bars).k
    case 'stoch_d':
      return stochasticSeries(bars).d
    case 'cci':
      return cciSeries(bars)
    case 'atr':
      return atrSeries(bars)
    case 'adx':
      return adxSeries(bars)
    case 'obv':
      return obvSeries(bars)
    case 'volume':
      return bars
        .filter((b) => Number.isFinite(b.v) && b.v > 0)
        .map((b) => ({ time: b.t, value: b.v }))
    default:
      return []
  }
}

export function toLineData(points: IndicatorPoint[]): { time: UTCTimestamp; value: number }[] {
  return points.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))
}

export function volumeHistogramData(
  bars: OhlcBar[],
): { time: UTCTimestamp; value: number; color: string }[] {
  return bars
    .filter((b) => Number.isFinite(b.v) && b.v > 0)
    .map((b) => ({
      time: b.t as UTCTimestamp,
      value: b.v,
      color: b.c >= b.o ? 'rgba(5, 150, 105, 0.45)' : 'rgba(225, 29, 72, 0.45)',
    }))
}

export function macdHistogramData(
  bars: OhlcBar[],
): { time: UTCTimestamp; value: number; color: string }[] {
  return macdSeries(bars).hist.map((p) => ({
    time: p.time as UTCTimestamp,
    value: p.value,
    color: p.value >= 0 ? 'rgba(37, 99, 235, 0.5)' : 'rgba(225, 29, 72, 0.5)',
  }))
}

export function applyIndicatorScaleMargins(
  chart: {
    priceScale: (id: string) => {
      applyOptions: (opts: {
        scaleMargins?: { top: number; bottom: number }
        visible?: boolean
      }) => void
    }
  },
  active: Set<DeskIndicatorId>,
) {
  let bottomEdge = 0.02
  for (const pane of DESK_INDICATOR_PANES) {
    const on = active.has(pane.toggleId)
    if (!on) {
      chart.priceScale(pane.scaleId).applyOptions({ visible: false })
      continue
    }
    const topEdge = bottomEdge + pane.fraction
    chart.priceScale(pane.scaleId).applyOptions({
      visible: true,
      scaleMargins: { top: 1 - topEdge, bottom: bottomEdge },
    })
    bottomEdge = topEdge
  }

  chart.priceScale('right').applyOptions({
    visible: true,
    scaleMargins: { top: 0.04, bottom: Math.min(0.72, bottomEdge + 0.03) },
  })
}
