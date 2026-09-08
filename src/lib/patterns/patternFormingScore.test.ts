import { describe, expect, it } from 'vitest'
import { blendScores, clampScore, rampDown, rampUp, scoreFromFlags } from './patternFormingScore'

describe('patternFormingScore helpers', () => {
  it('scoreFromFlags', () => {
    expect(scoreFromFlags([true, true, false, true])).toBe(75)
    expect(scoreFromFlags([])).toBe(0)
  })

  it('rampUp / rampDown', () => {
    expect(rampUp(40, 40, 70)).toBe(0)
    expect(rampUp(70, 40, 70)).toBe(100)
    expect(rampUp(55, 40, 70)).toBe(50)
    expect(rampDown(0.05, 0.05, 0.1)).toBe(100)
    expect(rampDown(0.1, 0.05, 0.1)).toBe(0)
    expect(rampDown(0.075, 0.05, 0.1)).toBe(50)
  })

  it('blendScores', () => {
    expect(blendScores([{ score: 100, weight: 1 }, { score: 0, weight: 1 }])).toBe(50)
    expect(clampScore(150)).toBe(100)
  })
})
