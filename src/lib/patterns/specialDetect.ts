import type { StockMetrics } from '../../data/types'
import { classifyMood } from '../market'
import type { SpecialPatternDef } from './specialCatalog'
import { SNAPSHOT_PATTERN_CATALOG } from './specialCatalog'
import { blendScores, clampScore, rampDown, rampUp } from './patternFormingScore'
import { rankPatternHitsByScore } from './rankPatternHits'

export type SpecialScanContext = {
  indexM3: number
  /** 90th percentile dollar volume in loaded universe */
  dollarVolP90: number
}

export type SpecialPatternHit = {
  patternId: string
  patternName: string
  bias: SpecialPatternDef['bias']
  ticker: string
  name: string
  sector: string
  industry: string
  /** Snapshot values useful in the results table */
  rs: number
  m3: number
  relativeVolume: number
  rsi: number
  lastPrice: number
  /** 0–100 pattern score */
  score: number
  confirmed: boolean
}

function vsIndex3m(stock: StockMetrics, indexM3: number): number {
  return stock.m3 - indexM3
}

function moodScore(stock: StockMetrics, indexM3: number): number {
  const mood = classifyMood(stock, vsIndex3m(stock, indexM3))
  if (mood === 'bullish') return 2
  if (mood === 'bearish') return -2
  return 0
}

const evaluators: Record<string, (s: StockMetrics, ctx: SpecialScanContext) => boolean> = {
  'star-3m': (s) => s.star,
  'rs-leader': (s) => (s.rs ?? 0) >= 70,
  'momentum-thrust': (s, ctx) =>
    s.m3 > 8 && s.m1 > 0 && vsIndex3m(s, ctx.indexM3) > 5,
  'rs-laggard': (s) => (s.rs ?? 0) < 40 && s.m3 < 0,
  'volume-surge-long': (s) =>
    (s.relativeVolume ?? 0) >= 2 && s.m1 > 0 && s.above20ma,
  'volume-breakdown': (s) => (s.relativeVolume ?? 0) >= 2 && s.m1 < 0,
  'dollar-flow': (s, ctx) =>
    (s.relativeVolume ?? 0) >= 1.5 && (s.dollarVolume ?? 0) >= ctx.dollarVolP90,
  'triple-ma-stack': (s) => s.above20ma && s.above50ma && s.above200ma,
  'ma-reset': (s) =>
    s.above50ma && s.m1 > 0 && s.m3 > 0 && s.from52wHigh > -8,
  'near-52w-high': (s) => s.from52wHigh >= -3 && s.above50ma,
  'below-200-warning': (s) => !s.above200ma && s.m3 < 0,
  'bullish-mood': (s, ctx) => moodScore(s, ctx.indexM3) >= 2,
  'bearish-mood': (s, ctx) => moodScore(s, ctx.indexM3) <= -2,
  'early-cycle': (s, ctx) => s.cycle === 'early' && vsIndex3m(s, ctx.indexM3) >= 2,
  'mid-cycle-leader': (s) => s.cycle === 'mid' && (s.rs ?? 0) >= 60 && s.above50ma,
  'late-extended': (s) => s.cycle === 'late' && s.from52wHigh > -5 && s.m1 < 2,
  'rsi-oversold-bounce': (s) => (s.rsi ?? 50) <= 35 && s.above200ma,
  'rsi-overbought': (s) => (s.rsi ?? 50) >= 70,
}

