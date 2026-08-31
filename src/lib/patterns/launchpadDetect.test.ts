import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../yahoo'
import { launchpadPasses } from './launchpadDetect'

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

/** Coil under resistance with improving 5d vs 20d returns. */
function launchpadFixture(): OhlcBar[] {
  const closes: number[] = []
  for (let i = 0; i < 60; i++) closes.push(100 + (i / 60) * 2)
  for (let i = 0; i < 10; i++) closes.push(102)
  for (let i = 0; i < 4; i++) closes.push(102)
  closes.push(101.7) // 5d-ago anchor (RS(5) > RS(20))
  closes.push(102)
  closes.push(102)
  closes.push(101.5)
  closes.push(102.2)
  closes.push(102.35)

  const bars = barsFromCloses(closes, (i) => {
    if (i >= 60 && i < 70) return 3.5
    if (i >= 70) return 0.25
    return 2.0
  })
  // Two inside bars in the last 5 sessions
  const i = bars.length - 1
  for (const idx of [i - 2, i - 1]) {
    const prev = bars[idx - 1]
    bars[idx].h = Math.min(bars[idx].h, prev.h)
    bars[idx].l = Math.max(bars[idx].l, prev.l)
  }
  return bars
}

describe('launchpadDetect', () => {
  it('flags a compressed coil under resistance', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    expect(launchpadPasses(bars, i)).toBe(true)
  })

  it('rejects when ATR is not contracting', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    for (let j = i - 25; j <= i; j++) {
      bars[j].h += 2
      bars[j].l -= 2
    }
    expect(launchpadPasses(bars, i)).toBe(false)
  })

  it('rejects when price is extended past resistance', () => {
    const bars = launchpadFixture()
    const i = bars.length - 1
    bars[i].c = 110
    bars[i].h = 110
    expect(launchpadPasses(bars, i)).toBe(false)
  })
})
