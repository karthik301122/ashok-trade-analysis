import type { StockMetrics } from '../../data/types'
import { classifyMood } from '../market'
import type { SpecialPatternDef } from './specialCatalog'
import { SNAPSHOT_PATTERN_CATALOG } from './specialCatalog'
import { scoreFromFlags } from './patternFormingScore'
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

const snapshotPartialChecks: Record<
  string,
  (s: StockMetrics, ctx: SpecialScanContext) => boolean[]
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
  const checks = snapshotPartialChecks[patternId]
  if (!checks) return { score: 0, confirmed: false }
  return { score: scoreFromFlags(checks(stock, ctx)), confirmed: false }
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
