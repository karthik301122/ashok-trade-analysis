/**
 * RSI Surge — 1–2 session reset into the RSI 50±5 zone with price + weekly confirm.
 * Port of the Optuma-style script (daily RSI(14), weekly RSI(14), breakout gates, SurgeScore).
 */
import { rsi, type OhlcBar } from '../deskSeries'
import type { PatternBias, PatternHit } from './types'
import { dailyToWeeklyBars } from './weeklyBars'

const RSI_PERIOD = 14
/** Daily bars needed for RSI[2] + High/Low[10]. */
const MIN_DAILY = RSI_PERIOD + 12
/** Weekly RSI(14) needs ≥15 completed/current weeks. */
const MIN_WEEKLY = RSI_PERIOD + 1
const LOOKBACK_BARS = 5

/** Wilder RSI(14) at each close index (null until warm). */
export function rsiSeries(closes: number[], period = RSI_PERIOD): Array<number | null> {
  const out: Array<number | null> = closes.map(() => null)
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
  const first =
    avgLoss === 0 ? 100 : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10
  out[period] = first
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] =
      avgLoss === 0 ? 100 : Math.round((100 - 100 / (1 + avgGain / avgLoss)) * 10) / 10
  }
  return out
}

export type RsiSurgeDetails = {
  rsiD: number | null
  rsi1: number | null
  rsi2: number | null
  rsiW: number | null
  in50Zone: boolean
  fromOversold: boolean
  fromOverbought: boolean
  minChangeOk: boolean
  priceBreakUp: boolean
  priceBreakDown: boolean
  weeklyConfirm: boolean
  surgeScore: number
  rsiSurgeBase: boolean
  confirmed: boolean
  bias: PatternBias
}

export function rsiSurgeCheckDetails(bars: OhlcBar[], i: number): RsiSurgeDetails | null {
  if (i < MIN_DAILY - 1 || bars.length < MIN_DAILY) return null
  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const series = rsiSeries(closes, RSI_PERIOD)
  const rsiD = series[i]
  const rsi1 = series[i - 1]
  const rsi2 = series[i - 2]
  if (rsiD == null || rsi1 == null || rsi2 == null) return null

  const weekly = dailyToWeeklyBars(bars.slice(0, i + 1))
  const weeklyCloses = weekly.map((w) => w.c)
  const rsiW =
    weeklyCloses.length >= MIN_WEEKLY ? rsi(weeklyCloses, RSI_PERIOD) : null

  const in50Zone = rsiD >= 45 && rsiD <= 55
  const oversold1 = rsi1 <= 30
  const oversold2 = rsi2 <= 30
  const overbought1 = rsi1 >= 70
  const overbought2 = rsi2 >= 70

  const change1 = Math.abs(rsiD - rsi1)
  const change2 = Math.abs(rsiD - rsi2)
  const minChangeOk = change1 >= 10 || change2 >= 10

  const fromOversold = (oversold1 || oversold2) && in50Zone
  const fromOverbought = (overbought1 || overbought2) && in50Zone
  const rsiSurgeBase = fromOversold || fromOverbought

  // Optuma High(D)[10] / Low(D)[10] — single bar offset, not rolling highest/lowest.
  const ref = bars[i - 10]
  const close = bars[i].c
  const priceBreakUp = Boolean(ref && close > ref.h)
  const priceBreakDown = Boolean(ref && close < ref.l)
  const priceConfirm = priceBreakUp || priceBreakDown

  const weeklyConfirm = rsiW != null && rsiW >= 50 && rsiW <= 60

  const scoreRsiChange = Math.min(change1, change2)
  const scoreDistance = 100 - Math.abs(rsiD - 50)
  const surgeScore = Math.round(scoreRsiChange * 0.6 + scoreDistance * 0.4)

  const confirmed =
    rsiSurgeBase && minChangeOk && priceConfirm && weeklyConfirm

  let bias: PatternBias = 'neutral'
  if (fromOversold && !fromOverbought) bias = 'bullish'
  else if (fromOverbought && !fromOversold) bias = 'bearish'
  else if (priceBreakUp && !priceBreakDown) bias = 'bullish'
  else if (priceBreakDown && !priceBreakUp) bias = 'bearish'

  return {
    rsiD,
    rsi1,
    rsi2,
    rsiW,
    in50Zone,
    fromOversold,
    fromOverbought,
    minChangeOk,
    priceBreakUp,
    priceBreakDown,
    weeklyConfirm,
    surgeScore,
    rsiSurgeBase,
    confirmed,
    bias,
  }
}

export function rsiSurgePasses(bars: OhlcBar[], i: number): boolean {
  return Boolean(rsiSurgeCheckDetails(bars, i)?.confirmed)
}

/** Soft forming score (0–100) — SurgeScore when near a reset, else partial gates. */
export function rsiSurgeFormingScore(bars: OhlcBar[], i: number): number {
  const d = rsiSurgeCheckDetails(bars, i)
  if (!d) return 0
  if (d.confirmed) return Math.max(70, Math.min(100, d.surgeScore))
  let gates = 0
  if (d.in50Zone) gates += 1
  if (d.fromOversold || d.fromOverbought) gates += 2
  else if ((d.rsi1 != null && (d.rsi1 <= 35 || d.rsi1 >= 65)) || (d.rsi2 != null && (d.rsi2 <= 35 || d.rsi2 >= 65)))
    gates += 1
  if (d.minChangeOk) gates += 1
  if (d.priceBreakUp || d.priceBreakDown) gates += 1
  if (d.weeklyConfirm) gates += 1
  const gateScore = Math.round((gates / 6) * 100)
  return Math.round(gateScore * 0.45 + Math.min(100, d.surgeScore) * 0.55)
}

export function detectRsiSurge(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
): PatternHit | null {
  if (bars.length < MIN_DAILY) return null
  const from = Math.max(MIN_DAILY - 1, bars.length - LOOKBACK_BARS)
  let bestI = -1
  let bestScore = 0
  let bestBias: PatternBias = pattern.bias
  for (let idx = from; idx < bars.length; idx++) {
    const d = rsiSurgeCheckDetails(bars, idx)
    if (!d?.confirmed) continue
    if (d.surgeScore >= bestScore) {
      bestScore = d.surgeScore
      bestI = idx
      bestBias = d.bias
    }
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  const d = rsiSurgeCheckDetails(bars, bestI)
  const dir = d?.fromOversold ? 'oversold→50' : d?.fromOverbought ? 'overbought→50' : 'reset'
  return {
    id: `rsi-surge-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: bestBias,
    startT: bar.t,
    endT: bar.t,
    confidence: Math.min(0.95, 0.55 + bestScore / 200),
    points: [{ time: bar.t, price: bar.c }],
    note:
      pattern.description?.trim() ||
      `RSI surge ${dir} · score ${bestScore}` +
        (d?.rsiW != null ? ` · weekly RSI ${d.rsiW}` : ''),
  }
}
