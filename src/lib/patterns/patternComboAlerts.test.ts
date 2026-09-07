import { describe, expect, it } from 'vitest'
import {
  normalizePatternCombos,
  patternAlertTimeframe,
  validatePatternCombo,
} from './patternComboAlerts'

describe('patternComboAlerts', () => {
  it('requires two patterns and AND timeframe', () => {
    expect(
      validatePatternCombo({
        name: 'AND mixed bad',
        op: 'and',
        timeframe: 'mixed',
        patternIds: ['a', 'b'],
      }),
    ).toMatch(/daily-only or weekly-only/)

    expect(
      validatePatternCombo({
        name: 'Ok daily',
        op: 'and',
        timeframe: 'daily',
        patternIds: ['a', 'b'],
      }),
    ).toBeNull()

    expect(
      validatePatternCombo({
        name: 'Or one',
        op: 'or',
        timeframe: 'mixed',
        patternIds: ['a'],
      }),
    ).toMatch(/at least two/)
  })

  it('normalizes and drops invalid combos', () => {
    const out = normalizePatternCombos([
      {
        id: 'c1',
        name: 'Breakout OR',
        op: 'or',
        timeframe: 'mixed',
        patternIds: ['vcp-setup', 'landscape'],
        enabled: true,
        minScore: 60,
      },
      {
        id: 'bad',
        name: 'One',
        op: 'and',
        timeframe: 'daily',
        patternIds: ['only-one'],
        enabled: true,
        minScore: 60,
      },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('c1')
  })

  it('classifies karthik weekly ids', () => {
    expect(patternAlertTimeframe('stage-2')).toBe('weekly')
    expect(patternAlertTimeframe('weekly-inside-bar')).toBe('weekly')
    expect(patternAlertTimeframe('landscape')).toBe('daily')
    expect(patternAlertTimeframe('vcp-setup')).toBe('daily')
  })
})
