import type { OhlcBar } from '../yahoo'
import type { PatternHit } from './types'
import type { SpecialPatternDef } from './specialCatalog'
import { detectCustomRule, ruleSetProgress, ruleSetPasses } from './customRules'
import type { LaunchpadScanContext } from './launchpadDetect'
import { launchpadFormingScore, launchpadPasses } from './launchpadDetect'
import { landscapeFormingScore, landscapePasses } from './landscapeDetect'
import { rulesFromCustom } from './scanScript'
import { detectLaunchpad } from './launchpadDetect'
import { detectLandscape } from './landscapeDetect'
import { detectVcpBreakout, detectVcpSetup, vcpBreakoutPasses } from './vcpDetect'

export type SpecialScanContext = {
  launchpad?: LaunchpadScanContext
  landscape?: LaunchpadScanContext
}

export type PatternScanScore = {
  score: number
  confirmed: boolean
}

export function scoreSpecialScanPattern(
  bars: OhlcBar[],
  pattern: SpecialPatternDef,
  ctx?: SpecialScanContext,
): PatternScanScore | null {
  if (bars.length < 25) return null
  const i = bars.length - 1

  if (pattern.id === 'launchpad') {
    const score = launchpadFormingScore(bars, i, ctx?.launchpad)
    const confirmed = launchpadPasses(bars, i, ctx?.launchpad)
    return { score: confirmed ? 100 : score, confirmed }
  }
  if (pattern.id === 'landscape') {
    const score = landscapeFormingScore(bars, i, ctx?.landscape)
    const confirmed = landscapePasses(bars, i, ctx?.landscape)
    return { score: confirmed ? 100 : score, confirmed }
  }
  if (pattern.id === 'vcp-setup') {
    const rules = rulesFromCustom(null, pattern.scanScript ?? '')
    if (!rules?.conditions.length) return null
    const score = ruleSetProgress(bars, i, rules)
    const confirmed = ruleSetPasses(bars, i, rules)
    return { score: confirmed ? 100 : score, confirmed }
  }
  if (pattern.id === 'vcp-breakout') {
    const rules = {
      match: 'all' as const,
      conditions: [
        { id: 'vcp-b-200', metric: 'pct_above_sma200' as const, op: 'gt' as const, value: 0 },
        { id: 'vcp-b-rsi-lo', metric: 'rsi' as const, op: 'gte' as const, value: 40 },
        { id: 'vcp-b-rsi-hi', metric: 'rsi' as const, op: 'lte' as const, value: 75 },
        { id: 'vcp-b-rvol', metric: 'rvol' as const, op: 'gte' as const, value: 2 },
        { id: 'vcp-b-pct5', metric: 'pct_change_5d' as const, op: 'gte' as const, value: 3 },
      ],
    }
    const base = ruleSetProgress(bars, i, rules)
    const closes = bars.slice(0, i + 1).map((b) => b.c)
    const last = closes.length - 1
    const priorTight =
      last >= 5
        ? ((closes[last - 1] - closes[last - 5]) / closes[last - 5]) * 100 <= 2
        : false
    let priorDry = false
    if (i >= 24) {
      let sum = 0
      let n = 0
      for (let k = i - 4; k <= i - 1; k++) {
        const avg = bars.slice(k - 20, k).reduce((a, b) => a + (b.v || 0), 0) / 20
        if (avg > 0) {
          sum += (bars[k].v || 0) / avg
          n++
        }
      }
      priorDry = n > 0 && sum / n <= 0.8
    }
    const score = Math.round(((base / 100) * 5 + (priorTight ? 1 : 0) + (priorDry ? 1 : 0)) / 7 * 100)
    const confirmed = vcpBreakoutPasses(bars, i)
    return { score: confirmed ? 100 : score, confirmed }
  }
  if (!pattern.scanScript?.trim()) return null
  const rules = rulesFromCustom(null, pattern.scanScript)
  if (!rules?.conditions.length) return null
  const score = ruleSetProgress(bars, i, rules)
  const confirmed = ruleSetPasses(bars, i, rules)
  return { score: confirmed ? 100 : score, confirmed }
}

export function evaluateSpecialScanPattern(
  bars: OhlcBar[],
  pattern: SpecialPatternDef,
  ctx?: SpecialScanContext,
): PatternHit | null {
  if (pattern.id === 'vcp-setup') {
    return detectVcpSetup(bars, pattern)
  }
  if (pattern.id === 'vcp-breakout') {
    return detectVcpBreakout(bars, pattern)
  }
  if (pattern.id === 'launchpad') {
    return detectLaunchpad(bars, pattern, ctx?.launchpad)
  }
  if (pattern.id === 'landscape') {
    return detectLandscape(bars, pattern, ctx?.landscape)
  }
  if (!pattern.scanScript?.trim()) return null
  const rules = rulesFromCustom(null, pattern.scanScript)
  if (!rules?.conditions.length) return null
  return detectCustomRule(bars, {
    id: pattern.id,
    name: pattern.name,
    bias: pattern.bias,
    description: pattern.description,
    rules,
  })
}

export type PatternScanResult = {
  patternId: string
  score: number
  confirmed: boolean
  hit: PatternHit | null
}

export function scanOhlcForSpecialPatterns(
  bars: OhlcBar[],
  patterns: SpecialPatternDef[],
  ctx?: SpecialScanContext,
): PatternScanResult[] {
  const out: PatternScanResult[] = []
  for (const p of patterns) {
    if (p.kind !== 'scan') continue
    const scored = scoreSpecialScanPattern(bars, p, ctx)
    if (!scored || scored.score <= 0) continue
    const hit = scored.confirmed ? evaluateSpecialScanPattern(bars, p, ctx) : null
    out.push({
      patternId: p.id,
      score: scored.score,
      confirmed: scored.confirmed,
      hit,
    })
  }
  return out
}
