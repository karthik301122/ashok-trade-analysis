import { describe, expect, it } from 'vitest'
import type { StockMetrics } from '../../data/types'
import { evaluateSpecialPattern, scanSpecialPattern } from './specialDetect'
import { specialPatternById } from './specialCatalog'

function stock(partial: Partial<StockMetrics> & { ticker: string }): StockMetrics {
  return {
    name: partial.ticker,
    sector: 'Test',
    industry: 'Test',
    weight: 1,
    d1: 0,
    w1: 0,
    m1: 0,
    m3: 0,
    m6: 0,
    y1: 0,
    y5: 0,
    from52wHigh: -5,
    above200ma: false,
    above50ma: false,
    above21ema: false,
    above20ma: false,
    rs: 50,
    spark: [100],
    mood: 'neutral',
    cycle: 'mid',
    vsSector: { w1: false, m1: false, m3: false },
    vsIndex: { w1: false, m1: false, m3: false },
    star: false,
    score: 0,
    volume: 0,
    avgVolume20: 0,
    relativeVolume: 1,
    dollarVolume: 0,
    lastPrice: 0,
    rsi: 50,
    ...partial,
  }
}

describe('specialDetect', () => {
  const ctx = { indexM3: 4, dollarVolP90: 1_000_000 }

  it('matches RS leader formula', () => {
    expect(evaluateSpecialPattern('rs-leader', stock({ ticker: 'A', rs: 75 }), ctx)).toBe(true)
    expect(evaluateSpecialPattern('rs-leader', stock({ ticker: 'B', rs: 65 }), ctx)).toBe(false)
  })

  it('matches volume surge formula', () => {
    const hit = stock({ ticker: 'V', relativeVolume: 2.5, m1: 3, above20ma: true })
    expect(evaluateSpecialPattern('volume-surge-long', hit, ctx)).toBe(true)
  })

  it('scanSpecialPattern returns score-ranked hits with scores', () => {
    const pattern = specialPatternById('star-3m')!
    const hits = scanSpecialPattern(
      pattern,
      [
        stock({ ticker: 'A', star: true, m3: 10 }),
        stock({ ticker: 'B', star: false, m3: 12, rs: 55 }),
        stock({ ticker: 'C', star: true, m3: 15 }),
      ],
      ctx,
    )
    expect(hits.map((h) => h.ticker)).toEqual(['A', 'C'])
    expect(hits.every((h) => h.score === 100 && h.confirmed)).toBe(true)
    // Forming RS leader (not confirmed) ranks below confirmed stars when mixed patterns aren't used;
    // rs-leader forming at 60+ can appear for B:
    const rsHits = scanSpecialPattern(specialPatternById('rs-leader')!, [
      stock({ ticker: 'X', rs: 75 }),
      stock({ ticker: 'Y', rs: 60 }),
      stock({ ticker: 'Z', rs: 40 }),
    ], ctx)
    expect(rsHits.map((h) => h.ticker)).toEqual(['X', 'Y'])
    expect(rsHits[0].score).toBe(100)
    expect(rsHits[0].confirmed).toBe(true)
    expect(rsHits[1].score).toBeGreaterThanOrEqual(60)
    expect(rsHits[1].confirmed).toBe(false)
  })
})
