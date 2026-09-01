import { describe, expect, it } from 'vitest'
import {
  buildDiffusionSeries,
  currentDiffusionValue,
  diffusionReferenceLevels,
} from './diffusionIndicators'
import type { BreadthBundle } from './breadthMath'

function bundle(partial: Partial<BreadthBundle> = {}): BreadthBundle {
  return {
    stocks: [],
    gauges: [],
    overall: 'neutral',
    advancing: 0,
    declining: 0,
    unchanged: 0,
    adNet: 0,
    adHistory: [],
    pctAbove20: 46,
    pctAbove50: 40,
    pctAbove200: 35,
    pctRsi50: 50,
    pctRsi60: 0,
    pctRsi70: 10,
    pctNear52w: 20,
    pctRs50: 45,
    pctRs70: 0,
    avgRs: 50,
    pctRvol15: 15,
    pctRvol20: 0,
    pctRvol30: 0,
    avgRvol: 1,
    smaRows: [],
    rsiRows: [],
    rsVolRows: [],
    history: {
      dates: [],
      advances: [],
      declines: [],
      above20: [],
      above50: [],
      above200: [],
      thrust: [],
      thrustMa: [],
      near52w: [],
      rsiOb: [],
      rsiOs: [],
      rsiNeutral: [],
      rs50: [],
      rvol15: [],
    },
    dailyHistory: [
      { day: '2025-06-01', above20: 40, above50: 38, above200: 30, rsi50: 45, adNet: 5 },
      { day: '2025-06-02', above20: 46, above50: 41, above200: 32, rsi50: 48, adNet: 8 },
    ],
    historyKind: 'ohlc-daily',
    ...partial,
  }
}

describe('diffusionIndicators', () => {
  it('builds SMA series from daily history', () => {
    const series = buildDiffusionSeries(bundle(), 'sma-20')
    expect(series).toHaveLength(2)
    expect(series[1].value).toBe(46)
  })

  it('reads current SMA value from bundle', () => {
    expect(currentDiffusionValue(bundle(), 'sma-20')).toBe(46)
  })

  it('uses percent reference bands', () => {
    expect(diffusionReferenceLevels('percent')).toEqual([10, 20, 80, 90])
  })
})
