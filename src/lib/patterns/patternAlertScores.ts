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
import { buildSpecialScanContext, snapshotAlertScore } from './specialDetect'
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
import { blendScores, clampScore, rampDown, rampUp } from './patternFormingScore'
import type { PatternScanUploadRow } from '../patternScanApi'

export type PatternAlertScore = { score: number; confirmed: boolean }

function barRange(b: OhlcBar): number {
  return Math.max(b.h - b.l, 1e-9)
}

/** Continuous Stage-2 quality from MA stack + rising slopes + price location. */
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
  const stack10 = (ma10 - ma30) / Math.max(Math.abs(ma30), 1e-9)
  const stack30 = (ma30 - ma40) / Math.max(Math.abs(ma40), 1e-9)
  const rise30 = (ma30 - ma30Prev) / Math.max(Math.abs(ma30Prev), 1e-9)
  const rise40 = (ma40 - ma40Prev) / Math.max(Math.abs(ma40Prev), 1e-9)
  const above10 = (c - ma10) / Math.max(Math.abs(ma10), 1e-9)
  const above30 = (c - ma30) / Math.max(Math.abs(ma30), 1e-9)
  const above40 = (c - ma40) / Math.max(Math.abs(ma40), 1e-9)
  return blendScores([
    { score: rampUp(stack10, 0, 0.02), weight: 1.2 },
    { score: rampUp(stack30, 0, 0.02), weight: 1.2 },
    { score: rampUp(rise30, 0, 0.01), weight: 1 },
    { score: rampUp(rise40, 0, 0.01), weight: 1 },
    { score: rampUp(above10, 0, 0.02), weight: 1 },
    { score: rampUp(above30, 0, 0.02), weight: 1 },
    { score: rampUp(above40, 0, 0.03), weight: 1 },
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

/** Inside-bar quality from containment + range compression + volume dry-up. */
function weeklyInsideBarFormingScore(baby: OhlcBar, mother: OhlcBar): number {
  const contained = baby.h <= mother.h && baby.l >= mother.l
  const rangeRatio = barRange(baby) / barRange(mother)
  const mv = mother.v ?? 0
  const bv = baby.v ?? 0
  const volRatio = mv > 0 ? bv / mv : bv > 0 ? 1 : 0
  return blendScores([
    { score: contained ? 100 : 0, weight: 1.4 },
    { score: rampDown(rangeRatio, 0.5, 1), weight: 1.6 },
    { score: rampDown(volRatio, 0.75, 1.05), weight: 1 },
  ])
}

/** Hammer quality from lower-wick dominance + small upper wick + prior down week. */
function weeklyHammerFormingScore(weeks: OhlcBar[], i: number): number {
  if (i < 0 || i >= weeks.length) return 0
  const b = weeks[i]
  const body = Math.abs(b.c - b.o)
  const rng = barRange(b)
  const lw = Math.min(b.o, b.c) - b.l
  const uw = b.h - Math.max(b.o, b.c)
  const prior = weeks[i + 1]
  const wickVsBody = lw / Math.max(body, rng * 0.02)
  const upperFrac = uw / rng
  const closeInTop = (Math.max(b.o, b.c) - b.l) / rng
  return blendScores([
    { score: rampUp(wickVsBody, 1, 2), weight: 1.5 },
    { score: rampDown(upperFrac, 0.08, 0.35), weight: 1.2 },
    { score: rampUp(closeInTop, 0.55, 0.72), weight: 1 },
    { score: prior && prior.c > b.c ? 100 : prior ? 35 : 0, weight: 1 },
  ])
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
    const contextProgress = blendScores([
      { score: stage2 ? 100 : stage2WeeklyProgress(weeks, 0), weight: 1.2 },
      { score: rampUp(rally ?? 0, 10, 30), weight: 1 },
    ])
    if (contextProgress < 34) return { score: contextProgress, confirmed: false }
  }

  switch (patternId) {
    case 'three-weeks-tight': {
      const formed = detectThreeWeeksTight(daily)
      if (formed.hit) return { score: 100, confirmed: true }
      const score = tightnessFormingScore(formed.tightness)
      if (!contextOk && score > 0) return { score: Math.min(score, 55), confirmed: false }
      return { score, confirmed: false }
    }
    case 'weekly-inside-bar': {
      if (isWeeklyInsideBar(weeks, 0)) return { score: 100, confirmed: true }
      if (weeks.length < 2) return { score: 0, confirmed: false }
      const score = weeklyInsideBarFormingScore(weeks[0], weeks[1])
      return { score: contextOk ? score : Math.min(score, 55), confirmed: false }
    }
    case 'double-inside-bar': {
      if (weeks.length >= 3 && isWeeklyInsideBar(weeks, 0) && isWeeklyInsideBar(weeks, 1)) {
        return { score: 100, confirmed: true }
      }
      if (weeks.length < 3) return { score: 0, confirmed: false }
      const s0 = weeklyInsideBarFormingScore(weeks[0], weeks[1])
      const s1 = weeklyInsideBarFormingScore(weeks[1], weeks[2])
      const score = blendScores([
        { score: s0, weight: 1 },
        { score: s1, weight: 1 },
        { score: contextOk ? 100 : 40, weight: 0.4 },
      ])
      return { score, confirmed: false }
    }
    case 'double-hammer': {
      if (weeks.length >= 2 && isWeeklyHammer(weeks, 0) && isWeeklyHammer(weeks, 1)) {
        return { score: 100, confirmed: true }
      }
      const s0 = weeklyHammerFormingScore(weeks, 0)
      const s1 = weeklyHammerFormingScore(weeks, 1)
      const score = blendScores([
        { score: s0, weight: 1 },
        { score: s1, weight: 1 },
        { score: contextOk ? 100 : 40, weight: 0.35 },
      ])
      return { score, confirmed: false }
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
      return { score: clampScore(scores.finalScore), confirmed: false }
    case 'livermore-elite-setup':
      return {
        score: blendScores([
          { score: rampUp(scores.accumulation, 60, 85), weight: 1.3 },
          { score: rampUp(scores.liquidityGrab, 50, 80), weight: 1.2 },
          { score: rampUp(ctx.from52wHigh, -20, -5), weight: 0.8 },
          { score: scores.emaStack ? 100 : 25, weight: 0.9 },
          { score: rampUp(ctx.relativeVolume, 1, 1.8), weight: 0.8 },
        ]),
        confirmed: false,
      }
    case 'livermore-accumulation':
      return { score: clampScore(scores.accumulation), confirmed: false }
    case 'livermore-accumulation-strong':
      return { score: clampScore((scores.accumulation / 85) * 100), confirmed: false }
    case 'livermore-liquidity-grab':
      return { score: clampScore(scores.liquidityGrab), confirmed: false }
    case 'livermore-liquidity-strong':
      return { score: clampScore((scores.liquidityGrab / 80) * 100), confirmed: false }
    case 'livermore-pivot-breakout':
      return {
        score: blendScores([
          { score: rampUp(scores.breakout, 10, 50), weight: 1.4 },
          { score: rampUp(scores.volumeRatio, 1, 2), weight: 1 },
          { score: rampUp(scores.rsSpread20, -2, 4), weight: 1 },
        ]),
        confirmed: false,
      }
    default:
      return { score: 0, confirmed: false }
  }
}

const DAILY_SCAN_PATTERNS = [...VCP_PATTERNS, ...LAUNCHPAD_PATTERNS, ...LANDSCAPE_PATTERNS]

export { snapshotAlertScore }

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
