import { describe, expect, it } from 'vitest'
import {
  allDeskIndicatorSet,
  DESK_INDICATORS,
  emaIndicatorSeries,
  seriesDataForKey,
  smaIndicatorSeries,
} from './chartIndicators'

function bars(closes: number[], startT = 1700000000) {
  return closes.map((c, i) => ({
    t: startT + i * 86400,
    o: c - 0.5,
    h: c + 1,
    l: c - 1,
    c,
    v: 1e6 + i * 1000,
  }))
}

describe('chartIndicators', () => {
  it('lists full indicator catalog', () => {
    expect(DESK_INDICATORS.length).toBeGreaterThanOrEqual(15)
    expect(allDeskIndicatorSet().size).toBe(DESK_INDICATORS.length)
  })

  it('builds SMA series', () => {
    const series = bars([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25])
    const sma = smaIndicatorSeries(series, 5)
    expect(sma.length).toBe(12)
    expect(sma[0].value).toBe(12)
  })

  it('builds composite indicators', () => {
    const series = bars(Array.from({ length: 80 }, (_, i) => 10 + i * 0.15))
    expect(seriesDataForKey('rsi', series).length).toBeGreaterThan(50)
    expect(seriesDataForKey('macd_line', series).length).toBeGreaterThan(20)
    expect(seriesDataForKey('bb_upper', series).length).toBeGreaterThan(20)
    expect(seriesDataForKey('adx', series).length).toBeGreaterThan(10)
    expect(seriesDataForKey('vwap', series).length).toBeGreaterThan(10)
  })

  it('builds EMA series', () => {
    const series = bars(Array.from({ length: 25 }, (_, i) => 10 + i))
    const ema = emaIndicatorSeries(series, 21)
    expect(ema.length).toBeGreaterThan(0)
  })
})
