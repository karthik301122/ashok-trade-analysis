import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../deskSeries'
import { landscapeCheckDetails, landscapePasses } from './landscapeDetect'

function barsFromCloses(
  closes: number[],
  spreadAt: (i: number) => number = () => 0.3,
): OhlcBar[] {
  return closes.map((c, i) => {
    const spread = spreadAt(i)
    return {
      t: 1_700_000_000 + i * 86400,
      o: c,
      h: c + spread / 2,
      l: c - spread / 2,
      c,
      v: 1_000_000,
    }
  })
}

function indexBarsForLandscape(stockBars: OhlcBar[]): OhlcBar[] {
  const last = stockBars.length - 1
  return stockBars.map((b, idx) => {
    const age = last - idx
    // Index was higher ~20d ago than ~5d ago so RS5 > RS20 × 1.03 with flat stock close.
    let c = 100
    if (age >= 20) c = 110
    else if (age >= 5) c = 102
    return {
      t: b.t,
      o: c,
      h: c + 0.5,
      l: c - 0.5,
      c,
      v: 1_000_000,
    }
  })
}

function landscapeFixture(): OhlcBar[] {
  const closes: number[] = []
  for (let i = 0; i < 55; i++) closes.push(98 + (i / 55) * 4)
  for (let i = 0; i < 8; i++) closes.push(102.8)
  closes.push(102.95)
  closes.push(103.05)
  closes.push(103.1)
  closes.push(103.12)
  closes.push(103.15)

  const bars = barsFromCloses(closes, (i) => {
    if (i >= 40 && i < 55) return 4.0
    if (i >= 55 && i < 63) return 2.5
    if (i >= 63) return 0.15
    return 1.2
  })
  const i = bars.length - 1
  bars[i].h = 103.25
  for (const idx of [i - 2, i - 1]) {
    const prev = bars[idx - 1]
    bars[idx].h = Math.min(bars[idx].h, prev.h)
    bars[idx].l = Math.max(bars[idx].l, prev.l)
  }
  return bars
}

describe('landscapeDetect', () => {
  it('flags near quarter high with compression and rising SMA', () => {
    const bars = landscapeFixture()
    const i = bars.length - 1
    const ctx = { indexBars: indexBarsForLandscape(bars) }
    const d = landscapeCheckDetails(bars, i, ctx)
    expect(d, JSON.stringify(d)).toMatchObject({
      nearQuarterHigh: true,
      atrContraction: true,
      rangeContraction: true,
      insideCondition: true,
      momentumCondition: true,
      rsCondition: true,
      ma20Rising: true,
      underResistance: true,
    })
    expect(landscapePasses(bars, i, ctx)).toBe(true)
  })

  it('uses close/indexClose RS ratio not return delta', () => {
    const bars = landscapeFixture()
    const i = bars.length - 1
    const ctx = { indexBars: indexBarsForLandscape(bars) }
    const d = landscapeCheckDetails(bars, i, ctx)
    expect(d.rs20).toBeGreaterThan(0)
    expect(d.rs5).toBeGreaterThan(d.rs20! * 1.03)
    expect(d.rsCondition).toBe(true)
  })

  it('rejects when too far from quarter high', () => {
    const bars = landscapeFixture()
    const i = bars.length - 1
    bars[i].c = 98
    bars[i].l = 97.5
    const ctx = { indexBars: indexBarsForLandscape(bars) }
    expect(landscapePasses(bars, i, ctx)).toBe(false)
  })

  it('rejects when ROC(60) is extended', () => {
    const bars = landscapeFixture()
    const i = bars.length - 1
    bars[i - 60].c = 80
    const ctx = { indexBars: indexBarsForLandscape(bars) }
    expect(landscapePasses(bars, i, ctx)).toBe(false)
  })
})
