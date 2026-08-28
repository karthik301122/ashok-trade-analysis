import type {
  IndustryMetrics,
  MarketSnapshot,
  SectorMetrics,
  StockMetrics,
} from '../data/types'
import { avgPerf, classifyCycle, classifyMood, round1 } from './market'

export const INSTRUMENT_COMMON_STOCK = 'Common Stock'

/** True for ordinary equities; missing type treated as common stock (legacy universe). */
export function isCommonStock(s: { instrumentType?: string }): boolean {
  const t = s.instrumentType
  return t === undefined || t === INSTRUMENT_COMMON_STOCK
}

export function filterCommonStocks(stocks: StockMetrics[]): StockMetrics[] {
  return stocks.filter(isCommonStock)
}

function industryAgg(
  name: string,
  stocks: StockMetrics[],
  benchmarkPerf: MarketSnapshot['benchmarkPerf'],
): IndustryMetrics {
  const weights = stocks.map((s) => s.weight)
  const perf = avgPerf(stocks, weights)
  const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
  const tw = weights.reduce((a, b) => a + b, 0)

  for (const s of stocks) {
    s.vsSector = {
      w1: s.w1 > perf.w1,
      m1: s.m1 > perf.m1,
      m3: s.m3 > perf.m3,
    }
    s.star = s.vsIndex.m3
    s.cycle = classifyCycle(s, s.m3 - benchmarkPerf.m3)
    s.mood = classifyMood(s, s.m3 - benchmarkPerf.m3)
  }

  return {
    name,
    sector: stocks[0].sector,
    weight: round1(tw),
    mood: classifyMood(perf, vsIndex3m),
    cycle: classifyCycle(perf, vsIndex3m),
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
}

function sectorAgg(
  name: string,
  industries: IndustryMetrics[],
  benchmarkPerf: MarketSnapshot['benchmarkPerf'],
): SectorMetrics {
  const stocks = industries.flatMap((i) => i.stocks)
  const weights = stocks.map((s) => s.weight)
  const perf = avgPerf(stocks, weights)
  const vsIndex3m = round1(perf.m3 - benchmarkPerf.m3)
  const tw = weights.reduce((a, b) => a + b, 0)
  return {
    name,
    weight: round1(tw),
    mood: classifyMood(perf, vsIndex3m),
    cycle: classifyCycle(perf, vsIndex3m),
    industries: industries.sort((a, b) => b.weight - a.weight),
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
}

/** Rebuild sector/industry tree from a stock subset; benchmark perf unchanged. */
export function rebuildSnapshotFromStocks(
  base: MarketSnapshot,
  stockMetrics: StockMetrics[],
): MarketSnapshot {
  const benchmarkPerf = base.benchmarkPerf
  const stocks = stockMetrics.map((s) => ({
    ...s,
    vsSector: { ...s.vsSector },
    vsIndex: { ...s.vsIndex },
    spark: [...s.spark],
  }))

  const byIndustry = new Map<string, StockMetrics[]>()
  for (const s of stocks) {
    const list = byIndustry.get(s.industry) ?? []
    list.push(s)
    byIndustry.set(s.industry, list)
  }

  const industries: IndustryMetrics[] = [...byIndustry.entries()].map(([name, indStocks]) =>
    industryAgg(name, indStocks, benchmarkPerf),
  )

  const bySector = new Map<string, IndustryMetrics[]>()
  for (const ind of industries) {
    const list = bySector.get(ind.sector) ?? []
    list.push(ind)
    bySector.set(ind.sector, list)
  }

  const sectors: SectorMetrics[] = [...bySector.entries()].map(([name, inds]) =>
    sectorAgg(name, inds, benchmarkPerf),
  )

  sectors.sort((a, b) => b.weight - a.weight)
  industries.sort((a, b) => b.perf.m3 - a.perf.m3)

  return {
    asOf: base.asOf,
    benchmark: base.benchmark,
    benchmarkPerf,
    sectors,
    industries,
    stocks,
    moodCounts: {
      bullish: industries.filter((i) => i.mood === 'bullish').length,
      neutral: industries.filter((i) => i.mood === 'neutral').length,
      bearish: industries.filter((i) => i.mood === 'bearish').length,
    },
  }
}

export function applyStocksOnlyFilter(snapshot: MarketSnapshot, stocksOnly: boolean): MarketSnapshot {
  if (!stocksOnly) return snapshot
  return rebuildSnapshotFromStocks(snapshot, filterCommonStocks(snapshot.stocks))
}

export const STOCKS_ONLY_LS_KEY = 'asx-stocks-only'
