import { describe, expect, it } from 'vitest'
import { computeBreadth, filterUniverse, sentimentFromPct } from './breadthMath'
import type { MarketSnapshot, StockMetrics } from '../../data/types'

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

function snapshot(stocks: StockMetrics[]): MarketSnapshot {
  return {
    asOf: '2026-08-31',
    stocks,
    indexPerf: stock({ ticker: 'INDEX' }),
    loaded: stocks.length,
    failed: 0,
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
    expect(filterUniverse(stocks, 'mid')).toHaveLength(300)
    expect(filterUniverse(stocks, 'small')).toHaveLength(100)
    expect(filterUniverse(stocks, 'asx200')[0].ticker).toBe('ZZFALLBACK0')
  })
})

describe('computeBreadth server history', () => {
  const stocks = Array.from({ length: 10 }, (_, i) =>
    stock({
      ticker: `S${i}`,
      weight: 10 - i,
      spark: [98, 99, 100, 101, 102],
      d1: i % 2 === 0 ? 1 : -1,
      above20ma: i < 6,
      rsi: 40 + i * 3,
      rs: 45 + i * 2,
      relativeVolume: 1 + i * 0.2,
    }),
  )

  it('prefers ohlc chart history over short server snapshots', () => {
    const chartHistory = Array.from({ length: 15 }, (_, i) => ({
      day: `2026-08-${String(i + 1).padStart(2, '0')}`,
      above20: 30 + i,
      above50: 35 + i,
      above200: 40 + i,
      rsi50: 45,
      adNet: i % 2 === 0 ? 2 : -1,
      advancing: 6,
      declining: 4,
      near52w: 10 + i,
      rsi70: 5,
      rsi30: 15,
      rs50: 42 + i,
      rvol15: 8,
    }))
    const serverPoints = [
      {
        day: '2026-08-29',
        above20: 40,
        above50: 35,
        above200: 30,
        rsi50: 45,
        adNet: 2,
        advancing: 6,
        declining: 4,
        near52w: 10,
        rsi70: 5,
        rsi30: 15,
        rs50: 42,
        rvol15: 8,
      },
      {
        day: '2026-08-30',
        above20: 55,
        above50: 48,
        above200: 40,
        rsi50: 52,
        adNet: -1,
        advancing: 4,
        declining: 6,
        near52w: 12,
        rsi70: 8,
        rsi30: 12,
        rs50: 48,
        rvol15: 11,
      },
    ]
    const bundle = computeBreadth(snapshot(stocks), 'asx200', { serverPoints, chartHistory })
    expect(bundle.historyKind).toBe('ohlc-daily')
    expect(bundle.history.above20).toHaveLength(15)
    expect(bundle.history.above20[0]).toBe(30)
    expect(bundle.history.above20[14]).toBe(44)
    expect(bundle.history.rs50[5]).toBe(47)
  })

  it('does not flatten non-SMA series when server daily history exists', () => {
    const serverPoints = Array.from({ length: 14 }, (_, i) => ({
      day: `2026-08-${String(i + 1).padStart(2, '0')}`,
      above20: 40 + i,
      above50: 35 + i,
      above200: 30 + i,
      rsi50: 45,
      adNet: i % 2 === 0 ? 2 : -1,
      advancing: 6,
      declining: 4,
      near52w: 10 + i,
      rsi70: 5,
      rsi30: 15,
      rs50: 42 + i,
      rvol15: 8,
    }))
    const bundle = computeBreadth(snapshot(stocks), 'asx200', { serverPoints })
    expect(bundle.historyKind).toBe('server-daily')
    expect(bundle.history.above20).toHaveLength(14)
    expect(bundle.history.advances[0]).toBe(6)
    expect(bundle.history.declines[0]).toBe(4)
    expect(bundle.history.near52w[0]).toBe(10)
    expect(bundle.history.rs50[0]).toBe(42)
  })
})
