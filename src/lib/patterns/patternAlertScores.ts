import type { StockMetrics } from '../../data/types'
import type { OhlcBar } from '../deskSeries'
import {
  KARTHIK_WEEKLY_PATTERNS,
  LAUNCHPAD_PATTERNS,
  LANDSCAPE_PATTERNS,
  LIVERMORE_PATTERNS,
  SNAPSHOT_PATTERN_CATALOG,
  VCP_PATTERNS,
} from './specialCatalog'
import {
  buildSpecialScanContext,
  evaluateSpecialPattern,
  type SpecialScanContext as SnapshotScanContext,
} from './specialDetect'
import {
  detectThreeWeeksTight,
  isWeeklyHammer,
  isWeeklyInsideBar,
  THREE_WEEKS_TIGHT_THRESHOLD,
  type KarthikPatternId,
} from './karthikWeekly'
import { completedWeeklyBars } from './weeklyBars'
import { hasKarthikSpecialContext, isStage2Weekly, smaAt, weeklyReturnOver } from './stage2Weekly'
import { livermorePatternMatch, type LivermoreScores } from './livermoreScores'
import {
  scanOhlcForSpecialPatterns,
  type PatternScanResult,
  type SpecialScanContext as OhlcScanContext,
} from './specialScriptScan'
import { scoreFromFlags } from './patternFormingScore'
import type { PatternScanUploadRow } from '../patternScanApi'

export type PatternAlertScore = { score: number; confirmed: boolean }

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

function vsIndex3m(stock: StockMetrics, indexM3: number): number {
  return stock.m3 - indexM3
}

function stage2WeeklyProgress(weeks: OhlcBar[], i = 0): number {
  const need = 42
  if (weeks.length < need + i) return 0
  const closes = weeks.map((w) => w.c)
  const c = closes[i]
  const ma10 = smaAt(closes, i, 10)
  const ma30 = smaAt(closes, i, 30)
  const ma40 = smaAt(closes, i, 40)
  const ma30Prev = smaAt(closes, i + 2, 30)
  const ma40Prev = smaAt(closes, i + 2, 40)
  if (ma10 == null || ma30 == null || ma40 == null || ma30Prev == null || ma40Prev == null) {
    return 0
  }
  return scoreFromFlags([
    ma10 > ma30,
    ma30 > ma40,
    ma30 > ma30Prev,
    ma40 > ma40Prev,
    c > ma10,
    c > ma30,
    c > ma40,
  ])
}

function tightnessFormingScore(tightness: number | null): number {
  if (tightness == null) return 0
  const threshold = THREE_WEEKS_TIGHT_THRESHOLD
  if (tightness <= threshold) return 100
  if (tightness <= threshold * 2) {
    return clampScore(100 - ((tightness - threshold) / threshold) * 35)
  }
  return clampScore(55 - (tightness - threshold * 2) * 120)
}

export function karthikAlertScore(
  daily: OhlcBar[],
  patternId: KarthikPatternId,
): PatternAlertScore {
  const weeks = completedWeeklyBars(daily)
  const contextOk = hasKarthikSpecialContext(weeks, 0)
  const stage2 = isStage2Weekly(weeks, 0)

  if (patternId === 'stage-2') {
    const score = stage2WeeklyProgress(weeks, 0)
    return { score: stage2 ? 100 : score, confirmed: stage2 }
  }

  if (!contextOk) {
    const rally = weeklyReturnOver(weeks, 0, 13)
    const contextProgress = scoreFromFlags([
      stage2,
      rally != null && rally >= 20,
      rally != null && rally >= 30,
    ])
    if (contextProgress < 34) return { score: contextProgress, confirmed: false }
  }

  switch (patternId) {
    case 'three-weeks-tight': {
      const formed = detectThreeWeeksTight(daily)
      if (formed.hit) return { score: 100, confirmed: true }
      const score = tightnessFormingScore(formed.tightness)
      return { score: contextOk ? Math.max(score, 40) : score, confirmed: false }
    }
    case 'weekly-inside-bar': {
      const hit = isWeeklyInsideBar(weeks, 0)
      if (hit) return { score: 100, confirmed: true }
      if (weeks.length < 2) return { score: 0, confirmed: false }
      const baby = weeks[0]
      const mother = weeks[1]
      const partial = scoreFromFlags([
        baby.h <= mother.h && baby.l >= mother.l,
        baby.h - baby.l < 0.5 * (mother.h - mother.l),
        (baby.v ?? 0) < (mother.v ?? 0),
      ])
      return { score: contextOk ? partial : Math.min(partial, 50), confirmed: false }
    }
    case 'double-inside-bar': {
      const inside0 = weeks.length >= 2 && isWeeklyInsideBar(weeks, 0)
      const inside1 = weeks.length >= 3 && isWeeklyInsideBar(weeks, 1)
      if (inside0 && inside1) return { score: 100, confirmed: true }
      const partial = scoreFromFlags([inside0, inside1, contextOk])
      return { score: partial >= 67 ? 85 : partial, confirmed: false }
    }
    case 'double-hammer': {
      const h0 = weeks.length >= 1 && isWeeklyHammer(weeks, 0)
      const h1 = weeks.length >= 2 && isWeeklyHammer(weeks, 1)
      if (h0 && h1) return { score: 100, confirmed: true }
      const partial = scoreFromFlags([h0, h1, contextOk])
      return { score: partial >= 67 ? 85 : partial, confirmed: false }
    }
    default:
      return { score: 0, confirmed: false }
  }
}

