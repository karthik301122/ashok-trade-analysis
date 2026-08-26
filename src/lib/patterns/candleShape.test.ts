import { describe, expect, it } from 'vitest'
import type { OhlcBar } from './types'
import {
  defaultCandleShape,
  detectCandleShape,
  geometryPasses,
  normalizeCandleShape,
} from './candleShape'

function bar(t: number, o: number, h: number, l: number, c: number): OhlcBar {
  return { t, o, h, l, c, v: 1_000_000 }
}

describe('candleShape', () => {
  it('normalizes unknown input to a hammer-like default shape', () => {
    const s = normalizeCandleShape({ timeframe: 'weekly', candleCount: 2, presetId: 'hammer' })
    expect(s?.timeframe).toBe('weekly')
    expect(s?.candleCount).toBe(2)
    expect(s?.geometry.minLowerWickBodyMult).toBe(2)
  })

  it('detects a classic hammer geometry', () => {
    // Newest-first indices: 0 = hammer, 1 = prior higher close
    const hammer = bar(2000, 48, 50, 40, 49.5)
    const prior = bar(1000, 55, 56, 52, 53)
    const series = [hammer, prior]
    const shape = defaultCandleShape('hammer')
    expect(geometryPasses(series, 0, shape.geometry)).toBe(true)
  })

  it('detectCandleShape returns a hit for hammer on daily series', () => {
    const daily: OhlcBar[] = []
    let t = 1_700_000_000
    for (let i = 0; i < 30; i++) {
      daily.push(bar(t, 50, 51, 49, 50.5))
      t += 86400
    }
    // Last bar = hammer after decline
    daily[daily.length - 1] = bar(t, 48, 50, 40, 49.5)
    daily[daily.length - 2] = bar(t - 86400, 55, 56, 52, 53)

    const hit = detectCandleShape(daily, {
      id: 'p1',
      name: 'My Hammer',
      bias: 'bullish',
      candleShape: defaultCandleShape('hammer'),
    })
    expect(hit).not.toBeNull()
    expect(hit?.name).toBe('My Hammer')
    expect(hit?.category).toBe('custom')
  })

  it('rejects when lower wick too short for hammer', () => {
    const series = [bar(2000, 49, 50, 48.5, 49.5), bar(1000, 55, 56, 52, 53)]
    const shape = defaultCandleShape('hammer')
    expect(geometryPasses(series, 0, shape.geometry)).toBe(false)
  })
})
