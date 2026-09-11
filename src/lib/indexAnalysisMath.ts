import type { OhlcBar } from './patterns/types'
import { dailyToWeeklyBars, recentWeeklyBars } from './patterns/weeklyBars'

export type SrStatus = 'Approaching Support' | 'Approaching Resistance' | 'Neutral'

export type WeeklySrMetrics = {
  support20: number
  resistance20: number
  distSupport: number
  distResistance: number
  nearSupport: boolean
  nearResistance: boolean
  srStatus: SrStatus
  wClose: number
  weeksUsed: number
}

export type SectorRsMetrics = {
  /** 20-week RS vs XJO, rebased so 100 ≈ in line with the market */
  rs: number
  /** RS now minus RS from 4 weeks ago */
  rsMom: number
  /** 70% RS + 30% RS momentum */
  sectorScore: number
}

const NEAR_PCT = 3
const SR_WEEKS = 20
const RS_REBASE_WEEKS = 20
const RS_MOM_LAG = 4

function finite(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n !== 0
}

/**
 * Weekly Support & Resistance (20 weeks) — matches desk ScanScript:
 * Support20 = lowest(WLow, 20), Resistance20 = highest(WHigh, 20)
 * DistSupport = 100 * (WClose - Support20) / Support20
 * DistResistance = 100 * (Resistance20 - WClose) / WClose
 * Near* within 3%.
 */
export function computeWeeklySr(weeklyNewestFirst: OhlcBar[]): WeeklySrMetrics | null {
  const weeks = weeklyNewestFirst.slice(0, SR_WEEKS)
  if (weeks.length < SR_WEEKS) return null
  const wClose = weeks[0].c
  if (!finite(wClose)) return null
  let support20 = weeks[0].l
  let resistance20 = weeks[0].h
  for (const w of weeks) {
    if (Number.isFinite(w.l)) support20 = Math.min(support20, w.l)
    if (Number.isFinite(w.h)) resistance20 = Math.max(resistance20, w.h)
  }
  if (!finite(support20) || !finite(resistance20)) return null
  const distSupport = (100 * (wClose - support20)) / support20
  const distResistance = (100 * (resistance20 - wClose)) / wClose
  const nearSupport = distSupport < NEAR_PCT
  const nearResistance = distResistance < NEAR_PCT
  const srStatus: SrStatus = nearSupport
    ? 'Approaching Support'
    : nearResistance
      ? 'Approaching Resistance'
      : 'Neutral'
  return {
    support20,
    resistance20,
    distSupport,
    distResistance,
    nearSupport,
    nearResistance,
    srStatus,
    wClose,
    weeksUsed: weeks.length,
  }
}

/**
 * RS vs XJO with 20-week rebase (comparable across sectors), then 4-week momentum.
 * Source script used raw close ratios; rebasing keeps SectorScore rankable.
 * SectorScore = 0.7 * RS + 0.3 * RS_Mom
 */
export function computeSectorRs(
  sectorWeeklyNewestFirst: OhlcBar[],
  xjoWeeklyNewestFirst: OhlcBar[],
): SectorRsMetrics | null {
  const need = RS_REBASE_WEEKS + RS_MOM_LAG + 1
  if (sectorWeeklyNewestFirst.length < need || xjoWeeklyNewestFirst.length < need) return null

  const rsAt = (lag: number): number | null => {
    const secNow = sectorWeeklyNewestFirst[lag]?.c
    const secPast = sectorWeeklyNewestFirst[lag + RS_REBASE_WEEKS]?.c
    const xjoNow = xjoWeeklyNewestFirst[lag]?.c
    const xjoPast = xjoWeeklyNewestFirst[lag + RS_REBASE_WEEKS]?.c
    if (![secNow, secPast, xjoNow, xjoPast].every(finite)) return null
    const sectorRet = secNow! / secPast!
    const xjoRet = xjoNow! / xjoPast!
    if (!finite(xjoRet)) return null
    return 100 * (sectorRet / xjoRet)
  }

  const rs = rsAt(0)
  const rsLag = rsAt(RS_MOM_LAG)
  if (rs == null || rsLag == null) return null
  const rsMom = rs - rsLag
  const sectorScore = rs * 0.7 + rsMom * 0.3
  return { rs, rsMom, sectorScore }
}

/** Daily OHLC → newest-first weekly bars for Index Analysis. */
export function weeklyBarsForIndexAnalysis(daily: OhlcBar[]): OhlcBar[] {
  return recentWeeklyBars(dailyToWeeklyBars(daily), daily.length)
}
