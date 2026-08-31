import { describe, expect, it } from 'vitest'
import type { StockMetrics } from '../../data/types'
import { buildSpecialScanContext } from './specialDetect'
import { snapshotAlertScore } from './patternAlertScores'

function stock(partial: Partial<StockMetrics> = {}): StockMetrics {
  return {
    ticker: 'ABC',
    name: 'ABC Ltd',
    sector: 'Tech',
    industry: 'Software',
    price: 10,
    m1: 2,
    m3: 10,
    rs: 75,
    relativeVolume: 2,
    from52wHigh: -2,
    above20ma: true,
    above50ma: true,
    above200ma: true,
    star: false,
    cycle: 'mid',
    dollarVolume: 1e6,
    rsi: 55,
    ...partial,
  }
}

describe('snapshotAlertScore', () => {
  it('returns 100 when pattern is confirmed', () => {
    const s = stock({ star: true })
    const ctx = buildSpecialScanContext([s], 0)
    const r = snapshotAlertScore('star-3m', s, ctx)
    expect(r.confirmed).toBe(true)
    expect(r.score).toBe(100)
  })

  it('returns partial score when forming', () => {
    const s = stock({ rs: 55, star: false })
    const ctx = buildSpecialScanContext([s], 0)
    const r = snapshotAlertScore('rs-leader', s, ctx)
    expect(r.confirmed).toBe(false)
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThan(100)
  })
})
