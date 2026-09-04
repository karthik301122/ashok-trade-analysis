import { ema, type OhlcBar } from '../deskSeries'

export type LivermoreScores = {
  accumulation: number
  liquidityGrab: number
  breakout: number
  rsScore: number
  finalScore: number
  tier: 'elite' | 'strong' | 'emerging' | 'ignore'
  eliteSetup: boolean
  pivotBreakout: boolean
  volumeRatio: number
  atrRatio: number
  higherLow: boolean
  rsSpread20: number
  wickRatio: number
  liquidityGrabSignal: boolean
  accumulationStrong: boolean
  emaStack: boolean
  adx: number | null
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n))
}

function clamp01(n: number) {
  return clamp(n, 0, 1)
}

function avg(values: number[]) {
  if (!values.length) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

function returnOverBars(bars: OhlcBar[], days: number): number | null {
  if (bars.length < days + 1) return null
  const a = bars[bars.length - 1].c
  const b = bars[bars.length - 1 - days].c
  if (!b) return null
  return ((a - b) / b) * 100
}

/** Wilder-style ATR */
export function atr(bars: OhlcBar[], period: number): number | null {
  if (bars.length < period + 1) return null
  const trs: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].h
    const l = bars[i].l
    const pc = bars[i - 1].c
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  if (trs.length < period) return null
  let atrVal = avg(trs.slice(0, period))
  for (let i = period; i < trs.length; i++) {
    atrVal = (atrVal * (period - 1) + trs[i]) / period
  }
  return atrVal
}

/** ADX(14) trend strength */
export function adx(bars: OhlcBar[], period = 14): number | null {
  if (bars.length < period * 2 + 1) return null
  const plusDm: number[] = []
  const minusDm: number[] = []
  const tr: number[] = []
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i - 1].h
    const down = bars[i - 1].l - bars[i].l
    plusDm.push(up > down && up > 0 ? up : 0)
    minusDm.push(down > up && down > 0 ? down : 0)
    const h = bars[i].h
    const l = bars[i].l
    const pc = bars[i - 1].c
    tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  if (tr.length < period) return null

  let smTr = avg(tr.slice(0, period))
  let smPlus = avg(plusDm.slice(0, period))
  let smMinus = avg(minusDm.slice(0, period))
  const dx: number[] = []

  for (let i = period; i < tr.length; i++) {
    smTr = (smTr * (period - 1) + tr[i]) / period
    smPlus = (smPlus * (period - 1) + plusDm[i]) / period
    smMinus = (smMinus * (period - 1) + minusDm[i]) / period
    const pdi = smTr > 0 ? (100 * smPlus) / smTr : 0
    const mdi = smTr > 0 ? (100 * smMinus) / smTr : 0
    const sum = pdi + mdi
    dx.push(sum > 0 ? (100 * Math.abs(pdi - mdi)) / sum : 0)
  }
  if (dx.length < period) return null
  let adxVal = avg(dx.slice(0, period))
  for (let i = period; i < dx.length; i++) {
    adxVal = (adxVal * (period - 1) + dx[i]) / period
  }
  return Math.round(adxVal * 10) / 10
}

function swingLows(bars: OhlcBar[], lookback = 40): number[] {
  const lows: number[] = []
  const start = Math.max(1, bars.length - lookback)
  for (let i = start; i < bars.length - 1; i++) {
    if (bars[i].l < bars[i - 1].l && bars[i].l < bars[i + 1].l) {
      lows.push(bars[i].l)
    }
  }
  return lows
}

function volumeRatio(bars: OhlcBar[]): number {
  const vols = bars.map((b) => b.v ?? 0)
  if (vols.length < 21) return 1
  const today = vols[vols.length - 1]
  const avg20 = avg(vols.slice(-21, -1))
  return avg20 > 0 ? today / avg20 : 1
}

function normalizeVolumeScore(ratio: number): number {
  return clamp01((ratio - 1) / 2) * 100
}

function normalizeCompressionScore(atrRatio: number): number {
  if (atrRatio >= 0.8) return clamp((1 - Math.min(atrRatio, 1.2)) * 40, 0, 15)
  return clamp(((0.8 - atrRatio) / 0.4) * 100)
}

function normalizeRsSpreadScore(spread: number): number {
  return clamp01((spread + 5) / 15) * 100
}

function tierFromFinal(final: number): LivermoreScores['tier'] {
  if (final >= 90) return 'elite'
  if (final >= 80) return 'strong'
  if (final >= 70) return 'emerging'
  return 'ignore'
}

export type LivermoreStockContext = {
  indexReturn20: number
  from52wHigh: number
  relativeVolume: number
  rsRating: number
}

/**
 * Livermore accumulation, liquidity grab, pivot breakout, and combined desk score.
 */