/** Continuous forming score for snapshot patterns (pattern-specific metrics). */
function snapshotFormingScore(
  patternId: string,
  s: StockMetrics,
  ctx: SpecialScanContext,
): number {
  const rs = s.rs ?? 0
  const rvol = s.relativeVolume ?? 0
  const vs = vsIndex3m(s, ctx.indexM3)
  const rsi = s.rsi ?? 50
  const dvol = s.dollarVolume ?? 0
  switch (patternId) {
    case 'star-3m':
      return s.star ? 100 : rampUp(s.m3, 0, 12)
    case 'rs-leader':
      return rampUp(rs, 40, 70)
    case 'momentum-thrust':
      return blendScores([
        { score: rampUp(s.m3, 2, 10), weight: 1.3 },
        { score: rampUp(s.m1, -1, 3), weight: 1 },
        { score: rampUp(vs, 0, 6), weight: 1.2 },
      ])
    case 'rs-laggard':
      return blendScores([
        { score: rampDown(rs, 35, 55), weight: 1.4 },
        { score: rampDown(s.m3, -8, 2), weight: 1 },
      ])
    case 'volume-surge-long':
      return blendScores([
        { score: rampUp(rvol, 1.1, 2.2), weight: 1.5 },
        { score: rampUp(s.m1, -1, 2), weight: 1 },
        { score: s.above20ma ? 100 : 20, weight: 0.8 },
      ])
    case 'volume-breakdown':
      return blendScores([
        { score: rampUp(rvol, 1.1, 2.2), weight: 1.5 },
        { score: rampDown(s.m1, -3, 1), weight: 1.2 },
      ])
    case 'dollar-flow':
      return blendScores([
        { score: rampUp(rvol, 1, 1.8), weight: 1 },
        {
          score: rampUp(dvol, ctx.dollarVolP90 * 0.5, ctx.dollarVolP90),
          weight: 1.4,
        },
      ])
    case 'triple-ma-stack':
      return blendScores([
        { score: s.above20ma ? 100 : 0, weight: 1 },
        { score: s.above50ma ? 100 : 0, weight: 1 },
        { score: s.above200ma ? 100 : 0, weight: 1 },
      ])
    case 'ma-reset':
      return blendScores([
        { score: s.above50ma ? 100 : 25, weight: 1 },
        { score: rampUp(s.m1, -2, 2), weight: 1 },
        { score: rampUp(s.m3, -2, 4), weight: 1 },
        { score: rampUp(s.from52wHigh, -20, -5), weight: 1 },
      ])
    case 'near-52w-high':
      return blendScores([
        { score: rampUp(s.from52wHigh, -15, -2), weight: 1.6 },
        { score: s.above50ma ? 100 : 30, weight: 1 },
      ])
    case 'below-200-warning':
      return blendScores([
        { score: s.above200ma ? 15 : 100, weight: 1.3 },
        { score: rampDown(s.m3, -10, 2), weight: 1 },
      ])
    case 'bullish-mood':
      return blendScores([
        { score: rampUp(vs, -2, 4), weight: 1.2 },
        { score: rampUp(s.m1, -2, 2), weight: 1 },
        { score: s.above20ma ? 100 : 25, weight: 1 },
        { score: rampUp(s.m3, -2, 5), weight: 0.8 },
      ])
    case 'bearish-mood':
      return blendScores([
        { score: rampDown(vs, -4, 2), weight: 1.2 },
        { score: rampDown(s.m1, -3, 2), weight: 1 },
        { score: s.above20ma ? 20 : 100, weight: 1 },
      ])
    case 'early-cycle':
      return blendScores([
        { score: s.cycle === 'early' ? 100 : s.cycle === 'mid' ? 35 : 10, weight: 1.4 },
        { score: rampUp(vs, -1, 4), weight: 1 },
      ])
    case 'mid-cycle-leader':
      return blendScores([
        { score: s.cycle === 'mid' ? 100 : 20, weight: 1.2 },
        { score: rampUp(rs, 45, 70), weight: 1.3 },
        { score: s.above50ma ? 100 : 25, weight: 1 },
      ])
    case 'late-extended':
      return blendScores([
        { score: s.cycle === 'late' ? 100 : 20, weight: 1.2 },
        { score: rampUp(s.from52wHigh, -15, -3), weight: 1.2 },
        { score: rampDown(s.m1, -1, 4), weight: 1 },
      ])
    case 'rsi-oversold-bounce':
      return blendScores([
        { score: rampDown(rsi, 30, 45), weight: 1.5 },
        { score: s.above200ma ? 100 : 30, weight: 1 },
      ])
    case 'rsi-overbought':
      return rampUp(rsi, 55, 75)
    default:
      return 0
  }
}

