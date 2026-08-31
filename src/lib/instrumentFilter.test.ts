import { describe, expect, it } from 'vitest'
import type { MarketSnapshot, StockMetrics } from '../data/types'
import {
  applyStocksOnlyFilter,
  filterCommonStocks,
  isCommonStock,
  rebuildSnapshotFromStocks,
} from './instrumentFilter'

function stubStock(ticker: string, instrumentType?: string): StockMetrics {
  return {
    ticker,
    name: ticker,
    sector: 'Finance',
    industry: 'Banks',
    weight: 1,
    instrumentType,
    d1: 0,
    w1: 0,
    m1: 1,
    m3: 2,
    m6: 3,
    y1: 4,
    y5: 5,
    from52wHigh: -3,
    above200ma: true,
    above50ma: true,
    above21ema: true,
    above20ma: true,
    rs: 55,
    spark: [100, 101],
    mood: 'bullish',
    cycle: 'mid',
    vsSector: { w1: false, m1: false, m3: false },
    vsIndex: { w1: true, m1: true, m3: true },
    star: true,
    score: 55,
    volume: 1000,
    avgVolume20: 900,
    relativeVolume: 1.1,
    dollarVolume: 50000,
    lastPrice: 50,
    rsi: 55,
  }
}

const baseSnapshot: MarketSnapshot = {
  asOf: '1 Jan 2026',
  benchmark: 'ASX200',
  benchmarkPerf: stubStock('INDEX'),
  sectors: [],
  industries: [],
  stocks: [
    stubStock('CBA', 'Common Stock'),
    stubStock('VAS', 'ETF'),
    stubStock('LEG', undefined),
  ],
  moodCounts: { bullish: 1, neutral: 0, bearish: 0 },
}

describe('instrumentFilter', () => {
  it('isCommonStock', () => {
    expect(isCommonStock({ instrumentType: 'Common Stock' })).toBe(true)
    expect(isCommonStock({ instrumentType: 'ETF' })).toBe(false)
    expect(isCommonStock({})).toBe(true)
  })

  it('filterCommonStocks', () => {
    expect(filterCommonStocks(baseSnapshot.stocks).map((s) => s.ticker)).toEqual(['CBA', 'LEG'])
  })

  it('applyStocksOnlyFilter rebuilds tree', () => {
    const filtered = applyStocksOnlyFilter(baseSnapshot, true)
    expect(filtered.stocks.length).toBe(2)
    expect(filtered.industries.length).toBe(1)
    expect(filtered.industries[0].stocks.length).toBe(2)
    expect(filtered.moodCounts.bullish).toBe(1)
  })

  it('applyStocksOnlyFilter returns same snapshot when off', () => {
    expect(applyStocksOnlyFilter(baseSnapshot, false)).toBe(baseSnapshot)
  })

  it('rebuildSnapshotFromStocks preserves benchmark', () => {
    const rebuilt = rebuildSnapshotFromStocks(baseSnapshot, filterCommonStocks(baseSnapshot.stocks))
    expect(rebuilt.benchmarkPerf).toBe(baseSnapshot.benchmarkPerf)
    expect(rebuilt.asOf).toBe(baseSnapshot.asOf)
  })
})
