import { ASX_UNIVERSE } from '../data/universe'
import type {
  CycleStage,
  IndustryMetrics,
  MarketSnapshot,
  Mood,
  PerfBundle,
  SectorMetrics,
  StockMetrics,
  StockRaw,
} from '../data/types'

/** Deterministic pseudo-random from string */
function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rnd(seed: number, i = 0): number {
  const x = Math.sin(seed * 0.0001 + i * 12.9898) * 43758.5453
  return x - Math.floor(x)
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

export function round1(n: number) {
  return Math.round(n * 10) / 10
}

/** Sector bias — Australian market flavour mid-2020s style */
const SECTOR_BIAS: Record<string, number> = {
  'Health Technology': 12,
  'Health Services': 8,
  'Technology Services': 10,
  'Electronic Technology': 6,
  'Retail Trade': 4,
  'Consumer Services': 5,
  'Non-Energy Minerals': 3,
  'Energy Minerals': -2,
  Finance: 1,
  Utilities: 2,
  Transportation: 3,
  'Industrial Services': 2,
  'Process Industries': 1,
  'Consumer Non-Durables': -1,
  'Distribution Services': 4,
  'Producer Manufacturing': 2,
  Communications: -3,
  'Commercial Services': 3,
}

const INDUSTRY_BIAS: Record<string, number> = {
  Biotechnology: 14,
  'Medical Specialties': 11,
  'Packaged Software': 12,
  'Internet Software/Services': 10,
  'Precious Metals': 8,
  Restaurants: 9,
  'Electronics/Appliance Stores': 7,
  'Specialty Stores': 5,
  Coal: -8,
  'Major Telecommunications': -4,
  'Real Estate Investment Trusts': -2,
  'Major Banks': 2,
  Airlines: 6,
  'Oil & Gas Production': -3,
  Semiconductors: 4,
  'Data Processing Services': 8,
}

function makePerf(stock: StockRaw, indexM3: number): PerfBundle {
  const seed = hash(stock.ticker + '|asx26')
  const sectorBias = SECTOR_BIAS[stock.sector] ?? 0
  const industryBias = INDUSTRY_BIAS[stock.industry] ?? 0
  const idiosyncratic = (rnd(seed, 1) - 0.45) * 28
  const m3 = round1(sectorBias * 0.55 + industryBias * 0.35 + idiosyncratic)

  const m1 = round1(m3 * (0.25 + rnd(seed, 2) * 0.35) + (rnd(seed, 3) - 0.5) * 6)
  const w1 = round1(m1 * (0.2 + rnd(seed, 4) * 0.4) + (rnd(seed, 5) - 0.5) * 3)
  const d1 = round1((rnd(seed, 6) - 0.48) * 3.2)
  const m6 = round1(m3 * (1.4 + rnd(seed, 7) * 0.8) + (rnd(seed, 8) - 0.5) * 8)
  const y1 = round1(m6 * (1.2 + rnd(seed, 9) * 0.9) + (rnd(seed, 10) - 0.5) * 12)
  const y5 = round1(y1 * (2.2 + rnd(seed, 11) * 2.5) + (rnd(seed, 12) - 0.3) * 40)

  const from52wHigh = round1(-rnd(seed, 13) * (m3 > 8 ? 8 : 22) - (m3 < 0 ? 8 : 0))
  const above200ma = m3 > -2 && rnd(seed, 14) > 0.28
  const above50ma = m1 > -1 && rnd(seed, 15) > 0.32
  const above21ema = w1 > -0.5 && rnd(seed, 16) > 0.35
  const above20ma = above21ema

  // RS 0-100 vs market
  const rawRs = 50 + (m3 - indexM3) * 2.2 + (rnd(seed, 17) - 0.5) * 10
  const rs = Math.round(clamp(rawRs, 5, 100))

  const spark: number[] = []
  let v = 100
  for (let i = 0; i < 24; i++) {
    v += (m3 / 24) * 0.4 + (rnd(seed, 20 + i) - 0.48) * 2.2
    spark.push(round1(v))
  }

  return {
    d1,
    w1,
    m1,
    m3,
    m6,
    y1,
    y5,
    from52wHigh,
    above200ma,
    above50ma,
    above21ema,
    above20ma,
    rs,
    spark,
  }
}

export function classifyCycle(perf: PerfBundle, vsIndex3m: number): CycleStage {
  if (vsIndex3m >= 8 && perf.m1 > 0 && perf.above50ma) return 'mid'
  if (vsIndex3m >= 2 && perf.m3 > 0 && !perf.above200ma) return 'early'
  if (vsIndex3m >= 0 && perf.from52wHigh > -6 && perf.m1 < 2) return 'late'
  if (vsIndex3m < -4 || (!perf.above200ma && perf.m3 < 0)) return 'recession'
  if (vsIndex3m > 3) return 'mid'
  if (vsIndex3m > -1) return 'early'
  return 'late'
}

export function classifyMood(perf: PerfBundle, vsIndex3m: number): Mood {
  const score =
    (perf.m1 > 0 ? 1 : -1) +
    (perf.m3 > 0 ? 1 : -1) +
    (vsIndex3m > 0 ? 1 : -1) +
    (perf.above50ma ? 1 : -1)
  if (score >= 2) return 'bullish'
  if (score <= -2) return 'bearish'
  return 'neutral'
}

export function avgPerf(items: PerfBundle[], weights: number[]): PerfBundle {
  const tw = weights.reduce((a, b) => a + b, 0) || 1
  const pick = (k: keyof PerfBundle) => {
    if (typeof items[0]?.[k] === 'boolean') {
      const n = items.reduce((s, it, i) => s + (it[k] ? weights[i] : 0), 0)
      return n / tw > 0.5
    }
    if (k === 'spark') {
      const len = items[0]?.spark.length ?? 24
      return Array.from({ length: len }, (_, i) =>
        round1(items.reduce((s, it, j) => s + (it.spark[i] ?? 100) * weights[j], 0) / tw),
      )
    }
    return round1(items.reduce((s, it, i) => s + (Number(it[k]) || 0) * weights[i], 0) / tw)
  }
  return {
    d1: pick('d1') as number,
    w1: pick('w1') as number,
    m1: pick('m1') as number,
    m3: pick('m3') as number,
    m6: pick('m6') as number,
    y1: pick('y1') as number,
    y5: pick('y5') as number,
    from52wHigh: pick('from52wHigh') as number,
    above200ma: pick('above200ma') as boolean,
    above50ma: pick('above50ma') as boolean,
    above21ema: pick('above21ema') as boolean,
    above20ma: pick('above20ma') as boolean,
    rs: Math.round(pick('rs') as number),
    spark: pick('spark') as number[],
  }
}

export function buildMarketSnapshot(asOf = new Date()): MarketSnapshot {
  const indexSeed = hash('XJO|benchmark')
  const benchmarkPerf: PerfBundle = {
    d1: round1((rnd(indexSeed, 1) - 0.5) * 1.2),
    w1: round1((rnd(indexSeed, 2) - 0.45) * 2.5),
    m1: round1(1.2 + (rnd(indexSeed, 3) - 0.4) * 3),
    m3: round1(4.8 + (rnd(indexSeed, 4) - 0.4) * 4),
    m6: round1(7.5 + (rnd(indexSeed, 5) - 0.4) * 5),
    y1: round1(11 + (rnd(indexSeed, 6) - 0.4) * 8),
    y5: round1(42 + (rnd(indexSeed, 7) - 0.3) * 20),
    from52wHigh: round1(-3 - rnd(indexSeed, 8) * 4),
    above200ma: true,
    above50ma: true,
    above21ema: true,
    above20ma: true,
    rs: 50,
    spark: Array.from({ length: 24 }, (_, i) =>
      round1(100 + i * 0.35 + (rnd(indexSeed, 30 + i) - 0.5) * 1.5),
    ),
  }

  const stockMetrics: StockMetrics[] = ASX_UNIVERSE.map((s) => {
    const perf = makePerf(s, benchmarkPerf.m3)
    const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
    const cycle = classifyCycle(perf, vsIndex3m)
    const mood = classifyMood(perf, vsIndex3m)
    const seed = hash(s.ticker + '|vol')
    // Demo proxy: larger weight → higher typical turnover
    const avgVolume20 = Math.round((80_000 + s.weight * 2_400_000) * (0.6 + rnd(seed, 1) * 1.2))
    const relativeVolume = round1(0.5 + rnd(seed, 2) * 2.8)
    const volume = Math.round(avgVolume20 * relativeVolume)
    const priceProxy = 0.5 + rnd(seed, 3) * 80
    const dollarVolume = Math.round(volume * priceProxy)
    return {
      ...s,
      ...perf,
      mood,
      cycle,
      vsSector: { w1: false, m1: false, m3: false },
      vsIndex: {
        w1: perf.w1 > benchmarkPerf.w1,
        m1: perf.m1 > benchmarkPerf.m1,
        m3: perf.m3 > benchmarkPerf.m3,
      },
      star: false,
      score: perf.rs,
      volume,
      avgVolume20,
      relativeVolume,
      dollarVolume,
    }
  })

  // Industry aggregates
  const byIndustry = new Map<string, StockMetrics[]>()
  for (const s of stockMetrics) {
    const list = byIndustry.get(s.industry) ?? []
    list.push(s)
    byIndustry.set(s.industry, list)
  }

  const industries: IndustryMetrics[] = [...byIndustry.entries()].map(([name, stocks]) => {
    const weights = stocks.map((s) => s.weight)
    const perf = avgPerf(stocks, weights)
    const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
    const cycle = classifyCycle(perf, vsIndex3m)
    const mood = classifyMood(perf, vsIndex3m)
    const tw = weights.reduce((a, b) => a + b, 0)

    // Fill vsSector for stocks
    for (const s of stocks) {
      s.vsSector = {
        w1: s.w1 > perf.w1,
        m1: s.m1 > perf.m1,
        m3: s.m3 > perf.m3,
      }
      // Star = outperforming ASX200 over the last 3 months
      s.star = s.vsIndex.m3
      s.cycle = classifyCycle(s, s.m3 - benchmarkPerf.m3)
      s.mood = classifyMood(s, s.m3 - benchmarkPerf.m3)
    }

    return {
      name,
      sector: stocks[0].sector,
      weight: round1(tw),
      mood,
      cycle,
      stocks: stocks.sort((a, b) => b.weight - a.weight),
      perf,
      vsIndex3m,
      pctAbove200ma: round1((stocks.filter((s) => s.above200ma).length / stocks.length) * 100),
      pctAbove50ma: round1((stocks.filter((s) => s.above50ma).length / stocks.length) * 100),
      pctAbove21ema: round1((stocks.filter((s) => s.above21ema).length / stocks.length) * 100),
      pctAbove20ma: round1((stocks.filter((s) => s.above20ma).length / stocks.length) * 100),
      avgRs: Math.round(stocks.reduce((a, s) => a + s.rs, 0) / stocks.length),
      pctNear52w: round1(
        (stocks.filter((s) => Math.abs(s.from52wHigh) <= 5).length / stocks.length) * 100,
      ),
      starCount: stocks.filter((s) => s.star).length,
    }
  })

  // Sector aggregates
  const bySector = new Map<string, IndustryMetrics[]>()
  for (const ind of industries) {
    const list = bySector.get(ind.sector) ?? []
    list.push(ind)
    bySector.set(ind.sector, list)
  }

  const sectors: SectorMetrics[] = [...bySector.entries()].map(([name, inds]) => {
    const stocks = inds.flatMap((i) => i.stocks)
    const weights = stocks.map((s) => s.weight)
    const perf = avgPerf(stocks, weights)
    const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
    const cycle = classifyCycle(perf, vsIndex3m)
    const mood = classifyMood(perf, vsIndex3m)
    const tw = weights.reduce((a, b) => a + b, 0)
    return {
      name,
      weight: round1(tw),
      mood,
      cycle,
      industries: inds.sort((a, b) => b.weight - a.weight),
      stocks: stocks.sort((a, b) => b.weight - a.weight),
      perf,
      vsIndex3m,
      pctAbove200ma: round1((stocks.filter((s) => s.above200ma).length / stocks.length) * 100),
      pctAbove50ma: round1((stocks.filter((s) => s.above50ma).length / stocks.length) * 100),
      pctAbove21ema: round1((stocks.filter((s) => s.above21ema).length / stocks.length) * 100),
      pctAbove20ma: round1((stocks.filter((s) => s.above20ma).length / stocks.length) * 100),
      avgRs: Math.round(stocks.reduce((a, s) => a + s.rs, 0) / stocks.length),
      pctNear52w: round1(
        (stocks.filter((s) => Math.abs(s.from52wHigh) <= 5).length / stocks.length) * 100,
      ),
      starCount: stocks.filter((s) => s.star).length,
    }
  })

  sectors.sort((a, b) => b.weight - a.weight)
  industries.sort((a, b) => b.perf.m3 - a.perf.m3)

  const moodCounts = {
    bullish: industries.filter((i) => i.mood === 'bullish').length,
    neutral: industries.filter((i) => i.mood === 'neutral').length,
    bearish: industries.filter((i) => i.mood === 'bearish').length,
  }

  return {
    asOf: asOf.toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    benchmark: 'ASX200',
    benchmarkPerf,
    sectors,
    industries,
    stocks: stockMetrics,
    moodCounts,
  }
}

export const CYCLE_LABEL: Record<CycleStage, { short: string; action: string; color: string }> = {
  early: { short: 'EARLY', action: 'Accumulate', color: '#16a34a' },
  mid: { short: 'MID', action: 'Hold / Add', color: '#2563eb' },
  late: { short: 'LATE', action: 'Reduce', color: '#ea580c' },
  recession: { short: 'EXIT', action: 'Exit', color: '#dc2626' },
}

export const MOOD_LABEL: Record<Mood, { label: string; className: string }> = {
  bullish: { label: 'Bullish', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
  neutral: { label: 'Neutral', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  bearish: { label: 'Bearish', className: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' },
}
