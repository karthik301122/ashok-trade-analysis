import { describe, expect, it } from 'vitest'
import { scoreFromFlags } from './patternFormingScore'

describe('scoreFromFlags', () => {
  it('returns percentage of true flags', () => {
    expect(scoreFromFlags([true, true, false, true])).toBe(75)
    expect(scoreFromFlags([])).toBe(0)
  })
})
