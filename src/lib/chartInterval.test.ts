import { describe, expect, it } from 'vitest'
import {
  chartIntervalForWindow,
  intradayFetchRange,
  parseChartIntervalPref,
  resolveChartInterval,
  tradingViewIntervalForPref,
} from './chartInterval'

describe('chartInterval', () => {
  const asOf = 1_700_000_000

  it('parses chart interval pref and migrates legacy intraday flag', () => {
    expect(parseChartIntervalPref('30m')).toBe('30m')
    expect(parseChartIntervalPref(undefined, false)).toBe('1d')
    expect(parseChartIntervalPref(undefined, true)).toBe('auto')
    expect(parseChartIntervalPref(undefined)).toBe('auto')
  })

  it('uses 30m for short windows on Yahoo', () => {
    expect(chartIntervalForWindow('1m', 'yahoo-finance2')).toBe('30m')
    expect(chartIntervalForWindow('1w', 'yahoo-finance2')).toBe('30m')
  })

  it('uses 5m for short windows on EODHD', () => {
    expect(chartIntervalForWindow('1m', 'eodhd')).toBe('5m')
  })

  it('uses 1h for long windows', () => {
    expect(chartIntervalForWindow('3m', 'eodhd')).toBe('1h')
    expect(resolveChartInterval('auto', 'all', 'yahoo-finance2')).toBe('1h')
  })

  it('resolveChartInterval respects explicit daily', () => {
    expect(resolveChartInterval('1d', '1m', 'eodhd')).toBe('1d')
    expect(resolveChartInterval('30m', '1m', 'eodhd')).toBe('30m')
  })

  it('intradayFetchRange spans window with padding', () => {
    const { fromTs, toTs } = intradayFetchRange('1m', asOf)
    expect(toTs).toBe(asOf + 86_400)
    expect(fromTs).toBeLessThan(asOf)
  })

  it('maps desk intervals to TradingView widget codes', () => {
    expect(tradingViewIntervalForPref('30m', '1m')).toBe('30')
    expect(tradingViewIntervalForPref('auto', '1m', 'eodhd')).toBe('5')
    expect(tradingViewIntervalForPref('1d', '1m')).toBe('D')
  })
})
