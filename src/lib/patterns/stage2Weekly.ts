import type { OhlcBar } from './types'

/** Simple SMA of the last `period` closes ending at index i (newest-first series). */
export function smaAt(closes: number[], i: number, period: number): number | null {
  if (i + period > closes.length) return null
  let s = 0
  for (let k = 0; k < period; k++) s += closes[i + k]
  return s / period
}

/**
 * Karthik Stage 2 (weekly bars, newest-first):
 * - 10 WMA > 30 WMA
 * - 30 WMA > 40 WMA
 * - 30 WMA and 40 WMA slopes rising (current > value 2 weeks earlier)
 * - Price (close) above 10, 30, and 40 WMAs
 */
export function isStage2Weekly(weeks: OhlcBar[], i = 0): boolean {
  const need = 40 + 2 // 40 WMA + slope lookback
  if (i < 0 || weeks.length < need + i) return false
  const closes = weeks.map((w) => w.c)
  const c = closes[i]
  const ma10 = smaAt(closes, i, 10)
  const ma30 = smaAt(closes, i, 30)
  const ma40 = smaAt(closes, i, 40)
  const ma30Prev = smaAt(closes, i + 2, 30)
  const ma40Prev = smaAt(closes, i + 2, 40)
  if (
    ma10 == null ||
    ma30 == null ||
    ma40 == null ||
    ma30Prev == null ||
    ma40Prev == null
  ) {
    return false
  }
  if (!(ma10 > ma30)) return false
  if (!(ma30 > ma40)) return false
  if (!(ma30 > ma30Prev)) return false
  if (!(ma40 > ma40Prev)) return false
  if (!(c > ma10 && c > ma30 && c > ma40)) return false
  return true
}

/** ~3 months ≈ 13 weekly closes: return from close[i+13] → close[i]. */
export function weeklyReturnOver(weeks: OhlcBar[], i: number, lookbackWeeks: number): number | null {
  const j = i + lookbackWeeks
  if (j >= weeks.length) return null
  const a = weeks[i].c
  const b = weeks[j].c
  if (!b || b <= 0) return null
  return ((a - b) / b) * 100
}

/**
 * Primary context for Karthik special weekly patterns:
 * Stage 2 OR at least 30% rally over ~3 months (13 weeks).
 */
export function hasKarthikSpecialContext(weeks: OhlcBar[], i = 0): boolean {
  if (isStage2Weekly(weeks, i)) return true
  const r = weeklyReturnOver(weeks, i, 13)
  return r != null && r >= 30
}
