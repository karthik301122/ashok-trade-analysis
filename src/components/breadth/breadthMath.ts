import type { MarketSnapshot, StockMetrics } from '../../data/types'

export type UniverseId = 'asx200' | 'asx500' | 'mid' | 'small'

export const UNIVERSES: { id: UniverseId; label: string }[] = [
  { id: 'asx200', label: 'ASX 200' },
  { id: 'asx500', label: 'ASX 500' },
  { id: 'mid', label: 'Mid Cap' },
  { id: 'small', label: 'Small Cap' },
]

export type BreadthSentiment = 'bullish' | 'neutral' | 'weak' | 'bearish'

export type GaugeMetric = {
  id: string
  label: string
  pct: number
  sentiment: BreadthSentiment
}

export type BreadthRow = {
  id: string
  label: string
  subtitle: string
  pct: number
  sentiment: BreadthSentiment
  spark: number[]
  delta: number
}

export type BreadthBundle = {
  stocks: StockMetrics[]
  gauges: GaugeMetric[]
  overall: BreadthSentiment
  advancing: number
  declining: number
  unchanged: number
  adNet: number
  adHistory: number[]
  pctAbove20: number
  pctAbove50: number
  pctAbove200: number
  pctRsi50: number
  pctRsi60: number
  pctRsi70: number
  pctNear52w: number
  smaRows: BreadthRow[]
  rsiRows: BreadthRow[]
  history: {
    dates: string[]
    advances: number[]
    declines: number[]
    above20: number[]
    above50: number[]
    above200: number[]
    thrust: number[]
    thrustMa: number[]
    near52w: number[]
    rsiOb: number[]
    rsiOs: number[]
    rsiNeutral: number[]
  }
}

function rankedByWeight(stocks: StockMetrics[]): StockMetrics[] {
  return [...stocks].sort((a, b) => b.weight - a.weight)
}

export function filterUniverse(stocks: StockMetrics[], id: UniverseId): StockMetrics[] {
  const ranked = rankedByWeight(stocks)
  if (id === 'asx200') return ranked.slice(0, 200)
  if (id === 'asx500') return ranked.slice(0, 500)
  if (id === 'mid') return ranked.slice(200, 500)
  return ranked.slice(500)
}

export function sentimentFromPct(pct: number): BreadthSentiment {
  if (pct > 60) return 'bullish'
  if (pct >= 40) return 'neutral'
  if (pct >= 30) return 'weak'
  return 'bearish'
}

export function sentimentLabel(s: BreadthSentiment): string {
  if (s === 'bullish') return 'Bullish'
  if (s === 'neutral') return 'Neutral'
  if (s === 'weak') return 'Weak'
  return 'Bearish'
}

export function sentimentClass(s: BreadthSentiment): string {
  if (s === 'bullish') return 'text-emerald-600 dark:text-emerald-400'
  if (s === 'neutral') return 'text-amber-600 dark:text-amber-400'
  if (s === 'weak') return 'text-orange-600 dark:text-orange-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function barClass(s: BreadthSentiment): string {
  if (s === 'bullish') return 'bg-emerald-500'
  if (s === 'neutral') return 'bg-amber-400'
  if (s === 'weak') return 'bg-orange-500'
  return 'bg-rose-500'
}

export function badgeClass(s: BreadthSentiment): string {
  if (s === 'bullish')
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
  if (s === 'neutral') return 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
  if (s === 'weak') return 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
  return 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300'
}

