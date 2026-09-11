import { getCachedSeries } from './getSeries.mjs'
import {
  ASX_INDEX_ANALYSIS_UNIVERSE,
  ASX_RS_BENCHMARK,
} from './asxIndexes.mjs'

const FROM = '2023-01-01'
const SR_WEEKS = 20
const RS_REBASE_WEEKS = 20
const RS_MOM_LAG = 4
const NEAR_PCT = 3

function finite(n) {
  return typeof n === 'number' && Number.isFinite(n) && n !== 0
}

/** @param {{ t: number, o: number, h: number, l: number, c: number, v?: number }[]} daily */
function dailyToWeeklyBars(daily) {
  const map = new Map()
  const order = []
  for (const b of daily) {
    const d = new Date(b.t * 1000)
    const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    const dayNum = utc.getUTCDay() || 7
    utc.setUTCDate(utc.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
    const key = `${utc.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v || 0 })
      order.push(key)
    } else {
      prev.h = Math.max(prev.h, b.h)
      prev.l = Math.min(prev.l, b.l)
      prev.c = b.c
      prev.t = b.t
      prev.v = (prev.v || 0) + (b.v || 0)
    }
  }
  return order.map((k) => map.get(k))
}

function weeklyNewestFirst(daily) {
  return dailyToWeeklyBars(daily).sort((a, b) => b.t - a.t)
}

function computeWeeklySr(weeks) {
  const slice = weeks.slice(0, SR_WEEKS)
  if (slice.length < SR_WEEKS) return null
  const wClose = slice[0].c
  if (!finite(wClose)) return null
  let support20 = slice[0].l
  let resistance20 = slice[0].h
  for (const w of slice) {
    if (Number.isFinite(w.l)) support20 = Math.min(support20, w.l)
    if (Number.isFinite(w.h)) resistance20 = Math.max(resistance20, w.h)
  }
  if (!finite(support20) || !finite(resistance20)) return null
  const distSupport = (100 * (wClose - support20)) / support20
  const distResistance = (100 * (resistance20 - wClose)) / wClose
  const nearSupport = distSupport < NEAR_PCT
  const nearResistance = distResistance < NEAR_PCT
  const srStatus = nearSupport
    ? 'Approaching Support'
    : nearResistance
      ? 'Approaching Resistance'
      : 'Neutral'
  return { support20, resistance20, distSupport, distResistance, srStatus }
}

function computeSectorRs(sectorWeeks, xjoWeeks) {
  const need = RS_REBASE_WEEKS + RS_MOM_LAG + 1
  if (sectorWeeks.length < need || xjoWeeks.length < need) return null
  const rsAt = (lag) => {
    const secNow = sectorWeeks[lag]?.c
    const secPast = sectorWeeks[lag + RS_REBASE_WEEKS]?.c
    const xjoNow = xjoWeeks[lag]?.c
    const xjoPast = xjoWeeks[lag + RS_REBASE_WEEKS]?.c
    if (![secNow, secPast, xjoNow, xjoPast].every(finite)) return null
    const sectorRet = secNow / secPast
    const xjoRet = xjoNow / xjoPast
    if (!finite(xjoRet)) return null
    return 100 * (sectorRet / xjoRet)
  }
  const rs = rsAt(0)
  const rsLag = rsAt(RS_MOM_LAG)
  if (rs == null || rsLag == null) return null
  const rsMom = rs - rsLag
  return { rs, rsMom, sectorScore: rs * 0.7 + rsMom * 0.3 }
}

/**
 * Load ASX indexes (cache-first, then EODHD) and compute Index Analysis rows.
 * Runs outside /api/series admission so cold sector pulls do not shed the desk.
 */
export async function buildIndexAnalysis() {
  const rows = []
  let xjoWeekly = []
  let loaded = 0
  let missed = 0

  for (const def of ASX_INDEX_ANALYSIS_UNIVERSE) {
    let series = null
    try {
      series = await getCachedSeries(def.symbol, FROM, { staleOk: true })
    } catch {
      series = null
    }
    if (!series?.closes?.length) {
      missed += 1
      rows.push({
        symbol: def.symbol,
        code: def.code,
        name: def.name,
        kind: def.kind,
        error: 'No series',
        support20: null,
        resistance20: null,
        distSupport: null,
        distResistance: null,
        srStatus: null,
        rs: null,
        rsMom: null,
        sectorScore: null,
      })
      continue
    }
    loaded += 1
    const weekly = weeklyNewestFirst(series.closes)
    if (def.symbol === ASX_RS_BENCHMARK.symbol) xjoWeekly = weekly
    const sr = computeWeeklySr(weekly)
    const rs =
      def.kind === 'sector' && xjoWeekly.length ? computeSectorRs(weekly, xjoWeekly) : null
    rows.push({
      symbol: def.symbol,
      code: def.code,
      name: def.name,
      kind: def.kind,
      error: null,
      support20: sr?.support20 ?? null,
      resistance20: sr?.resistance20 ?? null,
      distSupport: sr?.distSupport ?? null,
      distResistance: sr?.distResistance ?? null,
      srStatus: sr?.srStatus ?? null,
      rs: rs?.rs ?? null,
      rsMom: rs?.rsMom ?? null,
      sectorScore: rs?.sectorScore ?? null,
      cache: series.meta?.cache || null,
    })
  }

  return {
    asOf: Date.now(),
    benchmark: ASX_RS_BENCHMARK.code,
    loaded,
    missed,
    rows,
  }
}

/** Fire-and-forget cache warm so the next Index Analysis tab open is fast. */
export function warmIndexAnalysisSeries() {
  void (async () => {
    for (const def of ASX_INDEX_ANALYSIS_UNIVERSE) {
      try {
        await getCachedSeries(def.symbol, FROM, { staleOk: true })
      } catch {
        /* best-effort */
      }
    }
  })()
}
