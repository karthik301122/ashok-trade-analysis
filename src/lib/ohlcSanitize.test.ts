import { describe, expect, it } from 'vitest'
import { sanitizeOhlcBars } from './ohlcSanitize'

describe('sanitizeOhlcBars', () => {
  it('removes zero and outlier ticks', () => {
    const bars = [
      { t: 1, o: 170, h: 171, l: 169, c: 170, v: 100 },
      { t: 2, o: 0, h: 0, l: 0, c: 0, v: 0 },
      { t: 3, o: 171, h: 172, l: 170, c: 171, v: 120 },
      { t: 4, o: 1, h: 2, l: 0.5, c: 1, v: 10 },
      { t: 5, o: 170, h: 171, l: 169, c: 170, v: 90 },
    ]
    const out = sanitizeOhlcBars(bars)
    expect(out.map((b) => b.c)).toEqual([170, 171, 170])
  })
})
