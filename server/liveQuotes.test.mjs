import { describe, expect, it } from 'vitest'
import { eodhdCodeToAppTicker } from './eodhd.mjs'
import { applyLiveToCachedPerf, isAsxMarketSession } from './liveQuotes.mjs'

describe('eodhdCodeToAppTicker', () => {
  it('maps AU codes to app tickers', () => {
    expect(eodhdCodeToAppTicker('BHP.AU')).toBe('BHP')
    expect(eodhdCodeToAppTicker('AXJO.INDX')).toBe('^AXJO')
  })
})

describe('applyLiveToCachedPerf', () => {
  it('overlays price and day change', () => {
    const base = {
      d1: 0.5,
      w1: 1,
      m1: 2,
      m3: 3,
      m6: 4,
      y1: 5,
      y5: 6,
      from52wHigh: -10,
      above200ma: true,
      above50ma: true,
      above21ema: true,
      above20ma: true,
      rs: 55,
      spark: [100],
      volume: 1000,
      avgVolume20: 1000,
      relativeVolume: 1,
      dollarVolume: 50000,
      lastPrice: 50,
      rsi: 50,
    }
    const out = applyLiveToCachedPerf(base, {
      close: 52.5,
      change_p: 2.1,
      volume: 2000,
      updated_at: 1,
    })
    expect(out.lastPrice).toBe(52.5)
    expect(out.d1).toBe(2.1)
    expect(out.volume).toBe(2000)
    expect(out.liveAt).toBe(1)
  })
})

describe('isAsxMarketSession', () => {
  it('is closed on weekends', () => {
    const sat = new Date('2026-08-29T02:00:00Z').getTime()
    expect(isAsxMarketSession(sat)).toBe(false)
  })
})
