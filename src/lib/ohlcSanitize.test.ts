import { describe, expect, it } from 'vitest'
import { sanitizeOhlcBars } from './ohlcSanitize'

describe('sanitizeOhlcBars', () => {
  it('removes zero and invalid OHLC', () => {
    const bars = [
      { t: 1, o: 170, h: 171, l: 169, c: 170, v: 100 },
      { t: 2, o: 0, h: 0, l: 0, c: 0, v: 0 },
      { t: 3, o: 171, h: 172, l: 170, c: 171, v: 120 },
      { t: 4, o: 170, h: 169, l: 171, c: 170, v: 10 }, // h < l
      { t: 5, o: 170, h: 171, l: 169, c: 170, v: 90 },
    ]
    const out = sanitizeOhlcBars(bars)
    expect(out.map((b) => b.c)).toEqual([170, 171, 170])
  })

  it('keeps a sustained re-rate after long penny history (JNS-style)', () => {
    const bars = []
    for (let i = 0; i < 40; i++) {
      bars.push({ t: i, o: 0.04, h: 0.045, l: 0.035, c: 0.04, v: 1000 })
    }
    // Regime change then new plateau — must not truncate at the jump.
    bars.push({ t: 40, o: 0.15, h: 0.18, l: 0.14, c: 0.15, v: 5000 })
    bars.push({ t: 41, o: 0.2, h: 0.31, l: 0.2, c: 0.295, v: 1e6 })
    bars.push({ t: 42, o: 0.3, h: 0.35, l: 0.28, c: 0.32, v: 2e5 })
    bars.push({ t: 43, o: 0.55, h: 0.66, l: 0.5, c: 0.65, v: 3e5 })
    const out = sanitizeOhlcBars(bars)
    expect(out.at(-1)?.c).toBe(0.65)
    expect(out.length).toBe(bars.length)
  })

  it('drops an isolated 100x spike tick', () => {
    const bars = [
      { t: 1, o: 1, h: 1.1, l: 0.9, c: 1, v: 100 },
      { t: 2, o: 1, h: 1.05, l: 0.95, c: 1, v: 100 },
      { t: 3, o: 100, h: 110, l: 90, c: 100, v: 1 },
      { t: 4, o: 1.02, h: 1.05, l: 1, c: 1.01, v: 100 },
      { t: 5, o: 1.01, h: 1.04, l: 1, c: 1.02, v: 100 },
    ]
    const out = sanitizeOhlcBars(bars)
    expect(out.map((b) => b.c)).toEqual([1, 1, 1.01, 1.02])
  })
})
