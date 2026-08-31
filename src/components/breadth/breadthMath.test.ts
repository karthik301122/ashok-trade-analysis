import { describe, expect, it } from 'vitest'
import { filterUniverse, sentimentFromPct } from './breadthMath'
import type { StockMetrics } from '../../data/types'

function stock(partial: Partial<StockMetrics> & { ticker: string }): StockMetrics {
  return {
    name: partial.ticker,
    sector: 'Test',
    industry: 'Test',
    weight: partial.weight ?? 1,
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

describe('sentimentFromPct', () => {
  it('maps thresholds', () => {
    expect(sentimentFromPct(70)).toBe('bullish')
    expect(sentimentFromPct(50)).toBe('neutral')
    expect(sentimentFromPct(35)).toBe('weak')
    expect(sentimentFromPct(10)).toBe('bearish')
  })
})

describe('filterUniverse', () => {
  it('uses weight-rank slices when tickers are not in membership', () => {
    const stocks = Array.from({ length: 600 }, (_, i) =>
      stock({ ticker: `ZZFALLBACK${i}`, weight: 600 - i }),
    )
    expect(filterUniverse(stocks, 'asx200')).toHaveLength(200)
    expect(filterUniverse(stocks, 'asx500')).toHaveLength(500)
    expect(filterUniverse(stocks, 'mid')).toHaveLength(300)
    expect(filterUniverse(stocks, 'small')).toHaveLength(100)
    expect(filterUniverse(stocks, 'asx200')[0].ticker).toBe('ZZFALLBACK0')
  })
})
