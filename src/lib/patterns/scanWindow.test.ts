import { describe, expect, it } from 'vitest'
import type { PatternHit } from './types'
import { filterBarsByWindow, filterHitsByWindow, hitInWindow, windowStartTs } from './scanWindow'

function hit(endT: number): PatternHit {
  return {
    id: `h-${endT}`,
    category: 'classic',
    name: 'Test',
    bias: 'bullish',
    startT: endT - 86400,
    endT,
    confidence: 0.7,
  }
}

describe('scanWindow', () => {
  const asOf = 1_700_000_000

  it('1d window accepts only very recent hits', () => {
    const start = windowStartTs('1d', asOf)!
    expect(hitInWindow(hit(asOf), '1d', asOf)).toBe(true)
    expect(hitInWindow(hit(start), '1d', asOf)).toBe(true)
    expect(hitInWindow(hit(start - 86400), '1d', asOf)).toBe(false)
  })

  it('all window keeps every hit', () => {
    const hits = [hit(asOf - 86400 * 400), hit(asOf)]
    expect(filterHitsByWindow(hits, 'all', asOf)).toHaveLength(2)
  })

  it('1m window filters older hits', () => {
    const hits = [hit(asOf - 86400 * 60), hit(asOf - 86400 * 10), hit(asOf)]
    const filtered = filterHitsByWindow(hits, '1m', asOf)
    expect(filtered.map((h) => h.endT)).toEqual([asOf - 86400 * 10, asOf])
  })

  it('filterBarsByWindow keeps only bars in the window', () => {
    const bars = Array.from({ length: 100 }, (_, i) => ({
      t: asOf - (99 - i) * 86400,
    }))
    const month = filterBarsByWindow(bars, '1m')
    expect(month.length).toBeLessThan(bars.length)
    expect(month.at(-1)?.t).toBe(asOf)
    expect(month[0].t).toBeGreaterThanOrEqual(windowStartTs('1m', asOf)!)
    expect(filterBarsByWindow(bars, 'all')).toHaveLength(100)
  })
})
