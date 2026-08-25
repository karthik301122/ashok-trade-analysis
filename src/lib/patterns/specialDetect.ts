import type { StockMetrics } from '../../data/types'
import { classifyMood } from '../market'
import type { SpecialPatternDef } from './specialCatalog'
import { SNAPSHOT_PATTERN_CATALOG } from './specialCatalog'

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

export function evaluateSpecialPattern(
  patternId: string,
  stock: StockMetrics,
  ctx: SpecialScanContext,
): boolean {
  const fn = evaluators[patternId]
  return fn ? fn(stock, ctx) : false
}

export function buildSpecialScanContext(stocks: StockMetrics[], indexM3: number): SpecialScanContext {
  const vols = stocks.map((s) => s.dollarVolume ?? 0).filter((v) => v > 0).sort((a, b) => a - b)
  const p90Idx = vols.length ? Math.floor(vols.length * 0.9) : 0
  return {
    indexM3,
    dollarVolP90: vols[p90Idx] ?? 0,
  }
}

export function scanSpecialPattern(
  pattern: SpecialPatternDef,
  stocks: StockMetrics[],
  ctx: SpecialScanContext,
): SpecialPatternHit[] {
  const fn = evaluators[pattern.id]
  if (!fn) return []
  return stocks
    .filter((s) => fn(s, ctx))
    .map((s) => ({
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
    }))
    .sort((a, b) => b.m3 - a.m3)
}

export function scanAllSpecialPatterns(
  stocks: StockMetrics[],
  indexM3: number,
): { pattern: SpecialPatternDef; hits: SpecialPatternHit[]; count: number }[] {
  const ctx = buildSpecialScanContext(stocks, indexM3)
  return SNAPSHOT_PATTERN_CATALOG.map((pattern) => {
    const hits = scanSpecialPattern(pattern, stocks, ctx)
    return { pattern, hits, count: hits.length }
  })
}