function pctOf(stocks: StockMetrics[], pred: (s: StockMetrics) => boolean): number {
  if (!stocks.length) return 0
  return Math.round((stocks.filter(pred).length / stocks.length) * 1000) / 10
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

function sparkHistory(stocks: StockMetrics[]) {
  const len = Math.max(2, ...stocks.map((s) => s.spark?.length ?? 0))
  const advances: number[] = []
  const declines: number[] = []
  const above20: number[] = []
  const above50: number[] = []
  const above200: number[] = []
  const near52w: number[] = []
  const rsiOb: number[] = []
  const rsiOs: number[] = []
  const rsiNeutral: number[] = []
  const thrust: number[] = []
  const dates: string[] = []
  const usable = stocks.filter((s) => (s.spark?.length ?? 0) >= 2)
  const n = Math.min(24, len)

  for (let i = 0; i < n; i++) {
    let adv = 0
    let dec = 0
    let a20 = 0
    let a50 = 0
    let a200 = 0
    let near = 0
    let ob = 0
    let os = 0
    let neu = 0
    let counted = 0

    for (const s of usable) {
      const sp = s.spark
      if (!sp.length) continue
      const idx = Math.min(i, sp.length - 1)
      const prev = Math.max(0, idx - 1)
      const v = sp[idx]
      const p = sp[prev]
      counted++
      if (v > p) adv++
      else if (v < p) dec++

      const win20 = sp.slice(Math.max(0, idx - 5), idx + 1)
      const ma20 = win20.reduce((a, b) => a + b, 0) / win20.length
      if (v >= ma20) a20++

      const win50 = sp.slice(0, idx + 1)
      const ma50 = win50.reduce((a, b) => a + b, 0) / win50.length
      if (v >= ma50) a50++

      if (i === n - 1) {
        if (s.above200ma) a200++
        if (Math.abs(s.from52wHigh) <= 5) near++
        const r = s.rsi ?? 50
        if (r >= 70) ob++
        else if (r <= 30) os++
        else neu++
      } else {
        if (v >= ma50 * 0.98) a200++
        if (v >= (sp[0] || 100) * 1.05) near++
        const mom =
          ((v - (sp[Math.max(0, idx - 3)] || v)) / (sp[Math.max(0, idx - 3)] || v || 1)) * 100
        const rProxy = 50 + mom * 3
        if (rProxy >= 70) ob++
        else if (rProxy <= 30) os++
        else neu++
      }
    }

    const denom = counted || 1
    advances.push(adv)
    declines.push(dec)
    above20.push(round1((a20 / denom) * 100))
    above50.push(round1((a50 / denom) * 100))
    above200.push(round1((a200 / denom) * 100))
    near52w.push(round1((near / denom) * 100))
    rsiOb.push(round1((ob / denom) * 100))
    rsiOs.push(round1((os / denom) * 100))
    rsiNeutral.push(round1((neu / denom) * 100))
    thrust.push(round1(adv + dec > 0 ? adv / (adv + dec) : 0.5))
    dates.push(`T-${n - 1 - i}`)
  }

  const thrustMa = thrust.map((_, i) => {
    const slice = thrust.slice(Math.max(0, i - 9), i + 1)
    return round1(slice.reduce((a, b) => a + b, 0) / slice.length)
  })

  const adHistory: number[] = []
  let cum = 0
  for (let i = 0; i < advances.length; i++) {
    cum += advances[i] - declines[i]
    adHistory.push(cum)
  }

  return {
    dates,
    advances,
    declines,
    above20,
    above50,
    above200,
    thrust,
    thrustMa,
    near52w,
    rsiOb,
    rsiOs,
    rsiNeutral,
    adHistory,
  }
}

const BREADTH_LS_KEY = 'asx-breadth-daily-v1'

export function appendDailyBreadthPoint(
  universeId: UniverseId,
  point: { above20: number; above50: number; above200: number; rsi50: number; adNet: number },
) {
  try {
    const raw = localStorage.getItem(BREADTH_LS_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, unknown[]>) : {}
    const day = new Date().toISOString().slice(0, 10)
    const list = (all[universeId] as { day: string }[]) || []
    const next = list.filter((x) => x.day !== day)
    next.push({ day, ...point })
    all[universeId] = next.slice(-120)
    localStorage.setItem(BREADTH_LS_KEY, JSON.stringify(all))
  } catch {
    // ignore
  }
}

export function computeBreadth(snapshot: MarketSnapshot, universeId: UniverseId): BreadthBundle {
  const stocks = filterUniverse(snapshot.stocks, universeId)
  const pctAbove20 = pctOf(stocks, (s) => s.above20ma)
  const pctAbove50 = pctOf(stocks, (s) => s.above50ma)
  const pctAbove200 = pctOf(stocks, (s) => s.above200ma)
  const pctRsi50 = pctOf(stocks, (s) => (s.rsi ?? 50) >= 50)
  const pctRsi60 = pctOf(stocks, (s) => (s.rsi ?? 50) >= 60)
  const pctRsi70 = pctOf(stocks, (s) => (s.rsi ?? 50) >= 70)
  const pctNear52w = pctOf(stocks, (s) => Math.abs(s.from52wHigh) <= 5)

  const gauges: GaugeMetric[] = [
    { id: '20', label: '20 SMA', pct: pctAbove20, sentiment: sentimentFromPct(pctAbove20) },
    { id: '50', label: '50 SMA', pct: pctAbove50, sentiment: sentimentFromPct(pctAbove50) },
    { id: '200', label: '200 SMA', pct: pctAbove200, sentiment: sentimentFromPct(pctAbove200) },
    { id: 'rsi', label: 'RSI ≥ 50', pct: pctRsi50, sentiment: sentimentFromPct(pctRsi50) },
  ]

  const score = (s: BreadthSentiment) =>
    s === 'bullish' ? 2 : s === 'neutral' ? 1 : s === 'weak' ? -1 : -2
  const sum = gauges.reduce((a, g) => a + score(g.sentiment), 0)
  const overall: BreadthSentiment =
    sum >= 4 ? 'bullish' : sum >= 1 ? 'neutral' : sum >= -2 ? 'weak' : 'bearish'

  const advancing = stocks.filter((s) => s.d1 > 0).length
  const declining = stocks.filter((s) => s.d1 < 0).length
  const unchanged = stocks.length - advancing - declining
  const adNet = advancing - declining

  const hist = sparkHistory(stocks)
  if (hist.above20.length) {
    hist.above20[hist.above20.length - 1] = pctAbove20
    hist.above50[hist.above50.length - 1] = pctAbove50
    hist.above200[hist.above200.length - 1] = pctAbove200
    hist.near52w[hist.near52w.length - 1] = pctNear52w
    hist.rsiOb[hist.rsiOb.length - 1] = pctRsi70
    hist.rsiOs[hist.rsiOs.length - 1] = pctOf(stocks, (s) => (s.rsi ?? 50) <= 30)
    hist.rsiNeutral[hist.rsiNeutral.length - 1] = pctOf(
      stocks,
      (s) => (s.rsi ?? 50) > 30 && (s.rsi ?? 50) < 70,
    )
    hist.advances[hist.advances.length - 1] = advancing
    hist.declines[hist.declines.length - 1] = declining
  }

  appendDailyBreadthPoint(universeId, {
    above20: pctAbove20,
    above50: pctAbove50,
    above200: pctAbove200,
    rsi50: pctRsi50,
    adNet,
  })

  const smaRows: BreadthRow[] = [
    {
      id: '20',
      label: '% above 20 SMA (Short-term)',
      subtitle: 'Near-term trend participation',
      pct: pctAbove20,
      sentiment: sentimentFromPct(pctAbove20),
      spark: hist.above20,
      delta: hist.above20.length > 1 ? round1(hist.above20.at(-1)! - hist.above20.at(-2)!) : 0,
    },
    {
      id: '50',
      label: '% above 50 SMA (Medium-term)',
      subtitle: 'Swing / intermediate trend',
      pct: pctAbove50,
      sentiment: sentimentFromPct(pctAbove50),
      spark: hist.above50,
      delta: hist.above50.length > 1 ? round1(hist.above50.at(-1)! - hist.above50.at(-2)!) : 0,
    },
    {
      id: '100',
      label: '% above 100 SMA (Intermediate)',
      subtitle: 'Blended mid-horizon (proxy via 50/200 mix)',
      pct: Math.round((pctAbove50 + pctAbove200) / 2),
      sentiment: sentimentFromPct(Math.round((pctAbove50 + pctAbove200) / 2)),
      spark: hist.above50.map((v, i) => round1((v + (hist.above200[i] ?? v)) / 2)),
      delta: 0,
    },
    {
      id: '200',
      label: '% above 200 SMA (Long-term)',
      subtitle: 'Structural / bull-market support',
      pct: pctAbove200,
      sentiment: sentimentFromPct(pctAbove200),
      spark: hist.above200,
      delta: hist.above200.length > 1 ? round1(hist.above200.at(-1)! - hist.above200.at(-2)!) : 0,
    },
  ]

  const rsiRows: BreadthRow[] = [
    {
      id: 'r50',
      label: '% Stocks RSI ≥ 50 (Positive momentum)',
      subtitle: 'RSI above 50 = bullish internal momentum',
      pct: pctRsi50,
      sentiment: sentimentFromPct(pctRsi50),
      spark: hist.rsiNeutral.map((_, i) => round1(100 - (hist.rsiOs[i] ?? 0))),
      delta: 0,
    },
    {
      id: 'r60',
      label: '% Stocks RSI ≥ 60 (Strong momentum)',
      subtitle: 'Stronger upside participation',
      pct: pctRsi60,
      sentiment: sentimentFromPct(pctRsi60),
      spark: hist.rsiOb.map((v) => round1(v * 1.5)),
      delta: 0,
    },
    {
      id: 'r70',
      label: '% Stocks RSI Overbought (RSI ≥ 70)',
      subtitle: 'Crowded long / stretch risk',
      pct: pctRsi70,
      sentiment: pctRsi70 > 25 ? 'weak' : pctRsi70 > 15 ? 'neutral' : 'bullish',
      spark: hist.rsiOb,
      delta: 0,
    },
  ]

  return {
    stocks,
    gauges,
    overall,
    advancing,
    declining,
    unchanged,
    adNet,
    adHistory: hist.adHistory,
    pctAbove20,
    pctAbove50,
    pctAbove200,
    pctRsi50,
    pctRsi60,
    pctRsi70,
    pctNear52w,
    smaRows,
    rsiRows,
    history: {
      dates: hist.dates,
      advances: hist.advances,
      declines: hist.declines,
      above20: hist.above20,
      above50: hist.above50,
      above200: hist.above200,
      thrust: hist.thrust,
      thrustMa: hist.thrustMa,
      near52w: hist.near52w,
      rsiOb: hist.rsiOb,
      rsiOs: hist.rsiOs,
      rsiNeutral: hist.rsiNeutral,
    },
  }
}
