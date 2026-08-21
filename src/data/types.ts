export type CycleStage = 'early' | 'mid' | 'late' | 'recession'
export type Mood = 'bullish' | 'neutral' | 'bearish'

export interface PerfBundle {
  d1: number
  w1: number
  m1: number
  m3: number
  m6: number
  y1: number
  y5: number
  from52wHigh: number
  above200ma: boolean
  above50ma: boolean
  above21ema: boolean
  above20ma: boolean
  rs: number
  spark: number[]
}

export interface StockRaw {
  ticker: string
  name: string
  sector: string
  industry: string
  weight: number
}

export interface StockMetrics extends StockRaw, PerfBundle {
  mood: Mood
  cycle: CycleStage
  vsSector: { w1: boolean; m1: boolean; m3: boolean }
  vsIndex: { w1: boolean; m1: boolean; m3: boolean }
  star: boolean
  score: number
}

export interface IndustryMetrics {
  name: string
  sector: string
  weight: number
  mood: Mood
  cycle: CycleStage
  stocks: StockMetrics[]
  perf: PerfBundle
  vsIndex3m: number
  pctAbove200ma: number
  pctAbove50ma: number
  pctAbove21ema: number
  pctAbove20ma: number
  avgRs: number
  pctNear52w: number
  starCount: number
}

export interface SectorMetrics {
  name: string
  weight: number
  mood: Mood
  cycle: CycleStage
  industries: IndustryMetrics[]
  stocks: StockMetrics[]
  perf: PerfBundle
  vsIndex3m: number
  pctAbove200ma: number
  pctAbove50ma: number
  pctAbove21ema: number
  pctAbove20ma: number
  avgRs: number
  pctNear52w: number
  starCount: number
}

export interface MarketSnapshot {
  asOf: string
  benchmark: string
  benchmarkPerf: PerfBundle
  sectors: SectorMetrics[]
  industries: IndustryMetrics[]
  stocks: StockMetrics[]
  moodCounts: { bullish: number; neutral: number; bearish: number }
}
