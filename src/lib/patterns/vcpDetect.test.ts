import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../deskSeries'
import { vcpBreakoutPasses } from './vcpDetect'

function makeBars(closes: number[], volumes: number[]): OhlcBar[] {
  const baseT = 1_700_000_000
  return closes.map((c, i) => ({
    t: baseT + i * 86400,
    o: c,
    h: c * 1.01,
    l: c * 0.99,
    c,
    v: volumes[i] ?? 1_000_000,
  }))
}

/** Gradual base, flat dry pocket, then +3% breakout (RSI stays below 75). */
function breakoutFixture(): OhlcBar[] {
  const closes: number[] = []
  const volumes: number[] = []
  for (let i = 0; i < 150; i++) {
    closes.push(95 + i * (5 / 149))
    volumes.push(600_000)
  }
  for (let i = 0; i < 50; i++) {
    closes.push(100)
    volumes.push(600_000)
  }
  for (let i = 0; i < 5; i++) {
    closes.push(100)
    volumes.push(350_000)
  }
  closes.push(103)
  volumes.push(2_500_000)
  return makeBars(closes, volumes)
}

describe('vcpDetect', () => {
  it('rejects when prior window not tight', () => {
    const bars = breakoutFixture()
    const i = bars.length - 1
    bars[i - 1].c = 110
    expect(vcpBreakoutPasses(bars, i)).toBe(false)
  })

  it('rejects when breakout volume surge missing', () => {
    const bars = breakoutFixture()
    const i = bars.length - 1
    bars[i].v = 400_000
    expect(vcpBreakoutPasses(bars, i)).toBe(false)
  })
})
