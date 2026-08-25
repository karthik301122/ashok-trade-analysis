import { describe, expect, it } from 'vitest'
import { detectClassic } from './classic'
import { cupAndHandleCloses, makeBars, triangleSqueezeCloses } from './testFixtures'
import { classifyCycle, classifyMood } from '../market'
import type { OhlcBar } from './types'

/** Explicit twin peaks with deep trough — bypasses soft synthetic OHLC wicks. */
function doubleTopBars(): OhlcBar[] {
  const start = 1_700_000_000
  const seq: { c: number; h: number; l: number }[] = []
  for (let i = 0; i < 40; i++) seq.push({ c: 90 + i * 0.25, h: 90 + i * 0.25 + 0.5, l: 90 + i * 0.25 - 0.5 })
  // Peak 1
  seq.push({ c: 100, h: 101, l: 99 })
  for (let i = 0; i < 5; i++) seq.push({ c: 100, h: 100.5, l: 99.5 })
  // Trough
  for (let i = 0; i < 12; i++) seq.push({ c: 94 - i * 0.2, h: 94.5 - i * 0.2, l: 93.5 - i * 0.2 })
  // Peak 2
  for (let i = 0; i < 12; i++) seq.push({ c: 92 + i * 0.7, h: 92.5 + i * 0.7, l: 91.5 + i * 0.7 })
  seq.push({ c: 100.2, h: 101.2, l: 99.5 })
  for (let i = 0; i < 5; i++) seq.push({ c: 100, h: 100.4, l: 99.6 })
  // Still above trough
  for (let i = 0; i < 8; i++) seq.push({ c: 98 - i * 0.1, h: 98.5, l: 97.5 })
  return seq.map((b, i) => ({ t: start + i * 86400, o: b.c, h: b.h, l: b.l, c: b.c, v: 1e6 }))
}

function bullFlagBars(): OhlcBar[] {
  const start = 1_700_000_000
  const closes = [
    ...Array.from({ length: 40 }, () => 70),
    ...Array.from({ length: 20 }, (_, i) => 70 + i * 2),
    ...Array.from({ length: 12 }, (_, i) => 110 - i * 0.2),
  ]
  return closes.map((c, i) => ({
    t: start + i * 86400,
    o: c,
    h: c * 1.01,
    l: c * 0.99,
    c,
    v: 1e6,
  }))
}

describe('detectClassic', () => {
  it('detects Double Top on twin peaks', () => {
    const hits = detectClassic(doubleTopBars())
    expect(hits.some((h) => h.name === 'Double Top')).toBe(true)
  })

  it('detects Bull Flag after impulse', () => {
    const hits = detectClassic(bullFlagBars())
    expect(hits.some((h) => h.name === 'Bull Flag' || h.name === 'Bull Pennant')).toBe(true)
  })

  it('detects Triangle Squeeze on contracting range', () => {
    const hits = detectClassic(makeBars(triangleSqueezeCloses()))
    expect(
      hits.some((h) =>
        [
          'Triangle Squeeze',
          'Symmetrical Triangle',
          'Ascending Triangle',
          'Descending Triangle',
        ].includes(h.name),
      ),
    ).toBe(true)
  })

  it('detects Cup & Handle on U-shape + handle', () => {
    const hits = detectClassic(makeBars(cupAndHandleCloses()))
    expect(hits.some((h) => h.name === 'Cup & Handle')).toBe(true)
  })

  it('returns empty for short series', () => {
    expect(detectClassic(makeBars([1, 2, 3, 4, 5]))).toEqual([])
  })
})

describe('classifyMood / classifyCycle', () => {
  const base = {
    d1: 0,
    w1: 0,
    m1: 1,
    m3: 2,
    m6: 3,
    y1: 5,
    y5: 10,
    from52wHigh: -2,
    above200ma: true,
    above50ma: true,
    above21ema: true,
    above20ma: true,
    rs: 55,
    spark: [100],
  }

  it('marks bullish when most votes positive', () => {
    expect(classifyMood(base, 2)).toBe('bullish')
  })

  it('marks bearish when votes negative', () => {
    expect(classifyMood({ ...base, m1: -1, m3: -2, above50ma: false }, -3)).toBe('bearish')
  })

  it('returns a cycle stage', () => {
    const stage = classifyCycle(base, 9)
    expect(['early', 'mid', 'late', 'recession']).toContain(stage)
  })
})