export function computeLivermoreScores(
  bars: OhlcBar[],
  ctx: LivermoreStockContext,
): LivermoreScores | null {
  if (bars.length < 60) return null

  const today = bars[bars.length - 1]
  const volRatio = volumeRatio(bars)

  const atr14 = atr(bars, 14)
  const atr50 = atr(bars, 50)
  const atrRatio = atr14 != null && atr50 != null && atr50 > 0 ? atr14 / atr50 : 1

  const swings = swingLows(bars)
  const higherLow =
    swings.length >= 2 ? swings[swings.length - 1] > swings[swings.length - 2] : false
  const hlScore = higherLow ? 100 : 0

  const stockRet20 = returnOverBars(bars, 20) ?? 0
  const rsSpread20 = stockRet20 - ctx.indexReturn20
  const rsScore = normalizeRsSpreadScore(rsSpread20)

  const volNorm = normalizeVolumeScore(volRatio)
  const compressionNorm = normalizeCompressionScore(atrRatio)

  const accumulation = clamp(
    0.3 * volNorm + 0.25 * hlScore + 0.25 * rsScore + 0.2 * compressionNorm,
  )

  const prev10 = bars.slice(-11, -1)
  const supportLow = Math.min(...prev10.map((b) => b.l))
  const falseBreak = today.l < supportLow && today.c > supportLow
  const range = today.h - today.l
  const bodyLow = Math.min(today.o, today.c)
  const wickRatio = range > 0 ? (bodyLow - today.l) / range : 0

  const falseBreakStrength = falseBreak
    ? clamp(((today.c - supportLow) / (supportLow || today.c)) * 500, 0, 100)
    : 0
  const wickScore = clamp(wickRatio * 100)
  const liqVolScore = normalizeVolumeScore(volRatio)

  const liquidityGrab = clamp(
    0.4 * falseBreakStrength + 0.3 * liqVolScore + 0.2 * wickScore + 0.1 * rsScore,
  )
  const liquidityGrabSignal = liquidityGrab >= 60 && falseBreak && volRatio > 1.5 && wickRatio > 0.5

  const pivotWindow = bars.slice(-21, -1)
  const pivot = Math.max(...pivotWindow.map((b) => b.h))
  const ema20 = ema(bars.map((b) => b.c), 20)
  const ema50 = ema(bars.map((b) => b.c), 50)
  const ema200 = ema(bars.map((b) => b.c), 200)
  const emaStack =
    ema20 != null &&
    ema50 != null &&
    ema200 != null &&
    ema20 > ema50 &&
    ema50 > ema200 &&
    today.c > ema20

  const pivotBreakout =
    today.c > pivot && volRatio > 1.5 && rsSpread20 > 0

  let breakout = 0
  if (today.c > pivot) breakout += 34
  if (volRatio > 1.5) breakout += 33
  if (rsSpread20 > 0) breakout += 33
  breakout = clamp(breakout)

  const finalScore = clamp(
    0.35 * accumulation + 0.25 * liquidityGrab + 0.25 * rsScore + 0.15 * breakout,
  )

  const eliteSetup =
    accumulation > 80 &&
    liquidityGrab > 70 &&
    ctx.from52wHigh >= -10 &&
    emaStack &&
    ctx.relativeVolume > 1.5

  return {
    accumulation: Math.round(accumulation),
    liquidityGrab: Math.round(liquidityGrab),
    breakout: Math.round(breakout),
    rsScore: Math.round(rsScore),
    finalScore: Math.round(finalScore),
    tier: tierFromFinal(finalScore),
    eliteSetup,
    pivotBreakout,
    volumeRatio: Math.round(volRatio * 100) / 100,
    atrRatio: Math.round(atrRatio * 100) / 100,
    higherLow,
    rsSpread20: Math.round(rsSpread20 * 10) / 10,
    wickRatio: Math.round(wickRatio * 100) / 100,
    liquidityGrabSignal,
    accumulationStrong: accumulation >= 85,
    emaStack,
    adx: adx(bars, 14),
  }
}

export function livermorePatternMatch(patternId: string, scores: LivermoreScores): boolean {
  switch (patternId) {
    case 'livermore-dashboard':
      return scores.finalScore >= 50
    case 'livermore-elite-setup':
      return scores.eliteSetup
    case 'livermore-accumulation':
      return scores.accumulation >= 70
    case 'livermore-accumulation-strong':
      return scores.accumulation >= 85
    case 'livermore-liquidity-grab':
      return scores.liquidityGrab >= 60
    case 'livermore-liquidity-strong':
      return scores.liquidityGrab >= 80
    case 'livermore-pivot-breakout':
      return scores.pivotBreakout
    default:
      return false
  }
}
