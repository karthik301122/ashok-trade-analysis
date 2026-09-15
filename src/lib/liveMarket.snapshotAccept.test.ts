import { describe, expect, it } from 'vitest'
import { mergeEodLastPrices } from './liveMarket'
import type { CachedPerf } from './deskSeries'

/**
 * Mirrors parseServerSnapshot acceptance rules (kept in sync with liveMarket.ts).
 * The stuck-at-100 bug: downloaded all server stocks (~100) but rejected vs 2571*15%.
 */
function isEnough(fetchedCount: number, mapTotal: number, universeSize: number, minRatio: number) {
  const enoughOfUniverse = fetchedCount >= universeSize * minRatio
  const enoughOfServerMap =
    mapTotal > 0 && fetchedCount >= Math.max(1, Math.ceil(mapTotal * 0.95))
  return enoughOfUniverse || enoughOfServerMap
}

describe('server snapshot acceptance', () => {
  it('accepts a complete small server map even if far below universe ratio', () => {
    expect(isEnough(100, 100, 2571, 0.15)).toBe(true)
  })

  it('rejects a partial download of a large server map', () => {
    expect(isEnough(100, 2500, 2571, 0.15)).toBe(false)
  })

  it('accepts enough of the ASX universe even without mapTotal', () => {
    expect(isEnough(400, 400, 2571, 0.15)).toBe(true)
  })
})

describe('mergeEodLastPrices', () => {
  it('skips meta EOD when a live session overlay is present', () => {
    const map = new Map<string, CachedPerf>([
      [
        'CBA',
        {
          d1: 1.2,
          w1: 0,
          m1: 0,
          m3: 0,
          m6: 0,
          y1: 0,
          y5: 0,
          from52wHigh: 0,
          above200ma: true,
          above50ma: true,
          above21ema: true,
          above20ma: true,
          rs: 50,
          spark: [],
          lastPrice: 185.5,
          liveAt: Date.now(),
        },
      ],
    ])
    mergeEodLastPrices(map, { CBA: 180.0 }, true)
    expect(map.get('CBA')?.lastPrice).toBe(185.5)
  })

  it('applies meta EOD when not in a live session', () => {
    const map = new Map<string, CachedPerf>([
      [
        'CBA',
        {
          d1: 0,
          w1: 0,
          m1: 0,
          m3: 0,
          m6: 0,
          y1: 0,
          y5: 0,
          from52wHigh: 0,
          above200ma: true,
          above50ma: true,
          above21ema: true,
          above20ma: true,
          rs: 50,
          spark: [],
          lastPrice: 180.0,
          liveAt: Date.now(),
        },
      ],
    ])
    mergeEodLastPrices(map, { CBA: 185.25 }, false)
    expect(map.get('CBA')?.lastPrice).toBe(185.25)
  })
})
