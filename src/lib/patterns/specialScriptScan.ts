import type { OhlcBar } from '../yahoo'
import type { PatternHit } from './types'
import type { SpecialPatternDef } from './specialCatalog'
import { detectCustomRule } from './customRules'
import type { LaunchpadScanContext } from './launchpadDetect'
import { rulesFromCustom } from './scanScript'
import { detectLaunchpad } from './launchpadDetect'
import { detectLandscape } from './landscapeDetect'
import { detectVcpBreakout, detectVcpSetup } from './vcpDetect'

export type SpecialScanContext = {
  launchpad?: LaunchpadScanContext
  landscape?: LaunchpadScanContext
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

export function scanOhlcForSpecialPatterns(
  bars: OhlcBar[],
  patterns: SpecialPatternDef[],
  ctx?: SpecialScanContext,
): { patternId: string; hit: PatternHit }[] {
  const out: { patternId: string; hit: PatternHit }[] = []
  for (const p of patterns) {
    if (p.kind !== 'scan') continue
    const hit = evaluateSpecialScanPattern(bars, p, ctx)
    if (hit) out.push({ patternId: p.id, hit })
  }
  return out
}