export function livermoreAlertScore(
  patternId: string,
  scores: LivermoreScores,
  ctx: { from52wHigh: number; relativeVolume: number },
): PatternAlertScore {
  const confirmed = livermorePatternMatch(patternId, scores)
  if (confirmed) return { score: 100, confirmed: true }

  switch (patternId) {
    case 'livermore-dashboard':
      return { score: scores.finalScore, confirmed: false }
    case 'livermore-elite-setup':
      return {
        score: scoreFromFlags([
          scores.accumulation > 80,
          scores.liquidityGrab > 70,
          ctx.from52wHigh >= -10,
          scores.emaStack,
          ctx.relativeVolume > 1.5,
        ]),
        confirmed: false,
      }
    case 'livermore-accumulation':
      return { score: scores.accumulation, confirmed: false }
    case 'livermore-accumulation-strong':
      return { score: clampScore((scores.accumulation / 85) * 100), confirmed: false }
    case 'livermore-liquidity-grab':
      return { score: scores.liquidityGrab, confirmed: false }
    case 'livermore-liquidity-strong':
      return { score: clampScore((scores.liquidityGrab / 80) * 100), confirmed: false }
    case 'livermore-pivot-breakout':
      return {
        score: scoreFromFlags([
          scores.breakout >= 34,
          scores.volumeRatio > 1.5,
          scores.rsSpread20 > 0,
        ]),
        confirmed: false,
      }
    default:
      return { score: 0, confirmed: false }
  }
}

const snapshotPartialChecks: Record<
  string,
  (s: StockMetrics, ctx: SnapshotScanContext) => boolean[]
