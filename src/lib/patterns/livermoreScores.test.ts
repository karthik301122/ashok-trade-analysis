import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../deskSeries'
import { computeLivermoreScores, atr, adx } from './livermoreScores'

function synthBars(days: number, start = 100, drift = 0.1): OhlcBar[] {
  const t0 = 1_700_000_000
  const bars: OhlcBar[] = []
  let c = start
  for (let i = 0; i < days; i++) {
    const o = c
    c += drift + (i % 5 === 0 ? 0.3 : 0)
    const h = Math.max(o, c) + 0.5
    const l = Math.min(o, c) - 0.5
    bars.push({
      t: t0 + i * 86400,
      o,
      h,
      l,
      c,
      v: 1_000_000 + (i % 3 === 0 ? 800_000 : 0),
    })
  }
  return bars
}

describe('livermoreScores', () => {
  it('computes ATR and ADX on sufficient bars', () => {
    const bars = synthBars(80)
    expect(atr(bars, 14)).toBeGreaterThan(0)
    expect(adx(bars, 14)).toBeGreaterThan(0)
  })

  it('returns scores with final tier', () => {
    const bars = synthBars(90, 50, 0.15)
    const scores = computeLivermoreScores(bars, {
      indexReturn20: 0,
      from52wHigh: -5,
      relativeVolume: 2,
      rsRating: 75,
    })
    expect(scores).not.toBeNull()
    expect(scores!.finalScore).toBeGreaterThan(0)
    expect(['elite', 'strong', 'emerging', 'ignore']).toContain(scores!.tier)
  })

  it('detects liquidity grab on false break bar', () => {
    const bars = synthBars(70, 20, 0.05)
    const last = bars[bars.length - 1]
    bars[bars.length - 1] = {
      ...last,
      l: last.l - 3,
      c: last.o + 0.5,
      h: last.h,
      v: last.v * 3,
    }
    const scores = computeLivermoreScores(bars, {
      indexReturn20: -2,
      from52wHigh: -8,
      relativeVolume: 2.5,
      rsRating: 60,
    })
    expect(scores).not.toBeNull()
    expect(scores!.wickRatio).toBeGreaterThan(0.3)
  })
})
