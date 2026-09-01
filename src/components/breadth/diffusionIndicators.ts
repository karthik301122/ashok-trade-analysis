import type { LineData, Time } from 'lightweight-charts'
import type { UTCTimestamp } from 'lightweight-charts'
import type { BreadthBundle } from './breadthMath'
import type { BreadthDailyPoint } from '../../lib/breadthApi'

export type DiffusionIndicatorId =
  | 'sma-20'
  | 'sma-50'
  | 'sma-200'
  | 'rsi-50'
  | 'rsi-70'
  | 'rsi-30'
  | 'rs-50'
  | 'rvol-15'
  | 'near-52w'
  | 'thrust'

export type DiffusionIndicatorGroup = {
  id: string
  label: string
  indicators: {
    id: DiffusionIndicatorId
    label: string
    field?: keyof BreadthDailyPoint
    historyKey?: keyof BreadthBundle['history']
    scale: 'percent' | 'thrust'
  }[]
}

export const DIFFUSION_GROUPS: DiffusionIndicatorGroup[] = [
  {
    id: 'sma',
    label: 'Simple Moving Average',
    indicators: [
      { id: 'sma-20', label: '% of Stocks above 20SMA', field: 'above20', historyKey: 'above20', scale: 'percent' },
      { id: 'sma-50', label: '% of Stocks above 50SMA', field: 'above50', historyKey: 'above50', scale: 'percent' },
      { id: 'sma-200', label: '% of Stocks above 200SMA', field: 'above200', historyKey: 'above200', scale: 'percent' },
    ],
  },
  {
    id: 'rsi',
    label: 'RSI',
    indicators: [
      { id: 'rsi-50', label: '% of Stocks RSI ≥ 50', field: 'rsi50', scale: 'percent' },
      { id: 'rsi-70', label: '% of Stocks RSI ≥ 70 (overbought)', field: 'rsi70', historyKey: 'rsiOb', scale: 'percent' },
      { id: 'rsi-30', label: '% of Stocks RSI ≤ 30 (oversold)', field: 'rsi30', historyKey: 'rsiOs', scale: 'percent' },
    ],
  },
  {
    id: 'rs',
    label: 'Relative Strength',
    indicators: [
      { id: 'rs-50', label: '% of Stocks RS ≥ 50', field: 'rs50', historyKey: 'rs50', scale: 'percent' },
    ],
  },
  {
    id: 'volume',
    label: 'Volume',
    indicators: [
      { id: 'rvol-15', label: '% of Stocks RVOL ≥ 1.5×', field: 'rvol15', historyKey: 'rvol15', scale: 'percent' },
    ],
  },
  {
    id: 'internals',
    label: 'Market Internals',
    indicators: [
      { id: 'near-52w', label: '% of Stocks near 52-week high', field: 'near52w', historyKey: 'near52w', scale: 'percent' },
      { id: 'thrust', label: 'Breadth thrust (adv / adv+dec)', historyKey: 'thrust', scale: 'thrust' },
    ],
  },
]

export const DIFFUSION_INDICATORS = DIFFUSION_GROUPS.flatMap((g) => g.indicators)

export function findDiffusionIndicator(id: DiffusionIndicatorId) {
  return DIFFUSION_INDICATORS.find((i) => i.id === id) ?? DIFFUSION_INDICATORS[0]
}

export function dayToChartTime(day: string): UTCTimestamp {
  const iso = day.length === 10 ? day : null
  if (iso) {
    return Math.floor(new Date(`${iso}T12:00:00Z`).getTime() / 1000) as UTCTimestamp
  }
  const parsed = Date.parse(day)
  if (!Number.isNaN(parsed)) {
    return Math.floor(parsed / 1000) as UTCTimestamp
  }
  return Math.floor(Date.now() / 1000) as UTCTimestamp
}

function dedupeLineSeries(data: LineData<Time>[]): LineData<Time>[] {
  const byTime = new Map<number, LineData<Time>>()
  for (const point of data) {
    const t = point.time as number
    if (!Number.isFinite(t)) continue
    const v = point.value
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    byTime.set(t, { time: point.time, value: v })
  }
  return [...byTime.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, point]) => point)
}

function seriesFromDailyHistory(
  points: BreadthDailyPoint[],
  field: keyof BreadthDailyPoint,
): LineData<Time>[] {
  const out: LineData<Time>[] = []
  for (const p of points) {
    const v = p[field]
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    out.push({ time: dayToChartTime(p.day), value: v })
  }
  return dedupeLineSeries(out)
}

function seriesFromBundleHistory(
  bundle: BreadthBundle,
  key: keyof BreadthBundle['history'],
): LineData<Time>[] {
  const h = bundle.history
  const values = h[key]
  if (!Array.isArray(values) || !h.dates.length) return []
  const out: LineData<Time>[] = []
  const base = Date.now() / 1000 - values.length * 86400
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (typeof v !== 'number' || Number.isNaN(v)) continue
    const day = h.dates[i]
    const time = day?.length === 10 ? dayToChartTime(day) : (base + i * 86400)
    out.push({ time: time as UTCTimestamp, value: v })
  }
  return dedupeLineSeries(out)
}

export function buildDiffusionSeries(
  bundle: BreadthBundle,
  indicatorId: DiffusionIndicatorId,
  chartHistory?: BreadthDailyPoint[],
): LineData<Time>[] {
  const def = findDiffusionIndicator(indicatorId)
  const daily =
    chartHistory && chartHistory.length >= 2
      ? chartHistory
      : bundle.dailyHistory.length >= 10
        ? bundle.dailyHistory
        : bundle.historyKind === 'ohlc-daily'
          ? bundle.dailyHistory
          : []

  if (def.field && daily.length) {
    return seriesFromDailyHistory(daily, def.field)
  }
  if (indicatorId === 'thrust' && daily.length) {
    return dedupeLineSeries(
      daily.map((p) => {
        const adv = p.advancing ?? 0
        const dec = p.declining ?? 0
        const tot = adv + dec
        return {
          time: dayToChartTime(p.day),
          value: tot > 0 ? Math.round((adv / tot) * 1000) / 1000 : 0.5,
        }
      }),
    )
  }
  if (def.historyKey) {
    return seriesFromBundleHistory(bundle, def.historyKey)
  }
  return []
}

export function currentDiffusionValue(
  bundle: BreadthBundle,
  indicatorId: DiffusionIndicatorId,
): number {
  switch (indicatorId) {
    case 'sma-20':
      return bundle.pctAbove20
    case 'sma-50':
      return bundle.pctAbove50
    case 'sma-200':
      return bundle.pctAbove200
    case 'rsi-50':
      return bundle.pctRsi50
    case 'rsi-70':
      return bundle.pctRsi70
    case 'rsi-30':
      return bundle.history.rsiOs.at(-1) ?? 0
    case 'rs-50':
      return bundle.pctRs50
    case 'rvol-15':
      return bundle.pctRvol15
    case 'near-52w':
      return bundle.pctNear52w
    case 'thrust':
      return bundle.history.thrust.at(-1) ?? 0.5
    default:
      return 0
  }
}

export function diffusionReferenceLevels(scale: 'percent' | 'thrust'): number[] {
  return scale === 'percent' ? [10, 20, 80, 90] : [0.4, 0.5, 0.615]
}

export function diffusionGroupForIndicator(id: DiffusionIndicatorId): string {
  return DIFFUSION_GROUPS.find((g) => g.indicators.some((i) => i.id === id))?.label ?? 'Indicator'
}
