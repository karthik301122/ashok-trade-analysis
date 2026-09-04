import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../deskSeries'
import { launchpadCheckDetails, launchpadPasses, launchpadScorePoints, launchpadScorePasses } from './launchpadDetect'

function barsFromCloses(
  closes: number[],
  spreadAt: (i: number) => number = () => 0.3,
  volume = 1_000_000,
): OhlcBar[] {
  return closes.map((c, i) => {
    const spread = spreadAt(i)
    return {
      t: 1_700_000_000 + i * 86400,
      o: c,
      h: c + spread / 2,
      l: c - spread / 2,
      c,
      v: volume,
    }
  })
}

/**
 * Build a series that satisfies the full launchpad script at the last bar:
 * long SMA200 uptrend, recent volatility/range compression, inside bars, tight 10d range.
 */
function launchpadFixture(): OhlcBar[] {
  const closes: number[] = []
  // Slow grind for SMA200 stack (~200 bars)
  for (let i = 0; i < 200; i++) closes.push(80 + (i / 200) * 20) // 80 → 100
  // Wide ATR / range windows (must cover range10[10] = bars i-19..i-10)
  for (let i = 0; i < 30; i++) closes.push(100 + i * 0.12)
  // Tight coil (last 10) with a small lift for ROC5 > 0
  for (let i = 0; i < 9; i++) closes.push(103.5)
  closes.push(103.85)

  const bars = barsFromCloses(closes, (i) => {
    if (i < 200) return 1.2
    if (i < 230) return 4.5 // wide for ATR/range "prev" windows
    return 0.3 // compressed coil
  })

  const i = bars.length - 1
  // Force last 10 bars into a tight band (< 12% of price)
  const mid = bars[i].c
  const coilHigh = mid + 0.25
  const coilLow = mid - 0.25
  for (let j = i - 9; j <= i; j++) {
    bars[j].h = coilHigh
    bars[j].l = coilLow
    bars[j].c = Math.min(Math.max(bars[j].c, coilLow + 0.05), coilHigh - 0.05)
    bars[j].o = bars[j].c
  }
  // Nest 3 inside bars in last 7
  for (const idx of [i - 3, i - 2, i - 1]) {
    const prev = bars[idx - 1]
    bars[idx].h = prev.h - 0.02
    bars[idx].l = prev.l + 0.02
    bars[idx].c = (bars[idx].h + bars[idx].l) / 2
    bars[idx].o = bars[idx].c
  }
  bars[i].c = bars[i - 1].c + 0.04
  bars[i].h = Math.max(bars[i].h, bars[i].c)
  bars[i].l = Math.min(bars[i].l, bars[i].c)
  bars[i].v = 1_200_000

  return bars
}

describe('launchpadDetect', () => {
  it('flags a compressed coil matching the source script', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    const ctx = { indexReturn5: -5, indexReturn20: -1 }
    const d = launchpadCheckDetails(bars, i, ctx)
    expect(d.atrContraction).toBe(true)
    expect(d.rangeContraction).toBe(true)
    expect(d.insideCondition).toBe(true)
    expect(d.rsCondition).toBe(true)
    expect(d.momentumCondition).toBe(true)
    expect(d.trendCondition).toBe(true)
    expect(d.pivotCondition).toBe(true)
    expect(d.volumeCondition).toBe(true)
    expect(d.tightnessCondition).toBe(true)
    expect(launchpadPasses(bars, i, ctx)).toBe(true)
  })

  it('requires ATR to contract by at least 10%', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    // Widen recent bars so ATR barely contracts
    for (let j = i - 15; j <= i; j++) {
      bars[j].h += 3
      bars[j].l -= 3
    }
    const d = launchpadCheckDetails(bars, i, { indexReturn5: -5, indexReturn20: -1 })
    expect(d.atrContraction).toBe(false)
    expect(launchpadPasses(bars, i, { indexReturn5: -5, indexReturn20: -1 })).toBe(false)
  })

  it('rejects when price is extended past resistance × 1.05', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    bars[i].c = 130
    bars[i].h = 130
    expect(launchpadPasses(bars, i, { indexReturn5: -5, indexReturn20: -1 })).toBe(false)
  })

  it('rejects when volume is too thin vs 20-day average', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    bars[i].v = 1000
    const d = launchpadCheckDetails(bars, i, { indexReturn5: -5, indexReturn20: -1 })
    expect(d.volumeCondition).toBe(false)
    expect(launchpadPasses(bars, i, { indexReturn5: -5, indexReturn20: -1 })).toBe(false)
  })

  it('rejects when SMA stack is not aligned', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    for (let j = 0; j < 180; j++) {
      bars[j].c = 120
      bars[j].o = 120
      bars[j].h = 121
      bars[j].l = 119
    }
    const d = launchpadCheckDetails(bars, i, { indexReturn5: -5, indexReturn20: -1 })
    expect(d.trendCondition).toBe(false)
  })

  it('Launchpad Score confirms at weighted score ≥ 70 without requiring volume/tightness', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    const ctx = { indexReturn5: -5, indexReturn20: -1 }
    bars[i].v = 1
    expect(launchpadPasses(bars, i, ctx)).toBe(false)
    const score = launchpadScorePoints(bars, i, ctx)
    expect(score).toBeGreaterThanOrEqual(70)
    expect(launchpadScorePasses(bars, i, ctx)).toBe(true)
  })
})
