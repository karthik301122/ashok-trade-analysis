import { sma, type OhlcBar } from '../deskSeries'
import type { PatternBias, PatternHit } from './types'
import { atr } from './livermoreScores'

import { scoreFromFlags } from './patternFormingScore'

const LOOKBACK_BARS = 10
const MIN_BARS = 61

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

/** Max high over the prior 20 sessions (resistance), excluding the signal bar. */
function resistance20(bars: OhlcBar[], endIdx: number): number | null {
  if (endIdx < 20) return null
  const window = bars.slice(endIdx - 20, endIdx)
  return Math.max(...window.map((b) => b.h))
}

/** Exposed for tests — which launchpad clauses pass at bar index i. */
export function launchpadCheckDetails(bars: OhlcBar[], i: number, ctx?: LaunchpadScanContext) {
  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  const inside = countInsideBars(bars, 5, i)
  const rs20 = relativeReturn(bars, i, 20, ctx)
  const rs5 = relativeReturn(bars, i, 5, ctx)
  const roc20 = returnOver(bars, 20, i)
  const roc60 = returnOver(bars, 60, i)
  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const ma20 = sma(closes, 20)
  const res = resistance20(bars, i)
  const close = bars[i].c
  return {
    atrContraction: atr20 != null && atr20Prev != null && atr20 < atr20Prev,
    rangeContraction: range10 != null && range10Prev != null && range10 < range10Prev,
    insideBars: inside,
    insideCondition: inside >= 2,
    rs20VsIndex: rs20,
    rs5VsIndex: rs5,
    rsCondition: rs20 != null && rs5 != null && rs20 > 0 && rs5 > rs20,
    roc20,
    roc60,
    momentumCondition: roc20 != null && roc60 != null && roc20 > 0 && roc60 < 8,
    ma20,
    resistance: res,
    close,
    pivotCondition:
      ma20 != null && res != null && close > ma20 && close < res * 1.03,
  }
}

/**
 * Launchpad — volatility + range contraction, inside bars, RS vs index improving,
 * positive ROC(20) with capped ROC(60), price above 20 SMA but within 3% of 20d resistance.
 */
export function launchpadPasses(
  bars: OhlcBar[],
  i: number,
  ctx?: LaunchpadScanContext,
): boolean {
  if (bars.length < MIN_BARS || i < MIN_BARS - 1) return false

  const atr20 = atrAt(bars, 20, i)
  const atr20Prev = atrAt(bars, 20, i - 20)
  if (atr20 == null || atr20Prev == null || atr20 >= atr20Prev) return false

  const range10 = sumRange(bars, 10, i)
  const range10Prev = sumRange(bars, 10, i - 10)
  if (range10 == null || range10Prev == null || range10 >= range10Prev) return false

  if (countInsideBars(bars, 5, i) < 2) return false

  const rs20 = relativeReturn(bars, i, 20, ctx)
  const rs5 = relativeReturn(bars, i, 5, ctx)
  if (rs20 == null || rs5 == null || rs20 <= 0 || rs5 <= rs20) return false

  const roc20 = returnOver(bars, 20, i)
  const roc60 = returnOver(bars, 60, i)
  if (roc20 == null || roc60 == null || roc20 <= 0 || roc60 >= 8) return false

  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const ma20 = sma(closes, 20)
  const res = resistance20(bars, i)
  if (ma20 == null || res == null) return false

  const close = bars[i].c
  if (close <= ma20 || close >= res * 1.03) return false

  return true
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
    Boolean(d.ma20 != null && d.close > d.ma20),
    d.pivotCondition,
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
      'ATR + range contraction, inside bars, RS vs index improving, ROC capped, under 20d resistance',
  }
}
