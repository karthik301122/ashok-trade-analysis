import type { OhlcBar } from './types'
import { completedWeeklyBars } from './weeklyBars'

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

export function threeWeeksTightAt(
  weeks: OhlcBar[],
  i: number,
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
): boolean {
  if (i + 2 >= weeks.length) return false
  return threeWeeksTightness(weeks[i].c, weeks[i + 1].c, weeks[i + 2].c) <= threshold
}

/**
 * When the current 3-week-tight streak first formed in the market:
 * end of the newest week in the oldest qualifying triple still in the chain.
 */
export function threeWeeksTightFormationWeek(
  weeks: OhlcBar[],
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
): { hit: boolean; tightness: number | null; weekEndT: number | null } {
  if (weeks.length < 3 || !threeWeeksTightAt(weeks, 0, threshold)) {
    return { hit: false, tightness: null, weekEndT: null }
  }
  const tightness = threeWeeksTightness(weeks[0].c, weeks[1].c, weeks[2].c)
  let maxI = 0
  for (let i = 0; i <= weeks.length - 3; i++) {
    if (threeWeeksTightAt(weeks, i, threshold)) maxI = i
    else break
  }
  return { hit: true, tightness, weekEndT: weeks[maxI]?.t ?? null }
}

export function detectThreeWeeksTight(
  daily: OhlcBar[],
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
  nowSec?: number,
): { hit: boolean; tightness: number | null; weekEndT: number | null } {
  const weeks = completedWeeklyBars(daily, nowSec)
  return threeWeeksTightFormationWeek(weeks, threshold)
}

export function detectKarthikWeekly(daily: OhlcBar[], nowSec?: number): KarthikWeeklySignals {
  const weeks = completedWeeklyBars(daily, nowSec)
  const empty: KarthikWeeklySignals = {
    threeWeeksTight: false,
    tightness: null,
    weeklyInsideBar: false,
    doubleInsideBar: false,
    doubleHammer: false,
    weekEndT: null,
  }
  if (weeks.length < 3) return empty

  const three = threeWeeksTightFormationWeek(weeks)
  const inside0 = isWeeklyInsideBar(weeks, 0)
  const inside1 = weeks.length >= 3 && isWeeklyInsideBar(weeks, 1)
  const doubleHammer =
    weeks.length >= 3 && isWeeklyHammer(weeks, 0) && isWeeklyHammer(weeks, 1)

  let weekEndT: number | null = null
  if (three.hit) weekEndT = three.weekEndT
  else if (inside0 && inside1) weekEndT = weeks[0]?.t ?? null
  else if (inside0) weekEndT = weeks[0]?.t ?? null
  else if (doubleHammer) weekEndT = weeks[0]?.t ?? null

  return {
    threeWeeksTight: three.hit,
    tightness: three.tightness,
    weeklyInsideBar: inside0,
    doubleInsideBar: inside0 && inside1,
    doubleHammer,
    weekEndT,
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
