import { sma, type OhlcBar } from '../deskSeries'
import type { PatternBias, PatternHit } from './types'
import { atr } from './livermoreScores'

import { scoreFromFlags } from './patternFormingScore'

const LOOKBACK_BARS = 10
/** Need SMA(200) + ATR lookback. */
const MIN_BARS = 221

/** Index returns for RS vs benchmark; optional full index bars for historical alignment. */
export type LaunchpadScanContext = {
  indexBars?: OhlcBar[]
  indexReturn5?: number
  indexReturn20?: number
}

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

function indexReturnAligned(
  stockBars: OhlcBar[],
  indexBars: OhlcBar[],
  stockIdx: number,
  days: number,
): number | null {
  const j = stockIdx - days
  if (j < 0) return null
  const iNow = indexBarIndexAtOrBefore(indexBars, stockBars[stockIdx].t)
  const iThen = indexBarIndexAtOrBefore(indexBars, stockBars[j].t)
  if (iNow < 0 || iThen < 0) return null
  const base = indexBars[iThen].c
  if (!base) return null
  return ((indexBars[iNow].c - base) / base) * 100
}

/** Stock ROC(n) minus index ROC(n) — RS vs ASX200 (or other benchmark bars). */
function relativeReturn(
  stockBars: OhlcBar[],
  stockIdx: number,
  days: number,
  ctx?: LaunchpadScanContext,
): number | null {
  const stockRet = returnOver(stockBars, days, stockIdx)
  if (stockRet == null) return null

  let indexRet: number | null = null
  if (ctx?.indexBars?.length) {
    indexRet = indexReturnAligned(stockBars, ctx.indexBars, stockIdx, days)
  } else if (stockIdx === stockBars.length - 1) {
    if (days === 5) indexRet = ctx?.indexReturn5 ?? 0
    else if (days === 20) indexRet = ctx?.indexReturn20 ?? 0
    else return null
  } else {
    return null
  }

  if (indexRet == null) return null
  return stockRet - indexRet
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

/** highest(high, period) inclusive of the signal bar. */
function highestHigh(bars: OhlcBar[], period: number, endIdx: number): number | null {
  const start = endIdx - period + 1
  if (start < 0) return null
  let hi = -Infinity
  for (let i = start; i <= endIdx; i++) hi = Math.max(hi, bars[i].h)
  return Number.isFinite(hi) ? hi : null
}

/** lowest(low, period) inclusive of the signal bar. */
function lowestLow(bars: OhlcBar[], period: number, endIdx: number): number | null {
  const start = endIdx - period + 1
  if (start < 0) return null
  let lo = Infinity
  for (let i = start; i <= endIdx; i++) lo = Math.min(lo, bars[i].l)
  return Number.isFinite(lo) ? lo : null
}

function smaVolume(bars: OhlcBar[], period: number, endIdx: number): number | null {
  const start = endIdx - period + 1
  if (start < 0) return null
  let sum = 0
  for (let i = start; i <= endIdx; i++) sum += bars[i].v ?? 0
  return sum / period
}

/**
 * Spec (source launchpad script):
 * atr20 < atr20[20] * 0.90
 * range10 < range10[10] * 0.85
 * inside bars (7) ≥ 2
 * RS20 > 0 AND RS5 > RS20
 * ROC5 > 0 AND ROC20 > 0 AND ROC20 < 15 AND ROC60 < 25
 * close > SMA20 > SMA50 > SMA200
 * close ≥ SMA20 AND close < highest(high,20) * 1.05
 * volume > SMA(volume,20) * 0.80
 * (highest(high,10) − lowest(low,10)) / close < 0.12
 */
export function launchpadCheckDetails(bars: OhlcBar[], i: number, ctx?: LaunchpadScanContext) {
  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  const inside = countInsideBars(bars, 7, i)
  const rs20 = relativeReturn(bars, i, 20, ctx)
  const rs5 = relativeReturn(bars, i, 5, ctx)
  const roc5 = returnOver(bars, 5, i)
  const roc20 = returnOver(bars, 20, i)
  const roc60 = returnOver(bars, 60, i)
  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const ma20 = sma(closes, 20)
  const ma50 = sma(closes, 50)
  const ma200 = sma(closes, 200)
  const res = highestHigh(bars, 20, i)
  const hi10 = highestHigh(bars, 10, i)
  const lo10 = lowestLow(bars, 10, i)
  const volSma20 = smaVolume(bars, 20, i)
  const close = bars[i].c
  const volume = bars[i].v ?? 0

  const atrContraction =
    atr20 != null && atr20Prev != null && atr20 < atr20Prev * 0.9
  const rangeContraction =
    range10 != null && range10Prev != null && range10 < range10Prev * 0.85
  const insideCondition = inside >= 2
  const rsCondition = rs20 != null && rs5 != null && rs20 > 0 && rs5 > rs20
  const momentumCondition =
    roc5 != null &&
    roc20 != null &&
    roc60 != null &&
    roc5 > 0 &&
    roc20 > 0 &&
    roc20 < 15 &&
    roc60 < 25
  const trendCondition =
    ma20 != null &&
    ma50 != null &&
    ma200 != null &&
    close > ma20 &&
    ma20 > ma50 &&
    ma50 > ma200
  const pivotCondition =
    ma20 != null && res != null && close >= ma20 && close < res * 1.05
  const volumeCondition = volSma20 != null && volume > volSma20 * 0.8
  const tightnessCondition =
    hi10 != null && lo10 != null && close > 0 && (hi10 - lo10) / close < 0.12

  return {
    atrContraction,
    rangeContraction,
    insideBars: inside,
    insideCondition,
    rs20VsIndex: rs20,
    rs5VsIndex: rs5,
    rsCondition,
    roc5,
    roc20,
    roc60,
    momentumCondition,
    ma20,
    ma50,
    ma200,
    resistance: res,
    close,
    trendCondition,
    pivotCondition,
    volumeCondition,
    tightnessCondition,
  }
}

/**
 * Weighted Launchpad Score (max 100). Confirmed when score ≥ 70.
 * Does not use volume/tightness — softer than the all-AND Launchpad.
 */
export function launchpadScorePoints(
  bars: OhlcBar[],
  i: number,
  ctx?: LaunchpadScanContext,
): number {
  if (bars.length < MIN_BARS || i < MIN_BARS - 1) return 0
  const d = launchpadCheckDetails(bars, i, ctx)
  let score = 0
  if (d.atrContraction) score += 15
  if (d.rangeContraction) score += 15
  if (d.insideCondition) score += 10
  if (d.rs20VsIndex != null && d.rs20VsIndex > 0) score += 10
  if (
    d.rs20VsIndex != null &&
    d.rs5VsIndex != null &&
    d.rs5VsIndex > d.rs20VsIndex
  ) {
    score += 15
  }
  if (d.roc5 != null && d.roc5 > 0) score += 5
  if (d.roc20 != null && d.roc20 > 0 && d.roc20 < 15) score += 10
  if (d.roc60 != null && d.roc60 > 0 && d.roc60 < 25) score += 5
  if (d.ma20 != null && d.ma50 != null && d.close > d.ma20 && d.ma20 > d.ma50) score += 5
  if (
    d.ma50 != null &&
    d.ma200 != null &&
    d.close > d.ma50 &&
    d.ma50 > d.ma200
  ) {
    score += 5
  }
  if (d.pivotCondition) score += 5
  return score
}

export function launchpadScorePasses(
  bars: OhlcBar[],
  i: number,
  ctx?: LaunchpadScanContext,
  threshold = 70,
): boolean {
  return launchpadScorePoints(bars, i, ctx) >= threshold
}

/**
 * Launchpad — full multi-factor coil (matches all-AND source script).
 */
export function launchpadPasses(
  bars: OhlcBar[],
  i: number,
  ctx?: LaunchpadScanContext,
): boolean {
  if (bars.length < MIN_BARS || i < MIN_BARS - 1) return false
  const d = launchpadCheckDetails(bars, i, ctx)
  return (
    d.atrContraction &&
    d.rangeContraction &&
    d.insideCondition &&
    d.rsCondition &&
    d.momentumCondition &&
    d.trendCondition &&
    d.pivotCondition &&
    d.volumeCondition &&
    d.tightnessCondition
  )
}

export function launchpadFormingScore(
  bars: OhlcBar[],
  i: number,
  ctx?: LaunchpadScanContext,
): number {
  if (bars.length < MIN_BARS || i < MIN_BARS - 1) return 0
  const d = launchpadCheckDetails(bars, i, ctx)
  return scoreFromFlags([
    d.atrContraction,
    d.rangeContraction,
    d.insideCondition,
    d.rsCondition,
    d.momentumCondition,
    d.trendCondition,
    d.pivotCondition,
    d.volumeCondition,
    d.tightnessCondition,
  ])
}

export function detectLaunchpad(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
  ctx?: LaunchpadScanContext,
): PatternHit | null {
  if (bars.length < MIN_BARS) return null
  const from = Math.max(MIN_BARS - 1, bars.length - LOOKBACK_BARS)
  let bestI = -1
  for (let idx = from; idx < bars.length; idx++) {
    if (launchpadPasses(bars, idx, ctx)) bestI = idx
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
      'Launchpad coil: ATR/range contraction, inside bars, RS accel, trend stack, under 20d resistance',
  }
}

export function detectLaunchpadScore(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
  ctx?: LaunchpadScanContext,
  threshold = 70,
): PatternHit | null {
  if (bars.length < MIN_BARS) return null
  const from = Math.max(MIN_BARS - 1, bars.length - LOOKBACK_BARS)
  let bestI = -1
  let bestScore = 0
  for (let idx = from; idx < bars.length; idx++) {
    const s = launchpadScorePoints(bars, idx, ctx)
    if (s >= threshold && s >= bestScore) {
      bestScore = s
      bestI = idx
    }
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  return {
    id: `launchpad-score-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: bar.t,
    endT: bar.t,
    confidence: Math.min(0.95, 0.55 + bestScore / 200),
    points: [{ time: bar.t, price: bar.c }],
    note:
      pattern.description?.trim() ||
      `Launchpad score ${bestScore}/100 (threshold ${threshold})`,
  }
}
