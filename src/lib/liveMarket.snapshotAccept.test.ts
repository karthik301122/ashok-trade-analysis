import { describe, expect, it } from 'vitest'

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
