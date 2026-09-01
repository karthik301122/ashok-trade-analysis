import { describe, expect, it } from 'vitest'
import {
  detectDrawnPattern,
  defaultTriggerForTool,
  describeDrawnSpec,
  normalizeDrawnSpec,
  newDrawnTool,
  snapAnchorToBar,
} from './drawnPattern'
import type { OhlcBar } from './types'

function bars(closes: number[], startT = 1700000000): OhlcBar[] {
  return closes.map((c, i) => {
    const t = startT + i * 86400
    return { t, o: c - 0.5, h: c + 1, l: c - 1, c, v: 1e6 }
  })
}

describe('drawnPattern', () => {
  it('normalizes drawn spec', () => {
    const spec = normalizeDrawnSpec({
      timeframe: 'daily',
      tools: [
        {
          id: 't1',
          type: 'hline',
          points: [{ time: 100, price: 10 }],
          trigger: 'break_above',
          tolerancePct: 0.5,
        },
      ],
    })
    expect(spec?.timeframe).toBe('daily')
    expect(spec?.tools.length).toBe(1)
  })

  it('detects horizontal break above', () => {
    const level = 10
    const series = bars([9, 9.2, 9.5, 9.8, 10.2, 10.5])
    const tool = newDrawnTool('hline', [{ time: series[0].t, price: level }], 'bullish')
    tool.trigger = 'break_above'
    tool.tolerancePct = 0.5
    const hit = detectDrawnPattern(series, {
      id: 'p1',
      name: 'Breakout',
      bias: 'bullish',
      drawnSpec: { timeframe: 'daily', tools: [tool] },
    })
    expect(hit).not.toBeNull()
    expect(hit?.name).toBe('Breakout')
    expect(hit?.points?.length).toBeGreaterThan(0)
  })

  it('detects zone inside', () => {
    const series = bars([8, 9, 9.5, 10, 10.2, 10.1])
    const tool = newDrawnTool(
      'zone',
      [
        { time: series[0].t, price: 11 },
        { time: series[3].t, price: 9 },
      ],
      'neutral',
    )
    tool.trigger = 'inside_zone'
    const hit = detectDrawnPattern(series, {
      id: 'z1',
      name: 'Range',
      bias: 'neutral',
      drawnSpec: { timeframe: 'daily', tools: [tool] },
    })
    expect(hit).not.toBeNull()
  })

  it('snapAnchorToBar snaps to bar time and nearest OHLC', () => {
    const series = bars([10, 11, 12])
    const snapped = snapAnchorToBar(series, series[1].t + 1000, 11.3)
    expect(snapped.time).toBe(series[1].t)
    expect([series[1].h, series[1].l, series[1].c]).toContain(snapped.price)
  })

  it('default triggers follow bias', () => {
    expect(defaultTriggerForTool('hline', 'bullish')).toBe('break_above')
    expect(defaultTriggerForTool('hline', 'bearish')).toBe('break_below')
    expect(defaultTriggerForTool('zone', 'bullish')).toBe('inside_zone')
  })

  it('describeDrawnSpec is human readable', () => {
    const tool = newDrawnTool('trendline', [
      { time: 1, price: 2 },
      { time: 2, price: 3 },
    ])
    const text = describeDrawnSpec({ timeframe: 'daily', tools: [tool] })
    expect(text).toContain('daily')
    expect(text).toContain('Trendline')
  })
})
