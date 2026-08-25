import { describe, expect, it } from 'vitest'
import type { OhlcBar } from './types'
import {
  detectKarthikWeekly,
  detectThreeWeeksTight,
  isWeeklyHammer,
  isWeeklyInsideBar,
  threeWeeksTightFormationWeek,
  threeWeeksTightness,
} from './karthikWeekly'
import { completedWeeklyBars, dailyToWeeklyBars } from './weeklyBars'

function day(ts: number, o: number, h: number, l: number, c: number): OhlcBar {
  return { t: ts, o, h, l, c, v: 1_000_000 }
}

/** Build 3 weeks of daily bars (5 days each) ending at baseTs */
function threeWeekDaily(
  baseTs: number,
  weekCloses: [number, number, number],
  weekRanges: [{ h: number; l: number }, { h: number; l: number }, { h: number; l: number }],
): OhlcBar[] {
  const bars: OhlcBar[] = []
  let t = baseTs - 21 * 86400
  for (let w = 0; w < 3; w++) {
    const c = weekCloses[w]
    const { h, l } = weekRanges[w]
    for (let d = 0; d < 5; d++) {
      bars.push(day(t, c, h, l, c))
      t += 86400
    }
  }
  return bars
}

describe('threeWeeksTight', () => {
  it('computes tightness and detects ≤5%', () => {
    expect(threeWeeksTightness(100, 101, 102)).toBeCloseTo(0.02)
    expect(threeWeeksTightness(100, 106, 103)).toBeCloseTo(0.06)
    const tight = threeWeekDaily(
      1_700_000_000,
      [100, 101, 102],
      [
        { h: 102, l: 99 },
        { h: 102, l: 99 },
        { h: 102, l: 99 },
      ],
    )
    expect(detectThreeWeeksTight(tight).hit).toBe(true)
  })
})

describe('weekly inside bar', () => {
  it('detects range containment', () => {
    const w0 = day(1000, 50, 52, 48, 51)
    const w1 = day(900, 50, 55, 45, 50)
    expect(isWeeklyInsideBar([w0, w1], 0)).toBe(true)
    w0.h = 56
    expect(isWeeklyInsideBar([w0, w1], 0)).toBe(false)
  })
})

describe('detectKarthikWeekly', () => {
  it('flags double inside when two nested weeks', () => {
    const w0 = 1_700_000_000
    const daily: OhlcBar[] = [
      ...Array.from({ length: 5 }, (_, d) => day(w0 + d * 86400, 105, 108, 102, 105)),
      ...Array.from({ length: 5 }, (_, d) =>
        day(w0 - 7 * 86400 + d * 86400, 104, 110, 100, 104),
      ),
      ...Array.from({ length: 5 }, (_, d) =>
        day(w0 - 14 * 86400 + d * 86400, 100, 115, 95, 100),
      ),
    ]
    const sig = detectKarthikWeekly(daily)
    expect(sig.weeklyInsideBar).toBe(true)
    expect(sig.doubleInsideBar).toBe(true)
  })

  it('detects hammer shape on weekly bar', () => {
    const hammer = day(1000, 48, 50, 40, 49.5)
    const prior = day(900, 55, 56, 52, 53)
    expect(isWeeklyHammer([hammer, prior], 0)).toBe(true)
  })
})

describe('dailyToWeeklyBars', () => {
  it('aggregates five dailies into one week', () => {
    const daily = [
      day(100, 10, 11, 9, 10),
      day(101, 10, 12, 9.5, 11),
      day(102, 11, 12, 10, 11.5),
    ]
    const w = dailyToWeeklyBars(daily)
    expect(w).toHaveLength(1)
    expect(w[0].h).toBe(12)
    expect(w[0].l).toBe(9)
    expect(w[0].c).toBe(11.5)
  })
})

describe('threeWeeksTightFormationWeek', () => {
  it('uses market formation week, not scan day, for extended tight streaks', () => {
    const base = 1_700_000_000
    const daily: OhlcBar[] = []
    for (let w = 0; w < 7; w++) {
      const c = 100 + (w % 2) * 0.5
      for (let d = 0; d < 5; d++) {
        daily.push(day(base - w * 7 * 86400 + d * 86400, c, c + 1, c - 1, c))
      }
    }
    const nowSec = base + 86400
    const weeks = completedWeeklyBars(daily, nowSec)
    const formed = threeWeeksTightFormationWeek(weeks)
    expect(formed.hit).toBe(true)
    expect(formed.weekEndT).toBe(weeks[3]?.t)
    expect(formed.weekEndT).not.toBe(weeks[0]?.t)
  })
})