export function evaluateSpecialPattern(
  patternId: string,
  stock: StockMetrics,
  ctx: SpecialScanContext,
): boolean {
  const fn = evaluators[patternId]
  return fn ? fn(stock, ctx) : false
}

export function snapshotAlertScore(
  patternId: string,
  stock: StockMetrics,
  ctx: SpecialScanContext,
): { score: number; confirmed: boolean } {
  const confirmed = evaluateSpecialPattern(patternId, stock, ctx)
  if (confirmed) return { score: 100, confirmed: true }
  return { score: clampScore(snapshotFormingScore(patternId, stock, ctx)), confirmed: false }
}

export function buildSpecialScanContext(stocks: StockMetrics[], indexM3: number): SpecialScanContext {
  const vols = stocks.map((s) => s.dollarVolume ?? 0).filter((v) => v > 0).sort((a, b) => a - b)
  const p90Idx = vols.length ? Math.floor(vols.length * 0.9) : 0
  return {
    indexM3,
    dollarVolP90: vols[p90Idx] ?? 0,
  }
}

function toHit(
  pattern: SpecialPatternDef,
  s: StockMetrics,
  score: number,
  confirmed: boolean,
): SpecialPatternHit {
  return {
    patternId: pattern.id,
    patternName: pattern.name,
    bias: pattern.bias,
    ticker: s.ticker,
    name: s.name,
    sector: s.sector,
    industry: s.industry,
    rs: Math.round(s.rs ?? 0),
    m3: s.m3,
    relativeVolume: s.relativeVolume ?? 0,
    rsi: s.rsi ?? 50,
    lastPrice: s.lastPrice ?? 0,
    score,
    confirmed,
  }
}

export function scanSpecialPattern(
  pattern: SpecialPatternDef,
  stocks: StockMetrics[],
  ctx: SpecialScanContext,
  minScore = 60,
): SpecialPatternHit[] {
  const out: SpecialPatternHit[] = []
  for (const s of stocks) {
    const { score, confirmed } = snapshotAlertScore(pattern.id, s, ctx)
    if (score < minScore) continue
    out.push(toHit(pattern, s, score, confirmed))
  }
  return rankPatternHitsByScore(out)
}

const snapshotScanCache = new Map<
  string,
  { pattern: SpecialPatternDef; hits: SpecialPatternHit[]; count: number }[]
>()

export function scanAllSpecialPatterns(
  stocks: StockMetrics[],
  indexM3: number,
  minScore = 60,
): { pattern: SpecialPatternDef; hits: SpecialPatternHit[]; count: number }[] {
  const cacheKey = `${stocks.length}:${stocks[0]?.ticker ?? ''}:${stocks[stocks.length - 1]?.ticker ?? ''}:${indexM3}:${minScore}`
  const cached = snapshotScanCache.get(cacheKey)
  if (cached) return cached

  const ctx = buildSpecialScanContext(stocks, indexM3)
  const hitBuckets = new Map<string, SpecialPatternHit[]>()
  for (const pattern of SNAPSHOT_PATTERN_CATALOG) {
    hitBuckets.set(pattern.id, [])
  }

  for (const s of stocks) {
    for (const pattern of SNAPSHOT_PATTERN_CATALOG) {
      const { score, confirmed } = snapshotAlertScore(pattern.id, s, ctx)
      if (score < minScore) continue
      hitBuckets.get(pattern.id)!.push(toHit(pattern, s, score, confirmed))
    }
  }

  const result = SNAPSHOT_PATTERN_CATALOG.map((pattern) => {
    const hits = rankPatternHitsByScore(hitBuckets.get(pattern.id) ?? [])
    return { pattern, hits, count: hits.length }
  })

  snapshotScanCache.set(cacheKey, result)
  return result
}
