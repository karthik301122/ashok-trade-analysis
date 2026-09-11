import { describe, expect, it } from 'vitest'
import type { OhlcBar } from './patterns/types'
import { computeSectorRs, computeWeeklySr } from './indexAnalysisMath'

function bar(t: number, o: number, h: number, l: number, c: number): OhlcBar {
  return { t, o, h, l, c, v: 0 }
}

/** Newest-first weekly bars: week 0 is latest. */
function makeWeeks(n: number, closeFn: (i: number) => number, range = 2): OhlcBar[] {
  const out: OhlcBar[] = []
  for (let i = 0; i < n; i++) {
    const c = closeFn(i)
    out.push(bar(1_700_000_000 - i * 7 * 86400, c - 1, c + range, c - range, c))
  }
  return out
}

describe('computeWeeklySr', () => {
  it('flags approaching support within 3%', () => {
    // Latest close near the 20-week low
    const weeks = makeWeeks(20, (i) => (i === 0 ? 96 : 100 + i * 0.5))
    weeks[5] = bar(weeks[5].t, 95, 96, 94, 95) // inject low support
    const sr = computeWeeklySr(weeks)
    expect(sr).not.toBeNull()
    expect(sr!.support20).toBe(94)
    // DistSupport = 100 * (96 - 94) / 94 ≈ 2.13%
    expect(sr!.nearSupport).toBe(true)
    expect(sr!.srStatus).toBe('Approaching Support')
  })

  it('returns null without 20 weeks', () => {
    expect(computeWeeklySr(makeWeeks(10, () => 100))).toBeNull()
  })
})

describe('computeSectorRs', () => {
  it('scores sector outperformance vs XJO', () => {
    // Sector up strongly vs flat XJO over 20 weeks
    const sector = makeWeeks(30, (i) => 200 - i) // rising into present (newest=200)
    const xjo = makeWeeks(30, () => 100)
    const rs = computeSectorRs(sector, xjo)
    expect(rs).not.toBeNull()
    expect(rs!.rs).toBeGreaterThan(100)
    expect(rs!.sectorScore).toBeCloseTo(rs!.rs * 0.7 + rs!.rsMom * 0.3, 5)
  })
})
