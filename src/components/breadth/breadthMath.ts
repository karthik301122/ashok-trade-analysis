import type { MarketSnapshot, StockMetrics } from '../../data/types'
import { membershipSet } from '../../data/indexMembership'

export type UniverseId = 'asx200' | 'asx500' | 'mid' | 'small'

export const UNIVERSES: { id: UniverseId; label: string; hint: string }[] = [
  {
    id: 'asx200',
    label: 'Top 200',
    hint: 'S&P/ASX 200 (EODHD AXJO.INDX constituents)',
  },
  {
    id: 'asx500',
    label: 'Top 500',
    hint: 'All Ordinaries — ~500 largest ASX listings (EODHD AORD.INDX)',
  },
  {
    id: 'mid',
    label: 'Mid (201–500)',
    hint: 'In All Ordinaries but not in ASX 200',
  },
  {
    id: 'small',
    label: 'Small',
    hint: 'S&P/ASX Small Ordinaries (EODHD AXSO.INDX)',
  },
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
  pctRs50: number
  pctRs70: number
  avgRs: number
  pctRvol15: number
  pctRvol20: number
  pctRvol30: number
  avgRvol: number
  smaRows: BreadthRow[]
  rsiRows: BreadthRow[]
  rsVolRows: BreadthRow[]
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
    rs50: number[]
    rvol15: number[]
  }
  /** Real calendar-day snapshots from server (when available) */
  dailyHistory: {
    day: string
    above20: number
    above50: number
    above200: number
    rsi50: number
    adNet: number
    advancing?: number | null
    declining?: number | null
    near52w?: number | null
    rsi70?: number | null
    rsi30?: number | null
    rs50?: number | null
    rvol15?: number | null
  }[]
  historyKind: 'spark-proxy' | 'server-daily' | 'ohlc-daily'
}

function rankedByWeight(stocks: StockMetrics[]): StockMetrics[] {
  return [...stocks].sort((a, b) => b.weight - a.weight)
}

export function filterUniverse(stocks: StockMetrics[], id: UniverseId): StockMetrics[] {
  const members = membershipSet(id)
  const filtered = stocks.filter((s) => members.has(s.ticker))
  // Prefer explicit membership file; fall back to weight ranks if file empty/mismatched
  if (filtered.length >= Math.min(50, members.size * 0.5 || 50)) {
    return rankedByWeight(filtered)
  }
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

/** Align spark-proxy series to N server days (tail = most recent). */
function tailAlign(values: number[], n: number): number[] {
  if (n <= 0) return values
  if (values.length >= n) return values.slice(-n)
  const first = values[0] ?? 0
  return [...Array(n - values.length).fill(first), ...values]
}

export function formatBreadthChartDay(day: string): string {
  const d = new Date(`${day}T12:00:00`)
  if (Number.isNaN(d.getTime())) return day
  return d.toLocaleDateString('en-AU', { month: 'short', day: 'numeric' })
}

function sparkDayLabel(i: number, total: number): string {
  const offset = total - 1 - i
  return offset === 0 ? 'Today' : `−${offset}d`
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
  const rs50: number[] = []
  const rvol15: number[] = []
  const thrust: number[] = []
  const dates: string[] = []
  const usable = stocks.filter((s) => (s.spark?.length ?? 0) >= 2)
  const n = Math.min(63, len)

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
    let rsHi = 0
    let rvolHi = 0
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
        if ((s.rs ?? 50) >= 50) rsHi++
        if ((s.relativeVolume ?? 0) >= 1.5) rvolHi++
      } else {
        if (v >= ma50 * 0.98) a200++
        if (v >= (sp[0] || 100) * 1.05) near++
        const mom =
          ((v - (sp[Math.max(0, idx - 3)] || v)) / (sp[Math.max(0, idx - 3)] || v || 1)) * 100
        const rProxy = 50 + mom * 3
        if (rProxy >= 70) ob++
        else if (rProxy <= 30) os++
        else neu++
        if (v >= (sp[0] || 100)) rsHi++
        if (Math.abs(v - p) > 1.2) rvolHi++
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
    rs50.push(round1((rsHi / denom) * 100))
    rvol15.push(round1((rvolHi / denom) * 100))
    thrust.push(round1(adv + dec > 0 ? adv / (adv + dec) : 0.5))
    dates.push(sparkDayLabel(i, n))
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
    rs50,
    rvol15,
    adHistory,
  }
}

const BREADTH_LS_KEY = 'asx-breadth-daily-v1'

