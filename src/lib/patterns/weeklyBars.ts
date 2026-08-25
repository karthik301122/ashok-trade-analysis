import type { OhlcBar } from './types'

/** ISO week key (Mon–Sun bucket) for grouping daily bars. */
export function isoWeekKey(tsSec: number): string {
  const d = new Date(tsSec * 1000)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = utc.getUTCDay() || 7
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  return `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** Aggregate daily OHLC into weekly bars (sorted oldest → newest). */
export function dailyToWeeklyBars(daily: OhlcBar[]): OhlcBar[] {
  const map = new Map<string, OhlcBar>()
  const order: string[] = []
  for (const b of daily) {
    const key = isoWeekKey(b.t)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 })
      order.push(key)
    } else {
      prev.h = Math.max(prev.h, b.h)
      prev.l = Math.min(prev.l, b.l)
      prev.c = b.c
      prev.t = b.t
      prev.v = (prev.v || 0) + (b.v || 0)
    }
  }
  return order.map((k) => map.get(k)!)
}

/** Last N weekly bars, index 0 = most recent completed/current week. */
export function recentWeeklyCloses(weekly: OhlcBar[], n: number): number[] {
  const sorted = [...weekly].sort((a, b) => b.t - a.t)
  return sorted.slice(0, n).map((w) => w.c)
}

export function recentWeeklyBars(weekly: OhlcBar[], n: number): OhlcBar[] {
  return [...weekly].sort((a, b) => b.t - a.t).slice(0, n)
}

/**
 * Weekly bars excluding the in-progress ISO week (newest → oldest).
 * Pattern dates use the last trading day of a completed week, not “today”.
 */
export function completedWeeklyBars(daily: OhlcBar[], nowSec = Math.floor(Date.now() / 1000)): OhlcBar[] {
  const weekly = dailyToWeeklyBars(daily)
  const sorted = recentWeeklyBars(weekly, weekly.length)
  if (!sorted.length) return []
  if (isoWeekKey(sorted[0].t) === isoWeekKey(nowSec)) return sorted.slice(1)
  return sorted
}