> = {
  'star-3m': (s) => [s.star],
  'rs-leader': (s) => [(s.rs ?? 0) >= 50, (s.rs ?? 0) >= 60, (s.rs ?? 0) >= 70],
  'momentum-thrust': (s, ctx) => [s.m3 > 5, s.m3 > 8, s.m1 > 0, vsIndex3m(s, ctx.indexM3) > 5],
  'rs-laggard': (s) => [(s.rs ?? 0) < 50, (s.rs ?? 0) < 40, s.m3 < 0],
  'volume-surge-long': (s) => [
    (s.relativeVolume ?? 0) >= 1.5,
    (s.relativeVolume ?? 0) >= 2,
    s.m1 > 0,
    s.above20ma,
  ],
  'volume-breakdown': (s) => [
    (s.relativeVolume ?? 0) >= 1.5,
    (s.relativeVolume ?? 0) >= 2,
    s.m1 < 0,
  ],
  'dollar-flow': (s, ctx) => [
    (s.relativeVolume ?? 0) >= 1.2,
    (s.relativeVolume ?? 0) >= 1.5,
    (s.dollarVolume ?? 0) >= ctx.dollarVolP90 * 0.8,
    (s.dollarVolume ?? 0) >= ctx.dollarVolP90,
  ],
  'triple-ma-stack': (s) => [s.above20ma, s.above50ma, s.above200ma],
  'ma-reset': (s) => [s.above50ma, s.m1 > 0, s.m3 > 0, s.from52wHigh > -8],
  'near-52w-high': (s) => [s.above50ma, s.from52wHigh >= -8, s.from52wHigh >= -3],
  'below-200-warning': (s) => [!s.above200ma, s.m3 < 0],
  'bullish-mood': (s, ctx) => {
    const v = vsIndex3m(s, ctx.indexM3)
    return [v > 0, v > 2, s.above20ma]
  },
  'bearish-mood': (s, ctx) => {
    const v = vsIndex3m(s, ctx.indexM3)
    return [v < 0, v < -2, !s.above20ma]
  },
  'early-cycle': (s, ctx) => [
    s.cycle === 'early',
    vsIndex3m(s, ctx.indexM3) >= 0,
    vsIndex3m(s, ctx.indexM3) >= 2,
  ],
  'mid-cycle-leader': (s) => [
    s.cycle === 'mid',
    (s.rs ?? 0) >= 50,
    (s.rs ?? 0) >= 60,
    s.above50ma,
  ],
  'late-extended': (s) => [
    s.cycle === 'late',
    s.from52wHigh > -10,
    s.from52wHigh > -5,
    s.m1 < 2,
  ],
  'rsi-oversold-bounce': (s) => [
    (s.rsi ?? 50) <= 40,
    (s.rsi ?? 50) <= 35,
    s.above200ma,
  ],
  'rsi-overbought': (s) => [(s.rsi ?? 50) >= 60, (s.rsi ?? 50) >= 70],
}

export function snapshotAlertScore(
  patternId: string,
  stock: StockMetrics,
  ctx: SnapshotScanContext,
): PatternAlertScore {
  const confirmed = evaluateSpecialPattern(patternId, stock, ctx)
  if (confirmed) return { score: 100, confirmed: true }
  const checks = snapshotPartialChecks[patternId]
  if (!checks) return { score: 0, confirmed: false }
  return { score: scoreFromFlags(checks(stock, ctx)), confirmed: false }
}

const DAILY_SCAN_PATTERNS = [...VCP_PATTERNS, ...LAUNCHPAD_PATTERNS, ...LANDSCAPE_PATTERNS]

export function collectOhlcPatternUploadRows(
  ticker: string,
  ohlc: OhlcBar[],
  scores: LivermoreScores | null,
  livermoreCtx: { from52wHigh: number; relativeVolume: number },
  scanCtx: OhlcScanContext,
  dailyScanned?: PatternScanResult[],
): PatternScanUploadRow[] {
  const rows: PatternScanUploadRow[] = []
  const key = ticker.toUpperCase()

  if (scores) {
    for (const p of LIVERMORE_PATTERNS) {
      const { score, confirmed } = livermoreAlertScore(p.id, scores, livermoreCtx)
      if (score >= 60) {
        rows.push({ ticker: key, patternId: p.id, score, confirmed })
      }
    }
  }

  for (const p of KARTHIK_WEEKLY_PATTERNS) {
    const { score, confirmed } = karthikAlertScore(ohlc, p.id as KarthikPatternId)
    if (score >= 60) {
      rows.push({ ticker: key, patternId: p.id, score, confirmed })
    }
  }

  const scanned = dailyScanned ?? scanOhlcForSpecialPatterns(ohlc, DAILY_SCAN_PATTERNS, scanCtx)
  for (const s of scanned) {
    if (s.score >= 60) {
      rows.push({
        ticker: key,
        patternId: s.patternId,
        score: s.score,
        confirmed: s.confirmed,
      })
    }
  }

  return rows
}

export function collectSnapshotPatternUploadRows(
  stocks: StockMetrics[],
  indexM3: number,
  minScore = 60,
): PatternScanUploadRow[] {
  const ctx = buildSpecialScanContext(stocks, indexM3)
  const rows: PatternScanUploadRow[] = []
  for (const stock of stocks) {
    const key = stock.ticker.toUpperCase()
    for (const p of SNAPSHOT_PATTERN_CATALOG) {
      const { score, confirmed } = snapshotAlertScore(p.id, stock, ctx)
      if (score >= minScore) {
        rows.push({ ticker: key, patternId: p.id, score, confirmed })
      }
    }
  }
  return rows
}
