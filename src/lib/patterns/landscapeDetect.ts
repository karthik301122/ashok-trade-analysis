import { sma, type OhlcBar } from '../yahoo'
import type { PatternBias, PatternHit } from './types'
import { atr } from './livermoreScores'
import type { LaunchpadScanContext } from './launchpadDetect'

const LOOKBACK_BARS = 10
const MIN_BARS = 63

export type LandscapeScanContext = LaunchpadScanContext

function returnOver(bars: OhlcBar[], days: number, endIdx: number): number | null {
  const j = endIdx - days
  if (j < 0) return null
  const base = bars[j].c
  if (!base) return null
  return ((bars[endIdx].c - base) / base) * 100
}

function indexBarIndexAtOrBefore(indexBars: OhlcBar[], t: number): number {
  for (let i = indexBars.length - 1; i >= 0; i--) {
    if (indexBars[i].t <= t) return i
  }
  return -1
}

/** RS = stock close / index close aligned to n sessions ago on the stock timeline. */
function rsCloseOverIndexClose(
  stockBars: OhlcBar[],
  stockIdx: number,
  days: number,
  ctx?: LandscapeScanContext,
): number | null {
  const j = stockIdx - days
  if (j < 0) return null
  const close = stockBars[stockIdx].c
  if (!close) return null
  if (!ctx?.indexBars?.length) return null
  const iThen = indexBarIndexAtOrBefore(ctx.indexBars, stockBars[j].t)
  if (iThen < 0) return null
  const indexClose = ctx.indexBars[iThen].c
  if (!indexClose) return null
  return close / indexClose
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

function highestHigh(bars: OhlcBar[], count: number, endIdx: number): number | null {
  const start = endIdx - count + 1
  if (start < 0) return null
  return Math.max(...bars.slice(start, endIdx + 1).map((b) => b.h))
}

function smaAt(bars: OhlcBar[], period: number, endIdx: number): number | null {
  if (endIdx < period - 1) return null
  const closes = bars.slice(0, endIdx + 1).map((b) => b.c)
  return sma(closes, period)
}

export function landscapeCheckDetails(bars: OhlcBar[], i: number, ctx?: LandscapeScanContext) {
  const quarterHigh = highestHigh(bars, 63, i)
  const close = bars[i].c
  const proximity =
    quarterHigh != null && quarterHigh > 0 ? ((quarterHigh - close) / quarterHigh) * 100 : null

  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  const inside = countInsideBars(bars, 5, i)

  const roc20 = returnOver(bars, 20, i)
  const roc60 = returnOver(bars, 60, i)

  const rs20 = rsCloseOverIndexClose(bars, i, 20, ctx)
  const rs5 = rsCloseOverIndexClose(bars, i, 5, ctx)

  const ma20 = smaAt(bars, 20, i)
  const ma20Prev1 = smaAt(bars, 20, i - 1)
  const ma20Prev2 = smaAt(bars, 20, i - 2)
  const res20 = highestHigh(bars, 20, i)

  return {
    quarterHigh,
    proximity,
    nearQuarterHigh: proximity != null && proximity < 1.2,
    atrContraction: atr20 != null && atr20Prev != null && atr20 < atr20Prev,
    rangeContraction: range10 != null && range10Prev != null && range10 < range10Prev,
    insideBars: inside,
    insideCondition: inside >= 2,
    roc20,
    roc60,
    momentumCondition:
      roc20 != null && roc60 != null && roc20 > 0 && roc60 > 0 && roc60 < 6,
    rs20,
    rs5,
    rsCondition: rs20 != null && rs5 != null && rs20 > 0 && rs5 > rs20 * 1.03,
    ma20,
    ma20Rising:
      ma20 != null &&
      ma20Prev1 != null &&
      ma20Prev2 != null &&
      close > ma20 &&
      ma20 > ma20Prev1 &&
      ma20Prev1 > ma20Prev2,
    res20,
    underResistance: res20 != null && close < res20 * 1.02,
  }
}

/**
 * Landscape — near 63-day high, volatility compression, inside bars,
 * positive ROC with capped 3M, improving RS vs index, rising 20 SMA, under 20d high.
 */
export function landscapePasses(
  bars: OhlcBar[],
  i: number,
  ctx?: LandscapeScanContext,
): boolean {
  if (bars.length < MIN_BARS || i < MIN_BARS - 1) return false

  const quarterHigh = highestHigh(bars, 63, i)
  if (quarterHigh == null || quarterHigh <= 0) return false
  const close = bars[i].c
  const proximity = ((quarterHigh - close) / quarterHigh) * 100
  if (proximity >= 1.2) return false

  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  if (atr20 == null || atr20Prev == null || atr20 >= atr20Prev) return false

  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  if (range10 == null || range10Prev == null || range10 >= range10Prev) return false

  if (countInsideBars(bars, 5, i) < 2) return false

  const roc20 = returnOver(bars, 20, i)
  const roc60 = returnOver(bars, 60, i)
  if (roc20 == null || roc60 == null || roc20 <= 0 || roc60 <= 0 || roc60 >= 6) return false

  const rs20 = rsCloseOverIndexClose(bars, i, 20, ctx)
  const rs5 = rsCloseOverIndexClose(bars, i, 5, ctx)
  if (rs20 == null || rs5 == null || rs20 <= 0 || rs5 <= rs20 * 1.03) return false

  const ma20 = smaAt(bars, 20, i)
  const ma20Prev1 = smaAt(bars, 20, i - 1)
  const ma20Prev2 = smaAt(bars, 20, i - 2)
  if (
    ma20 == null ||
    ma20Prev1 == null ||
    ma20Prev2 == null ||
    close <= ma20 ||
    ma20 <= ma20Prev1 ||
    ma20Prev1 <= ma20Prev2
  ) {
    return false
  }

  const res20 = highestHigh(bars, 20, i)
  if (res20 == null || close >= res20 * 1.02) return false

  return true
}

export function detectLandscape(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
  ctx?: LandscapeScanContext,
): PatternHit | null {
  if (bars.length < MIN_BARS) return null
  const from = Math.max(MIN_BARS - 1, bars.length - LOOKBACK_BARS)
  let bestI = -1
  for (let idx = from; idx < bars.length; idx++) {
    if (landscapePasses(bars, idx, ctx)) bestI = idx
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  return {
    id: `landscape-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: bar.t,
    endT: bar.t,
    confidence: 0.74,
    points: [{ time: bar.t, price: bar.c }],
    note:
      pattern.description?.trim() ||
      'Near 63d high, compression coil, rising 20 SMA, RS vs index improving, under 20d resistance',
  }
}