export function appendDailyBreadthPoint(
  universeId: UniverseId,
  point: {
    above20: number
    above50: number
    above200: number
    rsi50: number
    adNet: number
    advancing?: number
    declining?: number
    near52w?: number
    rsi70?: number
    rsi30?: number
    rs50?: number
    rvol15?: number
  },
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

type DailyHistoryPoint = {
  day: string
  above20: number
  above50: number
  above200: number
  rsi50: number
  adNet: number
  advancing?: number | null
  declining?: number | null
  near52w?: number | null
  rsi70?: number | null
  rsi30?: number | null
  rs50?: number | null
  rvol15?: number | null
}

const MIN_OHLC_CHART_DAYS = 10
const MIN_SERVER_CHART_DAYS = 14

function applyDailyHistory(
  hist: ReturnType<typeof sparkHistory>,
  points: DailyHistoryPoint[],
) {
  const n = points.length
  const sparkAdv = [...hist.advances]
  const sparkDec = [...hist.declines]
  const sparkNear = [...hist.near52w]
  const sparkOb = [...hist.rsiOb]
  const sparkOs = [...hist.rsiOs]
  const sparkNeu = [...hist.rsiNeutral]
  const sparkRs = [...hist.rs50]
  const sparkRvol = [...hist.rvol15]

  hist.dates = points.map((p) => formatBreadthChartDay(p.day))
  hist.above20 = points.map((p) => p.above20)
  hist.above50 = points.map((p) => p.above50)
  hist.above200 = points.map((p) => p.above200)

  hist.advances = points.map((p, i) =>
    typeof p.advancing === 'number' ? p.advancing : tailAlign(sparkAdv, n)[i],
  )
  hist.declines = points.map((p, i) =>
    typeof p.declining === 'number' ? p.declining : tailAlign(sparkDec, n)[i],
  )
  hist.near52w = points.map((p, i) =>
    typeof p.near52w === 'number' ? p.near52w : tailAlign(sparkNear, n)[i],
  )
  hist.rsiOb = points.map((p, i) =>
    typeof p.rsi70 === 'number' ? p.rsi70 : tailAlign(sparkOb, n)[i],
  )
  hist.rsiOs = points.map((p, i) =>
    typeof p.rsi30 === 'number' ? p.rsi30 : tailAlign(sparkOs, n)[i],
  )
  hist.rsiNeutral = points.map((_, i) => {
    const ob = hist.rsiOb[i]
    const os = hist.rsiOs[i]
    const neu = tailAlign(sparkNeu, n)[i]
    return round1(Math.max(0, 100 - ob - os) || neu)
  })
  hist.rs50 = points.map((p, i) =>
    typeof p.rs50 === 'number' ? p.rs50 : tailAlign(sparkRs, n)[i],
  )
  hist.rvol15 = points.map((p, i) =>
    typeof p.rvol15 === 'number' ? p.rvol15 : tailAlign(sparkRvol, n)[i],
  )

  hist.thrust = hist.advances.map((adv, i) => {
    const dec = hist.declines[i]
    return round1(adv + dec > 0 ? adv / (adv + dec) : 0.5)
  })
  hist.thrustMa = hist.thrust.map((_, i) => {
    const slice = hist.thrust.slice(Math.max(0, i - 9), i + 1)
    return round1(slice.reduce((a, b) => a + b, 0) / slice.length)
  })

  let cum = 0
  hist.adHistory = points.map((p) => {
    cum += p.adNet
    return cum
  })
}

export function computeBreadth(
  snapshot: MarketSnapshot,
  universeId: UniverseId,
  opts?: {
    serverPoints?: DailyHistoryPoint[]
    chartHistory?: DailyHistoryPoint[]
  },
): BreadthBundle {
  const stocks = filterUniverse(snapshot.stocks, universeId)
  const pctAbove20 = pctOf(stocks, (s) => s.above20ma)
  const pctAbove50 = pctOf(stocks, (s) => s.above50ma)
  const pctAbove200 = pctOf(stocks, (s) => s.above200ma)
  const pctRsi50 = pctOf(stocks, (s) => (s.rsi ?? 50) >= 50)
  const pctRsi60 = pctOf(stocks, (s) => (s.rsi ?? 50) >= 60)
  const pctRsi70 = pctOf(stocks, (s) => (s.rsi ?? 50) >= 70)
  const pctNear52w = pctOf(stocks, (s) => Math.abs(s.from52wHigh) <= 5)
  const pctRs50 = pctOf(stocks, (s) => (s.rs ?? 50) >= 50)
  const pctRs70 = pctOf(stocks, (s) => (s.rs ?? 50) >= 70)
  const avgRs =
    stocks.length > 0
      ? round1(stocks.reduce((a, s) => a + (s.rs ?? 50), 0) / stocks.length)
      : 50
  const pctRvol15 = pctOf(stocks, (s) => (s.relativeVolume ?? 0) >= 1.5)
  const pctRvol20 = pctOf(stocks, (s) => (s.relativeVolume ?? 0) >= 2)
  const pctRvol30 = pctOf(stocks, (s) => (s.relativeVolume ?? 0) >= 3)
  const avgRvol =
    stocks.length > 0
      ? round1(stocks.reduce((a, s) => a + (s.relativeVolume ?? 0), 0) / stocks.length)
      : 0

  const rvolSentiment: BreadthSentiment =
    pctRvol15 > 40 ? 'bullish' : pctRvol15 >= 20 ? 'neutral' : pctRvol15 >= 10 ? 'weak' : 'bearish'

  const gauges: GaugeMetric[] = [
    { id: '20', label: '20 SMA', pct: pctAbove20, sentiment: sentimentFromPct(pctAbove20) },
    { id: '50', label: '50 SMA', pct: pctAbove50, sentiment: sentimentFromPct(pctAbove50) },
    { id: '200', label: '200 SMA', pct: pctAbove200, sentiment: sentimentFromPct(pctAbove200) },
    { id: 'rsi', label: 'RSI ≥ 50', pct: pctRsi50, sentiment: sentimentFromPct(pctRsi50) },
    { id: 'rs', label: 'RS ≥ 50', pct: pctRs50, sentiment: sentimentFromPct(pctRs50) },
    { id: 'rvol', label: 'RVOL ≥ 1.5×', pct: pctRvol15, sentiment: rvolSentiment },
  ]

  const score = (s: BreadthSentiment) =>
    s === 'bullish' ? 2 : s === 'neutral' ? 1 : s === 'weak' ? -1 : -2
  // Overall from trend gauges (exclude pure activity RVOL)
  const trendGauges = gauges.filter((g) => g.id !== 'rvol')
  const sum = trendGauges.reduce((a, g) => a + score(g.sentiment), 0)
  const overall: BreadthSentiment =
    sum >= 5 ? 'bullish' : sum >= 1 ? 'neutral' : sum >= -3 ? 'weak' : 'bearish'

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
    hist.rs50[hist.rs50.length - 1] = pctRs50
    hist.rvol15[hist.rvol15.length - 1] = pctRvol15
    hist.advances[hist.advances.length - 1] = advancing
    hist.declines[hist.declines.length - 1] = declining
  }

  const serverPoints = opts?.serverPoints?.length ? opts.serverPoints : []
  const chartHistory = opts?.chartHistory?.length ? opts.chartHistory : []

  let historyKind: BreadthBundle['historyKind'] = 'spark-proxy'
  let dailyHistory = serverPoints

  if (chartHistory.length >= MIN_OHLC_CHART_DAYS) {
    historyKind = 'ohlc-daily'
    dailyHistory = chartHistory
    applyDailyHistory(hist, chartHistory)
  } else if (serverPoints.length >= MIN_SERVER_CHART_DAYS) {
    historyKind = 'server-daily'
    applyDailyHistory(hist, serverPoints)
  }

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

  const rsVolRows: BreadthRow[] = [
    {
      id: 'rs50',
      label: '% Stocks RS ≥ 50 (Beating market)',
      subtitle: `Relative strength vs ASX200 · universe avg RS ${avgRs}`,
      pct: pctRs50,
      sentiment: sentimentFromPct(pctRs50),
      spark: hist.rs50,
      delta: hist.rs50.length > 1 ? round1(hist.rs50.at(-1)! - hist.rs50.at(-2)!) : 0,
    },
    {
      id: 'rs70',
      label: '% Stocks RS ≥ 70 (Strong leaders)',
      subtitle: 'High RS = clear relative outperformance',
      pct: pctRs70,
      sentiment: sentimentFromPct(pctRs70),
      spark: hist.rs50.map((v) => round1(v * 0.55)),
      delta: 0,
    },
    {
      id: 'rv15',
      label: '% Stocks RVOL ≥ 1.5× (Unusual volume)',
      subtitle: `Today vs 20-day avg volume · universe avg RVOL ${avgRvol}×`,
      pct: pctRvol15,
      sentiment: rvolSentiment,
      spark: hist.rvol15,
      delta: hist.rvol15.length > 1 ? round1(hist.rvol15.at(-1)! - hist.rvol15.at(-2)!) : 0,
    },
    {
      id: 'rv20',
      label: '% Stocks RVOL ≥ 2× (Hot volume)',
      subtitle: 'Twice normal turnover — watch for breakouts / news',
      pct: pctRvol20,
      sentiment: pctRvol20 > 25 ? 'bullish' : pctRvol20 >= 12 ? 'neutral' : 'weak',
      spark: hist.rvol15.map((v) => round1(v * 0.65)),
      delta: 0,
    },
    {
      id: 'rv30',
      label: '% Stocks RVOL ≥ 3× (Extreme volume)',
      subtitle: 'Very elevated activity — often event-driven',
      pct: pctRvol30,
      sentiment: pctRvol30 > 15 ? 'bullish' : pctRvol30 >= 5 ? 'neutral' : 'weak',
      spark: hist.rvol15.map((v) => round1(v * 0.35)),
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
    pctRs50,
    pctRs70,
    avgRs,
    pctRvol15,
    pctRvol20,
    pctRvol30,
    avgRvol,
    smaRows,
    rsiRows,
    rsVolRows,
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
      rs50: hist.rs50,
      rvol15: hist.rvol15,
    },
    dailyHistory,
    historyKind,
  }
}
