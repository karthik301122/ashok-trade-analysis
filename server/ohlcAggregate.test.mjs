import { describe, it, expect } from 'vitest'
import {
  aggregateOhlcBars,
  eodhdAggregateMinutes,
  eodhdSourceInterval,
} from './ohlcAggregate.mjs'

describe('ohlcAggregate', () => {
  it('maps EODHD source intervals', () => {
    expect(eodhdSourceInterval('30m')).toBe('5m')
    expect(eodhdSourceInterval('15m')).toBe('5m')
    expect(eodhdSourceInterval('1h')).toBe('1h')
    expect(eodhdAggregateMinutes('30m')).toBe(30)
    expect(eodhdAggregateMinutes('5m')).toBeNull()
  })

  it('aggregates 5m bars into 30m candles', () => {
    const period = 30 * 60
    const base = Math.floor(1_700_000_000 / period) * period
    const bars = []
    for (let i = 0; i < 12; i++) {
      const t = base + i * 300
      bars.push({ t, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 10 })
    }
    const out = aggregateOhlcBars(bars, 30)
    expect(out.length).toBe(2)
    expect(out[0].o).toBe(100)
    expect(out[0].c).toBe(100.5 + 5)
    expect(out[0].h).toBe(101 + 5)
    expect(out[0].l).toBe(99)
    expect(out[0].v).toBe(60)
    expect(out[1].o).toBe(106)
  })
})
