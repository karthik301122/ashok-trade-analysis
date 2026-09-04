import type { OhlcBar } from '../deskSeries'
import type { PatternBias, PatternHit } from './types'
import { ruleSetPasses } from './customRules'
import { rulesFromCustom, VCP_SETUP_SCRIPT } from './scanScript'

const LOOKBACK_BARS = 10

function pctChange(closes: number[], fromIdx: number, toIdx: number): number | null {
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= closes.length || toIdx >= closes.length) return null
  const base = closes[fromIdx]
  if (base === 0) return null
  return ((closes[toIdx] - base) / base) * 100
}

function avgRvol(bars: OhlcBar[], from: number, to: number): number | null {
  if (from > to || from < 20) return null
  let sum = 0
  let n = 0
  for (let i = from; i <= to; i++) {
    const avg =
      bars.slice(i - 20, i).reduce((a, b) => a + (b.v || 0), 0) / 20
    if (avg <= 0) continue
    sum += (bars[i].v || 0) / avg
    n++
  }
  if (n === 0) return null
  return sum / n
}

/**
 * VCP breakout: prior tight + dry volume, then price + volume surge on the signal bar.
 * pct_chg(5) and rvol cannot be both ≤ and ≥ on the same bar — prior window vs today.
 */
export function vcpBreakoutPasses(bars: OhlcBar[], i: number): boolean {
  if (bars.length < 30 || i < 25) return false

  const closes = bars.slice(0, i + 1).map((b) => b.c)
  const last = closes.length - 1

  if (!ruleSetPasses(bars, i, {
    match: 'all',
    conditions: [
      { id: 'vcp-b-200', metric: 'pct_above_sma200', op: 'gt', value: 0 },
      { id: 'vcp-b-rsi-lo', metric: 'rsi', op: 'gte', value: 40 },
      { id: 'vcp-b-rsi-hi', metric: 'rsi', op: 'lte', value: 75 },
      { id: 'vcp-b-rvol', metric: 'rvol', op: 'gte', value: 2 },
      { id: 'vcp-b-pct5', metric: 'pct_change_5d', op: 'gte', value: 3 },
    ],
  })) {
    return false
  }

  const priorTight = pctChange(closes, last - 5, last - 1)
  if (priorTight == null || priorTight > 2) return false

  const priorDry = avgRvol(bars, i - 4, i - 1)
  if (priorDry == null || priorDry > 0.8) return false

  return true
}

export function detectVcpBreakout(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
): PatternHit | null {
  if (bars.length < 30) return null
  const from = Math.max(25, bars.length - LOOKBACK_BARS)
  let bestI = -1
  for (let i = from; i < bars.length; i++) {
    if (vcpBreakoutPasses(bars, i)) bestI = i
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  return {
    id: `vcp-breakout-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: bar.t,
    endT: bar.t,
    confidence: 0.75,
    points: [{ time: bar.t, price: bar.c }],
    note:
      pattern.description?.trim() ||
      'Prior 4d tight + dry RVOL, then 5d ≥3% with RVOL ≥2 above 200 SMA',
  }
}

/** VCP setup via compiled ScanScript (same rules as VCP_SETUP_SCRIPT). */
export function detectVcpSetup(
  bars: OhlcBar[],
  pattern: { id: string; name: string; bias: PatternBias; description?: string },
): PatternHit | null {
  const rules = rulesFromCustom(null, VCP_SETUP_SCRIPT)
  if (!rules?.conditions.length || bars.length < 25) return null
  const from = Math.max(24, bars.length - LOOKBACK_BARS)
  let bestI = -1
  for (let i = from; i < bars.length; i++) {
    if (ruleSetPasses(bars, i, rules)) bestI = i
  }
  if (bestI < 0) return null
  const bar = bars[bestI]
  return {
    id: `vcp-setup-${pattern.id}-${bar.t}`,
    category: 'custom',
    name: pattern.name,
    bias: pattern.bias,
    startT: bar.t,
    endT: bar.t,
    confidence: 0.7,
    points: [{ time: bar.t, price: bar.c }],
    note: pattern.description?.trim() || 'VCP contraction setup',
  }
}
