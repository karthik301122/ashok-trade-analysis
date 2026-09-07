import { describe, expect, it } from 'vitest'
import {
  comparePatternHitsByScore,
  patternHitConfirmed,
  patternHitScore,
  rankPatternHitsByScore,
} from './rankPatternHits'

describe('rankPatternHitsByScore', () => {
  it('scores confidence 0–1 as 0–100', () => {
    expect(patternHitScore({ confidence: 0.8 })).toBe(80)
    expect(patternHitScore({ score: 72 })).toBe(72)
  })

  it('treats confidence ≥ 0.85 as confirmed', () => {
    expect(patternHitConfirmed({ confidence: 0.9 })).toBe(true)
    expect(patternHitConfirmed({ confidence: 0.8 })).toBe(false)
    expect(patternHitConfirmed({ confirmed: true, score: 40 })).toBe(true)
  })

  it('ranks confirmed ahead of higher forming score', () => {
    const ranked = rankPatternHitsByScore([
      { name: 'Forming', score: 90, confirmed: false, endT: 200 },
      { name: 'Hit', score: 85, confirmed: true, endT: 100 },
      { name: 'Weak', score: 60, confirmed: false, endT: 300 },
    ])
    expect(ranked.map((h) => h.name)).toEqual(['Hit', 'Forming', 'Weak'])
  })

  it('breaks ties with endT then name', () => {
    const ranked = rankPatternHitsByScore([
      { name: 'B', confidence: 0.7, endT: 10 },
      { name: 'A', confidence: 0.7, endT: 10 },
      { name: 'C', confidence: 0.7, endT: 20 },
    ])
    expect(ranked.map((h) => h.name)).toEqual(['C', 'A', 'B'])
  })

  it('compare matches rank order', () => {
    const a = { name: 'A', score: 70, confirmed: false }
    const b = { name: 'B', score: 90, confirmed: false }
    expect(comparePatternHitsByScore(a, b)).toBeGreaterThan(0)
  })
})
