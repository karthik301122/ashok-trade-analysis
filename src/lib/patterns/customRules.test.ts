import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../deskSeries'
import {
  detectCustomRule,
  ruleSetPasses,
  type CustomRuleSet,
} from './customRules'

function bar(i: number, c: number, v = 1_000_000): OhlcBar {
  const t = 1_700_000_000 + i * 86_400
  return { t, o: c, h: c * 1.01, l: c * 0.99, c, v }
}

/** Rising then flat series long enough for RSI/SMA */
function series(n: number, start = 100, step = 0.5): OhlcBar[] {
  return Array.from({ length: n }, (_, i) => bar(i, start + i * step, 1_000_000 + (i % 5) * 1000))
}

describe('customRules', () => {
  it('AND match requires all conditions', () => {
    const bars = series(80)
    // Force high volume on last bar
    bars[bars.length - 1] = {
      ...bars[bars.length - 1],
      v: 5_000_000,
      c: bars[bars.length - 1].c * 1.02,
      h: bars[bars.length - 1].c * 1.03,
    }
    const rules: CustomRuleSet = {
      match: 'all',
      conditions: [
        { id: '1', metric: 'rvol', op: 'gte', value: 2 },
        { id: '2', metric: 'pct_change_5d', op: 'gt', value: 0 },
      ],
    }
    expect(ruleSetPasses(bars, bars.length - 1, rules)).toBe(true)
    rules.conditions[1].value = 50
    expect(ruleSetPasses(bars, bars.length - 1, rules)).toBe(false)
  })

  it('OR match passes when one condition holds', () => {
    const bars = series(80)
    const rules: CustomRuleSet = {
      match: 'any',
      conditions: [
        { id: '1', metric: 'rsi', op: 'lt', value: 1 },
        { id: '2', metric: 'pct_above_sma20', op: 'gt', value: -100 },
      ],
    }
    expect(ruleSetPasses(bars, bars.length - 1, rules)).toBe(true)
  })

  it('detectCustomRule returns a hit with pattern name', () => {
    const bars = series(80)
    bars[bars.length - 1].v = 8_000_000
    const hit = detectCustomRule(bars, {
      id: 'p1',
      name: 'My RVOL Spike',
      bias: 'bullish',
      rules: {
        match: 'all',
        conditions: [{ id: '1', metric: 'rvol', op: 'gte', value: 3 }],
      },
    })
    expect(hit).not.toBeNull()
    expect(hit?.name).toBe('My RVOL Spike')
    expect(hit?.category).toBe('custom')
  })

  it('detectCustomRule returns null when no match', () => {
    const bars = series(80, 100, 0)
    const hit = detectCustomRule(bars, {
      id: 'p2',
      name: 'Impossible',
      bias: 'bearish',
      rules: {
        match: 'all',
        conditions: [{ id: '1', metric: 'rvol', op: 'gte', value: 99 }],
      },
    })
    expect(hit).toBeNull()
  })
})
