import type { OhlcBar } from './types'
import { hasKarthikSpecialContext, isStage2Weekly } from './stage2Weekly'
import { completedWeeklyBars } from './weeklyBars'

/** Max close spread / min across a tight window — Karthik: 3%. */
export const THREE_WEEKS_TIGHT_THRESHOLD = 0.03

export const TIGHT_WEEK_COUNTS = [3, 4, 5] as const

export type KarthikWeeklySignals = {
  threeWeeksTight: boolean
  tightness: number | null
  weeklyInsideBar: boolean
  doubleInsideBar: boolean
  doubleHammer: boolean
  /** Start of pattern (oldest week in the setup) — show this in UI */
  weekStartT: number | null
  /** End of pattern (newest week) */
  weekEndT: number | null
  stage2: boolean
  contextOk: boolean
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

/** Baby range must be &lt; 50% of mother (more than 50% compressed). */
export function isRangeCompressed50(baby: OhlcBar, mother: OhlcBar): boolean {
  return range(baby) < 0.5 * range(mother)
}

export function isVolumeContracted(baby: OhlcBar, mother: OhlcBar): boolean {
  const bv = baby.v ?? 0
  const mv = mother.v ?? 0
  if (mv <= 0) return bv <= 0
  return bv < mv
}

/**
 * Weekly inside bar (Karthik):
 * containment + &gt;50% range compression + volume contraction.
 */
export function isWeeklyInsideBar(weeks: OhlcBar[], i: number): boolean {
  if (i + 1 >= weeks.length) return false
  const baby = weeks[i]
  const mother = weeks[i + 1]
  if (!(baby.h <= mother.h && baby.l >= mother.l)) return false
  if (!isRangeCompressed50(baby, mother)) return false
  if (!isVolumeContracted(baby, mother)) return false
  return true
}

export function closeTightness(closes: number[]): number {
  if (!closes.length) return Infinity
  const hi = Math.max(...closes)
  const lo = Math.min(...closes)
  if (lo <= 0) return Infinity
  return (hi - lo) / lo
}

export function threeWeeksTightness(c1: number, c2: number, c3: number): number {
  return closeTightness([c1, c2, c3])
}

export function weeksTightAt(
  weeks: OhlcBar[],
  i: number,
  n: number,
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
): boolean {
  if (n < 3 || i + n > weeks.length) return false
  const closes = []
  for (let k = 0; k < n; k++) closes.push(weeks[i + k].c)
  return closeTightness(closes) <= threshold
}

export function threeWeeksTightAt(
  weeks: OhlcBar[],
  i: number,
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
): boolean {
  return weeksTightAt(weeks, i, 3, threshold)
}

/**
 * Prefer longest window 5→3 from week 0 within threshold.
 * weekStartT = oldest week; weekEndT = newest.
 */
export function threeWeeksTightFormationWeek(
  weeks: OhlcBar[],
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
): {
  hit: boolean
  tightness: number | null
  weekStartT: number | null
  weekEndT: number | null
  weekCount: number | null
} {
  if (weeks.length < 3) {
    return { hit: false, tightness: null, weekStartT: null, weekEndT: null, weekCount: null }
  }
  for (const n of [5, 4, 3] as const) {
    if (weeksTightAt(weeks, 0, n, threshold)) {
      const closes = Array.from({ length: n }, (_, k) => weeks[k].c)
      return {
        hit: true,
        tightness: closeTightness(closes),
        weekStartT: weeks[n - 1]?.t ?? null,
        weekEndT: weeks[0]?.t ?? null,
        weekCount: n,
      }
    }
  }
  return { hit: false, tightness: null, weekStartT: null, weekEndT: null, weekCount: null }
}

export function detectThreeWeeksTight(
  daily: OhlcBar[],
  threshold = THREE_WEEKS_TIGHT_THRESHOLD,
  nowSec?: number,
): {
  hit: boolean
  tightness: number | null
  weekStartT: number | null
  weekEndT: number | null
} {
  const weeks = completedWeeklyBars(daily, nowSec)
  if (!hasKarthikSpecialContext(weeks, 0)) {
    return { hit: false, tightness: null, weekStartT: null, weekEndT: null }
  }
  const formed = threeWeeksTightFormationWeek(weeks, threshold)
  return {
    hit: formed.hit,
    tightness: formed.tightness,
    weekStartT: formed.weekStartT,
    weekEndT: formed.weekEndT,
  }
}

export function detectKarthikWeekly(daily: OhlcBar[], nowSec?: number): KarthikWeeklySignals {
  const weeks = completedWeeklyBars(daily, nowSec)
  const empty: KarthikWeeklySignals = {
    threeWeeksTight: false,
    tightness: null,
    weeklyInsideBar: false,
    doubleInsideBar: false,
    doubleHammer: false,
    weekStartT: null,
    weekEndT: null,
    stage2: false,
    contextOk: false,
  }
  if (weeks.length < 3) return empty

  const contextOk = hasKarthikSpecialContext(weeks, 0)
  const stage2 = isStage2Weekly(weeks, 0)

  const three = contextOk
    ? threeWeeksTightFormationWeek(weeks)
    : { hit: false, tightness: null, weekStartT: null, weekEndT: null, weekCount: null }

  const inside0 = contextOk && isWeeklyInsideBar(weeks, 0)
  const inside1 = contextOk && weeks.length >= 3 && isWeeklyInsideBar(weeks, 1)
  const doubleHammer =
    contextOk && weeks.length >= 3 && isWeeklyHammer(weeks, 0) && isWeeklyHammer(weeks, 1)

  let weekStartT: number | null = null
  let weekEndT: number | null = null
  if (three.hit) {
    weekStartT = three.weekStartT
    weekEndT = three.weekEndT
  } else if (inside0 && inside1) {
    weekStartT = weeks[2]?.t ?? weeks[1]?.t ?? null
    weekEndT = weeks[0]?.t ?? null
  } else if (inside0) {
    weekStartT = weeks[1]?.t ?? null
    weekEndT = weeks[0]?.t ?? null
  } else if (doubleHammer) {
    weekStartT = weeks[1]?.t ?? null
    weekEndT = weeks[0]?.t ?? null
  } else if (stage2) {
    weekStartT = weeks[0]?.t ?? null
    weekEndT = weeks[0]?.t ?? null
  }

  return {
    threeWeeksTight: Boolean(three.hit),
    tightness: three.tightness,
    weeklyInsideBar: inside0,
    doubleInsideBar: inside0 && inside1,
    doubleHammer,
    weekStartT,
    weekEndT,
    stage2,
    contextOk,
  }
}

export type KarthikPatternId =
  | 'stage-2'
  | 'three-weeks-tight'
  | 'weekly-inside-bar'
  | 'double-inside-bar'
  | 'double-hammer'

export function karthikPatternHit(
  daily: OhlcBar[],
  patternId: KarthikPatternId,
): {
  hit: boolean
  tightness: number | null
  weekStartT: number | null
  weekEndT: number | null
} {
  const sig = detectKarthikWeekly(daily)
  const base = {
    tightness: null as number | null,
    weekStartT: sig.weekStartT,
    weekEndT: sig.weekEndT,
  }
  switch (patternId) {
    case 'stage-2':
      return {
        hit: sig.stage2,
        tightness: null,
        weekStartT: sig.stage2 ? sig.weekEndT : null,
        weekEndT: sig.stage2 ? sig.weekEndT : null,
      }
    case 'three-weeks-tight':
      return {
        hit: sig.threeWeeksTight,
        tightness: sig.tightness,
        weekStartT: sig.weekStartT,
        weekEndT: sig.weekEndT,
      }
    case 'weekly-inside-bar':
      return { hit: sig.weeklyInsideBar, ...base }
    case 'double-inside-bar':
      return { hit: sig.doubleInsideBar, ...base }
    case 'double-hammer':
      return { hit: sig.doubleHammer, ...base }
    default:
      return { hit: false, tightness: null, weekStartT: null, weekEndT: null }
  }
}
