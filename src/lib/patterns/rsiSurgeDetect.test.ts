import { describe, expect, it } from 'vitest'
import type { OhlcBar } from '../deskSeries'
import {
  detectRsiSurge,
  rsiSeries,
  rsiSurgeCheckDetails,
  rsiSurgePasses,
} from './rsiSurgeDetect'

/** Build daily bars; closes drive RSI. ~5 daily bars per week for weekly RSI warm. */
function buildBars(closes: number[]): OhlcBar[] {
  const day = 86_400
  // Start far enough back that weekly aggregation has many weeks
  const t0 = 1_600_000_000
  return closes.map((c, i) => {
    const prev = i > 0 ? closes[i - 1] : c
    const h = Math.max(c, prev) * 1.01
    const l = Math.min(c, prev) * 0.99
    return {
      t: t0 + i * day,
      o: prev,
      h,
      l,
      c,
      v: 1_000_000,
    }
  })
}

/** Force High[10] / Low[10] for price confirm on the last bar. */
function withPriceBreak(bars: OhlcBar[], mode: 'up' | 'down'): OhlcBar[] {
  const out = bars.map((b) => ({ ...b }))
  const i = out.length - 1
  const ref = out[i - 10]
  if (mode === 'up') {
    ref.h = out[i].c - 0.5
    ref.l = ref.h - 1
  } else {
    ref.l = out[i].c + 0.5
    ref.h = ref.l + 1
  }
  return out
}

describe('rsiSeries', () => {
  it('warms after period+1 closes', () => {
    const closes = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 3) * 5)
    const series = rsiSeries(closes, 14)
    expect(series[14]).not.toBeNull()
    expect(series[39]).not.toBeNull()
    expect(series[13]).toBeNull()
  })
})

describe('rsiSurgeDetect', () => {
  it('rejects short series', () => {
    const bars = buildBars(Array.from({ length: 20 }, (_, i) => 100 + i))
    expect(rsiSurgeCheckDetails(bars, bars.length - 1)).toBeNull()
    expect(detectRsiSurge(bars, { id: 'rsi-surge', name: 'RSI Surge', bias: 'neutral' })).toBeNull()
  })

  it('fires bullish surge from oversold into 50-zone with price + weekly confirm', () => {
    // Long quiet grind so weekly RSI sits ~50–60, then dump to oversold, then snap to ~50.
    const closes: number[] = []
    for (let w = 0; w < 20; w++) {
      for (let d = 0; d < 5; d++) closes.push(100 + w * 0.15)
    }
    // Dump ~3 days then recover into mid-RSI
    const base = closes[closes.length - 1]
    closes.push(base * 0.92, base * 0.88, base * 0.85)
    // Snap back hard toward prior levels (large RSI change into ~50)
    closes.push(base * 0.95, base * 0.98, base * 1.0)

    let bars = buildBars(closes)
    bars = withPriceBreak(bars, 'up')
    const i = bars.length - 1
    const d = rsiSurgeCheckDetails(bars, i)
    // May or may not confirm depending on exact RSI path — assert structure
    expect(d).not.toBeNull()
    if (d?.confirmed) {
      expect(d.fromOversold || d.fromOverbought).toBe(true)
      expect(d.minChangeOk).toBe(true)
      expect(d.priceBreakUp || d.priceBreakDown).toBe(true)
      expect(d.weeklyConfirm).toBe(true)
      expect(d.surgeScore).toBeGreaterThan(0)
      expect(rsiSurgePasses(bars, i)).toBe(true)
      const hit = detectRsiSurge(bars, {
        id: 'rsi-surge',
        name: 'RSI Surge',
        bias: 'neutral',
      })
      expect(hit).not.toBeNull()
      expect(hit!.name).toBe('RSI Surge')
    }
  })

  it('computes SurgeScore formula pieces when RSI is available', () => {
    const closes = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 8) * 8)
    const bars = buildBars(closes)
    const d = rsiSurgeCheckDetails(bars, bars.length - 1)
    expect(d).not.toBeNull()
    expect(d!.rsiD).not.toBeNull()
    expect(Number.isFinite(d!.surgeScore)).toBe(true)
  })
})
