import { sma, type OhlcBar } from '../yahoo'
import type { PatternBias, PatternHit } from './types'
import { atr } from './livermoreScores'

const LOOKBACK_BARS = 10
const MIN_BARS = 61

function returnOver(bars: OhlcBar[], days: number, endIdx: number): number | null {
  const j = endIdx - days
  if (j < 0) return null
  const base = bars[j].c
  if (!base) return null
  return ((bars[endIdx].c - base) / base) * 100
}

function atrAt(bars: OhlcBar[], period: number, endIdx: number): number | null {
  if (endIdx < period) return null
  return atr(bars.slice(0, endIdx + 1), period)
}

function sumRange(bars: OhlcBar[], count: number, endIdx: number): number | null {
  const start = endIdx - count + 1
  if (start < 0) return null
  let sum = 0
  for (let i = start; i <= endIdx; i++) sum += bars[i].h - bars[i].l
  return sum
}

function countInsideBars(bars: OhlcBar[], lookback: number, endIdx: number): number {
  let count = 0
  const start = Math.max(1, endIdx - lookback + 1)
  for (let j = start; j <= endIdx; j++) {
    if (bars[j].h <= bars[j - 1].h && bars[j].l >= bars[j - 1].l) count++
  }
  return count
}

/** Max high over the prior 20 sessions (resistance), excluding the signal bar. */
function resistance20(bars: OhlcBar[], endIdx: number): number | null {
  if (endIdx < 20) return null
  const window = bars.slice(endIdx - 20, endIdx)
  return Math.max(...window.map((b) => b.h))
}

/** Exposed for tests — which launchpad clauses pass at bar index i. */
export function launchpadCheckDetails(bars: OhlcBar[], i: number) {
  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  const inside = countInsideBars(bars, 5, i)
  const rs20 = returnOver(bars, 20, i)
  const rs5 = returnOver(bars, 5, i)
  const ret1m = returnOver(bars, 20, i)
  const ret3m = returnOver(bars, 60, i)
  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const ma20 = sma(closes, 20)
  const res = resistance20(bars, i)
  const close = bars[i].c
  return {
    atrContraction: atr20 != null && atr20Prev != null && atr20 < atr20Prev,
    rangeContraction: range10 != null && range10Prev != null && range10 < range10Prev,
    insideBars: inside,
    insideCondition: inside >= 2,
    rs20,
    rs5,
    rsCondition: rs20 != null && rs5 != null && rs20 > 0 && rs5 > rs20,
    ret1m,
    ret3m,
    momentumCondition: ret1m != null && ret3m != null && ret1m > 0 && ret3m < 8,
    ma20,
    resistance: res,
    close,
    pivotCondition:
      ma20 != null && res != null && close > ma20 && close < res * 1.03,
  }
}

/**
 * Launchpad — volatility + range contraction, inside bars, improving RS,
 * positive 1M with capped 3M, price above 20 SMA but within 3% of 20d resistance.
 */
export function launchpadPasses(bars: OhlcBar[], i: number): boolean {
  if (bars.length < MIN_BARS || i < MIN_BARS - 1) return false

  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  if (atr20 == null || atr20Prev == null || atr20 >= atr20Prev) return false

  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  if (range10 == null || range10Prev == null || range10 >= range10Prev) return false

  if (countInsideBars(bars, 5, i) < 2) return false

  const rs20 = returnOver(bars, 20, i)
  const rs5 = returnOver(bars, 5, i)
  if (rs20 == null || rs5 == null || rs20 <= 0 || rs5 <= rs20) return false

  const ret1m = returnOver(bars, 20, i)
  const ret3m = returnOver(bars, 60, i)
  if (ret1m == null || ret3m == null || ret1m <= 0 || ret3m >= 8) return false

  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const ma20 = sma(closes, 20)
  const res = resistance20(bars, i)
  if (ma20 == null || res == null) return false

  const close = bars[i].c
  if (close <= ma20 || close >= res * 1.03) return false

  return true
}

export function detectLaunchpad(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
): PatternHit | null {
  if (bars.length < MIN_BARS) return null
  const from = Math.max(MIN_BARS - 1, bars.length - LOOKBACK_BARS)
  let bestI = -1
  for (let idx = from; idx < bars.length; idx++) {
    if (launchpadPasses(bars, idx)) bestI = idx
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  return {
    id: `launchpad-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: bar.t,
    endT: bar.t,
    confidence: 0.72,
    points: [{ time: bar.t, price: bar.c }],
    note:
      pattern.description?.trim() ||
      'ATR + range contraction, inside bars, RS improving, under 20d resistance',
  }
}
