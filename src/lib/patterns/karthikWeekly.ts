import type { OhlcBar } from './types'
import { dailyToWeeklyBars, recentWeeklyBars } from './weeklyBars'

/** Max (max−min)/min spread across last 3 weekly closes — pattern if ≤ threshold (default 5%). */
export const THREE_WEEKS_TIGHT_THRESHOLD = 0.05

export type KarthikWeeklySignals = {
  threeWeeksTight: boolean
  tightness: number | null
  weeklyInsideBar: boolean
  doubleInsideBar: boolean
  doubleHammer: boolean
  weekEndT: number | null
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
  return Math.max(b.h - b.l, 1e-9)
}

/**
 * Weekly hammer at index i (0 = current week) per Karthik definition:
 * - lower wick ≥ 2× body
 * - minimal upper wick
 * - body near top of range
 * - decline into the week (prior close higher)
 */
export function isWeeklyHammer(weeks: OhlcBar[], i: number): boolean {
  if (i < 0 || i >= weeks.length) return false
  const b = weeks[i]
  const body = bodySize(b)
  const lw = lowerWick(b)
  const uw = upperWick(b)
  const rng = range(b)
  if (lw < 2 * Math.max(body, rng * 0.02)) return false
  if (uw > Math.max(body * 0.35, rng * 0.08)) return false
  const top = Math.max(b.o, b.c)
  if (top < b.h - rng * 0.28) return false
  const prior = weeks[i + 1]
  if (!prior) return false
  return prior.c > b.c
}

/** Inside bar: week[i] range contained in week[i+1]. */
export function isWeeklyInsideBar(weeks: OhlcBar[], i: number): boolean {
  if (i + 1 >= weeks.length) return false
  const cur = weeks[i]
  const prev = weeks[i + 1]
  return cur.h <= prev.h && cur.l >= prev.l
}

export function threeWeeksTightness(c1: number, c2: number, c3: number): number {
  const hi = Math.max(c1, c2, c3)
  const lo = Math.min(c1, c2, c3)
  if (lo <= 0) return Infinity
  return (hi - lo) / lo
}

export function detectThreeWeeksTight(
  daily: OhlcBar[],
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
): { hit: boolean; tightness: number | null } {
  const weekly = dailyToWeeklyBars(daily)
  const w = recentWeeklyBars(weekly, 3)
  if (w.length < 3) return { hit: false, tightness: null }
  const [c1, c2, c3] = [w[0].c, w[1].c, w[2].c]
  const tightness = threeWeeksTightness(c1, c2, c3)
  return { hit: tightness <= threshold, tightness }
}

export function detectKarthikWeekly(daily: OhlcBar[]): KarthikWeeklySignals {
  const weekly = dailyToWeeklyBars(daily)
  const w = recentWeeklyBars(weekly, 4)
  const empty: KarthikWeeklySignals = {
    threeWeeksTight: false,
    tightness: null,
    weeklyInsideBar: false,
    doubleInsideBar: false,
    doubleHammer: false,
    weekEndT: null,
  }
  if (w.length < 3) return empty

  const three = detectThreeWeeksTight(daily)
  const inside0 = isWeeklyInsideBar(w, 0)
  const inside1 = w.length >= 3 && isWeeklyInsideBar(w, 1)
  const doubleHammer =
    w.length >= 3 && isWeeklyHammer(w, 0) && isWeeklyHammer(w, 1)

  return {
    threeWeeksTight: three.hit,
    tightness: three.tightness,
    weeklyInsideBar: inside0,
    doubleInsideBar: inside0 && inside1,
    doubleHammer,
    weekEndT: w[0]?.t ?? null,
  }
}

export type KarthikPatternId =
  | 'three-weeks-tight'
  | 'weekly-inside-bar'
  | 'double-inside-bar'
  | 'double-hammer'

export function karthikPatternHit(
  daily: OhlcBar[],
  patternId: KarthikPatternId,
): { hit: boolean; tightness: number | null; weekEndT: number | null } {
  const sig = detectKarthikWeekly(daily)
  switch (patternId) {
    case 'three-weeks-tight':
      return { hit: sig.threeWeeksTight, tightness: sig.tightness, weekEndT: sig.weekEndT }
    case 'weekly-inside-bar':
      return { hit: sig.weeklyInsideBar, tightness: null, weekEndT: sig.weekEndT }
    case 'double-inside-bar':
      return { hit: sig.doubleInsideBar, tightness: null, weekEndT: sig.weekEndT }
    case 'double-hammer':
      return { hit: sig.doubleHammer, tightness: null, weekEndT: sig.weekEndT }
    default:
      return { hit: false, tightness: null, weekEndT: null }
  }
}
