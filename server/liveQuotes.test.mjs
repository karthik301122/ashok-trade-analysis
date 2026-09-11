import { describe, expect, it } from 'vitest'
import { eodhdCodeToAppTicker } from './eodhd.mjs'
import {
  applyLiveToCachedPerf,
  isAsxMarketSession,
  shouldKeepSessionLiveOverlay,
  shouldPollLiveQuotes,
  stripLiveOverlayFromPerf,
} from './liveQuotes.mjs'

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

  it('strips live overlay fields for persistence', () => {
    const out = stripLiveOverlayFromPerf({
      d1: 2.1,
      lastPrice: 52.5,
      liveAt: 123,
    })
    expect(out).toEqual({ d1: 2.1, lastPrice: 52.5 })
    expect('liveAt' in out).toBe(false)
  })
})

describe('isAsxMarketSession', () => {
  it('is closed on weekends', () => {
    const sat = new Date('2026-08-29T02:00:00Z').getTime()
    expect(isAsxMarketSession(sat)).toBe(false)
  })
})

describe('session live overlay', () => {
  it('keeps same-day quotes after the cash close', () => {
    // Friday 18:00 AEST = 08:00 UTC
    const afterClose = Date.parse('2026-09-04T08:00:00Z')
    const quoteAt = Date.parse('2026-09-04T06:20:00Z') // 16:20 AEST same day
    expect(shouldKeepSessionLiveOverlay(quoteAt, afterClose)).toBe(true)
  })

  it('polls briefly after the bell', () => {
    // 16:45 AEST = 06:45 UTC
    expect(shouldPollLiveQuotes(Date.parse('2026-09-04T06:45:00Z'))).toBe(true)
  })

  it('still polls during evening desk-sync window', () => {
    // 18:00 AEST = 08:00 UTC
    expect(shouldPollLiveQuotes(Date.parse('2026-09-04T08:00:00Z'))).toBe(true)
  })
})
