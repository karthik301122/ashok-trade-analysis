/**
 * Server pattern scan job — identical hits for all users.
 * ASX200 early pass after desk-ready, then full snapshot universe.
 * Snapshot-metric specials + Stage 2 weekly from cached bars.
 */
import { getCachedSeries } from './getSeries.mjs'
import { upsertPatternScanBatch } from './patternScanStore.mjs'
import { savePatternHitsDay } from './patternHitsStore.mjs'
import { log } from './log.mjs'
import { tickersForUniverseId } from './eodhdIndexMembers.mjs'

/** Concurrent Stage-2 cache reads (full universe). */
const STAGE2_CONCURRENCY = 8
/** Soft cap per pattern in hits_json (counts stay exact). */
const MAX_HITS_PER_PATTERN = 500

const SNAPSHOT_PATTERN_IDS = [
  'star-3m',
  'rs-leader',
  'momentum-thrust',
  'rs-laggard',
  'volume-surge-long',
  'volume-breakdown',
  'dollar-flow',
  'triple-ma-stack',
  'ma-reset',
  'near-52w-high',
  'below-200-warning',
  'bullish-mood',
  'bearish-mood',
  'early-cycle',
  'mid-cycle-leader',
  'late-extended',
  'rsi-oversold-bounce',
  'rsi-overbought',
]

const PATTERN_META = {
  'star-3m': { name: '3M Star', bias: 'bullish' },
  'rs-leader': { name: 'RS Leader', bias: 'bullish' },
  'momentum-thrust': { name: 'Momentum Thrust', bias: 'bullish' },
  'rs-laggard': { name: 'RS Laggard', bias: 'bearish' },
  'volume-surge-long': { name: 'Volume Surge Long', bias: 'bullish' },
  'volume-breakdown': { name: 'Volume Breakdown', bias: 'bearish' },
  'dollar-flow': { name: 'Dollar Flow', bias: 'bullish' },
  'triple-ma-stack': { name: 'Triple MA Stack', bias: 'bullish' },
  'ma-reset': { name: 'MA Reset', bias: 'bullish' },
  'near-52w-high': { name: 'Near 52W High', bias: 'bullish' },
  'below-200-warning': { name: 'Below 200 Warning', bias: 'bearish' },
  'bullish-mood': { name: 'Bullish Mood', bias: 'bullish' },
  'bearish-mood': { name: 'Bearish Mood', bias: 'bearish' },
  'early-cycle': { name: 'Early Cycle', bias: 'bullish' },
  'mid-cycle-leader': { name: 'Mid Cycle Leader', bias: 'bullish' },
  'late-extended': { name: 'Late Extended', bias: 'neutral' },
  'rsi-oversold-bounce': { name: 'RSI Oversold Bounce', bias: 'bullish' },
  'rsi-overbought': { name: 'RSI Overbought', bias: 'bearish' },
  'stage-2': { name: 'Stage 2', bias: 'bullish' },
}

function clampScore(n) {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function rampUp(v, lo, hi) {
  if (!Number.isFinite(v)) return 0
  if (v <= lo) return 0
  if (v >= hi) return 100
  return ((v - lo) / (hi - lo)) * 100
}

function rampDown(v, lo, hi) {
  if (!Number.isFinite(v)) return 0
  if (v >= hi) return 0
  if (v <= lo) return 100
  return ((hi - v) / (hi - lo)) * 100
}

function blendScores(parts) {
  let w = 0
  let s = 0
  for (const p of parts) {
    const weight = Number(p.weight) || 1
    s += (Number(p.score) || 0) * weight
    w += weight
  }
  return w ? s / w : 0
}

function vsIndex3m(stock, indexM3) {
  return (stock.m3 ?? 0) - indexM3
}

function classifyMood(stock, vs) {
  if ((stock.m1 ?? 0) > 0 && vs > 0 && stock.above20ma) return 'bullish'
  if ((stock.m1 ?? 0) < 0 && vs < 0) return 'bearish'
  return 'neutral'
}

function evaluateConfirmed(patternId, s, ctx) {
  const vs = vsIndex3m(s, ctx.indexM3)
  switch (patternId) {
    case 'star-3m':
      return Boolean(s.star)
    case 'rs-leader':
      return (s.rs ?? 0) >= 70
    case 'momentum-thrust':
      return s.m3 > 8 && s.m1 > 0 && vs > 5
    case 'rs-laggard':
      return (s.rs ?? 0) < 40 && s.m3 < 0
    case 'volume-surge-long':
      return (s.relativeVolume ?? 0) >= 2 && s.m1 > 0 && s.above20ma
    case 'volume-breakdown':
      return (s.relativeVolume ?? 0) >= 2 && s.m1 < 0
    case 'dollar-flow':
      return (s.relativeVolume ?? 0) >= 1.5 && (s.dollarVolume ?? 0) >= ctx.dollarVolP90
    case 'triple-ma-stack':
      return s.above20ma && s.above50ma && s.above200ma
    case 'ma-reset':
      return s.above50ma && s.m1 > 0 && s.m3 > 0 && s.from52wHigh > -8
    case 'near-52w-high':
      return s.from52wHigh >= -3 && s.above50ma
    case 'below-200-warning':
      return !s.above200ma && s.m3 < 0
    case 'bullish-mood':
      return classifyMood(s, vs) === 'bullish'
    case 'bearish-mood':
      return classifyMood(s, vs) === 'bearish'
    case 'early-cycle':
      return s.cycle === 'early' && vs >= 2
    case 'mid-cycle-leader':
      return s.cycle === 'mid' && (s.rs ?? 0) >= 60 && s.above50ma
    case 'late-extended':
      return s.cycle === 'late' && s.from52wHigh > -5 && s.m1 < 2
    case 'rsi-oversold-bounce':
      return (s.rsi ?? 50) <= 35 && s.above200ma
    case 'rsi-overbought':
      return (s.rsi ?? 50) >= 70
    default:
      return false
  }
}

function formingScore(patternId, s, ctx) {
  const rs = s.rs ?? 0
  const rvol = s.relativeVolume ?? 0
  const vs = vsIndex3m(s, ctx.indexM3)
  const rsi = s.rsi ?? 50
  const dvol = s.dollarVolume ?? 0
  switch (patternId) {
    case 'star-3m':
      return s.star ? 100 : rampUp(s.m3, 0, 12)
    case 'rs-leader':
      return rampUp(rs, 40, 70)
    case 'momentum-thrust':
      return blendScores([
        { score: rampUp(s.m3, 2, 10), weight: 1.3 },
        { score: rampUp(s.m1, -1, 3), weight: 1 },
        { score: rampUp(vs, 0, 6), weight: 1.2 },
      ])
    case 'rs-laggard':
      return blendScores([
        { score: rampDown(rs, 35, 55), weight: 1.4 },
        { score: rampDown(s.m3, -8, 2), weight: 1 },
      ])
    case 'volume-surge-long':
      return blendScores([
        { score: rampUp(rvol, 1.1, 2.2), weight: 1.5 },
        { score: rampUp(s.m1, -1, 2), weight: 1 },
        { score: s.above20ma ? 100 : 20, weight: 0.8 },
      ])
    case 'volume-breakdown':
      return blendScores([
        { score: rampUp(rvol, 1.1, 2.2), weight: 1.5 },
        { score: rampDown(s.m1, -3, 1), weight: 1.2 },
      ])
    case 'dollar-flow':
      return blendScores([
        { score: rampUp(rvol, 1, 1.8), weight: 1 },
        { score: rampUp(dvol, ctx.dollarVolP90 * 0.5, ctx.dollarVolP90), weight: 1.4 },
      ])
    case 'triple-ma-stack':
      return blendScores([
        { score: s.above20ma ? 100 : 0, weight: 1 },
        { score: s.above50ma ? 100 : 0, weight: 1 },
        { score: s.above200ma ? 100 : 0, weight: 1 },
      ])
    case 'ma-reset':
      return blendScores([
        { score: s.above50ma ? 100 : 25, weight: 1 },
        { score: rampUp(s.m1, -2, 2), weight: 1 },
        { score: rampUp(s.m3, -2, 4), weight: 1 },
        { score: rampUp(s.from52wHigh, -20, -5), weight: 1 },
      ])
    case 'near-52w-high':
      return blendScores([
        { score: rampUp(s.from52wHigh, -15, -2), weight: 1.6 },
        { score: s.above50ma ? 100 : 30, weight: 1 },
      ])
    case 'below-200-warning':
      return blendScores([
        { score: s.above200ma ? 15 : 100, weight: 1.3 },
        { score: rampDown(s.m3, -10, 2), weight: 1 },
      ])
    case 'bullish-mood':
      return blendScores([
        { score: rampUp(vs, -2, 4), weight: 1.2 },
        { score: rampUp(s.m1, -2, 2), weight: 1 },
        { score: s.above20ma ? 100 : 25, weight: 1 },
      ])
    case 'bearish-mood':
      return blendScores([
        { score: rampDown(vs, -4, 2), weight: 1.2 },
        { score: rampDown(s.m1, -3, 2), weight: 1 },
        { score: s.above20ma ? 20 : 100, weight: 1 },
      ])
    case 'early-cycle':
      return blendScores([
        { score: s.cycle === 'early' ? 100 : s.cycle === 'mid' ? 35 : 10, weight: 1.4 },
        { score: rampUp(vs, -1, 4), weight: 1 },
      ])
    case 'mid-cycle-leader':
      return blendScores([
        { score: s.cycle === 'mid' ? 100 : 20, weight: 1.2 },
        { score: rampUp(rs, 45, 70), weight: 1.3 },
        { score: s.above50ma ? 100 : 25, weight: 1 },
      ])
    case 'late-extended':
      return blendScores([
        { score: s.cycle === 'late' ? 100 : 20, weight: 1.2 },
        { score: rampUp(s.from52wHigh, -15, -3), weight: 1.2 },
        { score: rampDown(s.m1, -1, 4), weight: 1 },
      ])
    case 'rsi-oversold-bounce':
      return blendScores([
        { score: rampDown(rsi, 30, 45), weight: 1.5 },
        { score: s.above200ma ? 100 : 30, weight: 1 },
      ])
    case 'rsi-overbought':
      return rampUp(rsi, 55, 75)
    default:
      return 0
  }
}

function scoreSnapshot(patternId, s, ctx) {
  const confirmed = evaluateConfirmed(patternId, s, ctx)
  if (confirmed) return { score: 100, confirmed: true }
  return { score: clampScore(formingScore(patternId, s, ctx)), confirmed: false }
}

function loadAsx200Tickers() {
  const fromMembers = tickersForUniverseId('asx200')
  if (fromMembers.length >= 50) return fromMembers
  // Fallback: whatever members file has (even if small).
  return fromMembers.length ? fromMembers : []
}

function toWeeklyNewestFirst(closes) {
  /** @type {{ t: number, o: number, h: number, l: number, c: number, v: number }[]} */
  const weeks = []
  let cur = null
  for (const b of closes) {
    const d = new Date((b.t < 1e12 ? b.t : b.t / 1000) * 1000)
    const day = d.getUTCDay()
    const weekKey = `${d.getUTCFullYear()}-W${Math.floor(
      (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) -
        Date.UTC(d.getUTCFullYear(), 0, 1)) /
        604800000,
    )}`
    if (!cur || cur._key !== weekKey) {
      if (cur) weeks.push(cur)
      cur = {
        _key: weekKey,
        t: b.t < 1e12 ? b.t : Math.floor(b.t / 1000),
        o: b.o ?? b.c,
        h: b.h ?? b.c,
        l: b.l ?? b.c,
        c: b.c,
        v: b.v ?? 0,
      }
    } else {
      cur.h = Math.max(cur.h, b.h ?? b.c)
      cur.l = Math.min(cur.l, b.l ?? b.c)
      cur.c = b.c
      cur.v += b.v ?? 0
      cur.t = b.t < 1e12 ? b.t : Math.floor(b.t / 1000)
    }
    void day
  }
  if (cur) weeks.push(cur)
  return weeks.reverse().map(({ t, o, h, l, c, v }) => ({ t, o, h, l, c, v }))
}

function smaAt(closes, i, period) {
  if (i + period > closes.length) return null
  let s = 0
  for (let k = 0; k < period; k++) s += closes[i + k]
  return s / period
}

function isStage2Weekly(weeks) {
  const need = 42
  if (weeks.length < need) return false
  const closes = weeks.map((w) => w.c)
  const c = closes[0]
  const ma10 = smaAt(closes, 0, 10)
  const ma30 = smaAt(closes, 0, 30)
  const ma40 = smaAt(closes, 0, 40)
  const ma30Prev = smaAt(closes, 2, 30)
  const ma40Prev = smaAt(closes, 2, 40)
  if (ma10 == null || ma30 == null || ma40 == null || ma30Prev == null || ma40Prev == null) {
    return false
  }
  return ma10 > ma30 && ma30 > ma40 && ma30 > ma30Prev && ma40 > ma40Prev && c > ma10 && c > ma30 && c > ma40
}

function tradingDayAsOf(builtAt = Date.now()) {
  return new Date(builtAt).toISOString().slice(0, 10)
}

let running = false
/** @type {object | null} */
let pendingOpts = null

/**
 * @param {'asx200' | 'all' | string} universe
 * @param {object[]} allStocks
 */
function selectStocksForUniverse(universe, allStocks) {
  if (universe === 'all' || universe === 'full') {
    return allStocks.filter((s) => s?.ticker)
  }
  const asxTickers = new Set(loadAsx200Tickers().map((t) => String(t).toUpperCase()))
  if (asxTickers.size) {
    return allStocks.filter((s) => asxTickers.has(String(s.ticker || '').toUpperCase()))
  }
  return allStocks.slice(0, 200)
}

/**
 * Prefer confirmed, then higher score; keep at most MAX_HITS_PER_PATTERN per patternId.
 * @param {object[]} hits
 */
function capHitsForPayload(hits) {
  /** @type {Map<string, object[]>} */
  const byPattern = new Map()
  for (const h of hits) {
    const id = String(h.patternId || '')
    let list = byPattern.get(id)
    if (!list) {
      list = []
      byPattern.set(id, list)
    }
    list.push(h)
  }
  const out = []
  for (const list of byPattern.values()) {
    list.sort((a, b) => {
      const ac = a.confirmed ? 1 : 0
      const bc = b.confirmed ? 1 : 0
      if (bc !== ac) return bc - ac
      return (Number(b.score) || 0) - (Number(a.score) || 0)
    })
    out.push(...list.slice(0, MAX_HITS_PER_PATTERN))
  }
  return out
}

async function mapPool(items, concurrency, fn) {
  let i = 0
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
}

/**
 * @param {{ stocks?: Record<string, object>, indexM3?: number, universe?: 'asx200' | 'all' }} opts
 */
export async function runDeskPatternJob(opts = {}) {
  if (running) {
    pendingOpts = preferPending(pendingOpts, opts)
    return { started: false, reason: 'already-running', queued: true }
  }
  running = true
  const started = Date.now()
  try {
    const universe = opts.universe === 'all' || opts.universe === 'full' ? 'all' : 'asx200'
    let stocks = opts.stocks || null
    let indexM3 = Number(opts.indexM3)
    if (!stocks) {
      const { readMarketSnapshotDbRow } = await import('./snapshotJob.mjs')
      const snap = await readMarketSnapshotDbRow()
      stocks = snap?.stocks || {}
      indexM3 = Number(snap?.indexPerf?.m3) || 0
    }
    if (!Number.isFinite(indexM3)) indexM3 = 0

    const all = Object.values(stocks)
    const list = selectStocksForUniverse(universe, all)
    const vols = list
      .map((s) => Number(s.dollarVolume) || 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b)
    const dollarVolP90 = vols.length ? vols[Math.floor(vols.length * 0.9)] : 0
    const ctx = { indexM3, dollarVolP90 }

    /** @type {object[]} */
    const hits = []
    /** @type {{ ticker: string, patternId: string, score: number, confirmed: boolean }[]} */
    const upload = []
    /** @type {Record<string, number>} */
    const counts = {}

    for (const s of list) {
      for (const patternId of SNAPSHOT_PATTERN_IDS) {
        const { score, confirmed } = scoreSnapshot(patternId, s, ctx)
        if (score < 60) continue
        const meta = PATTERN_META[patternId] || { name: patternId, bias: 'neutral' }
        hits.push({
          patternId,
          patternName: meta.name,
          bias: meta.bias,
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
          kind: 'snapshot',
        })
        upload.push({ ticker: s.ticker, patternId, score, confirmed })
        counts[patternId] = (counts[patternId] || 0) + 1
      }
    }

    // Stage 2 from cached OHLC (identical for all users).
    let stage2 = 0
    await mapPool(list, STAGE2_CONCURRENCY, async (s) => {
      try {
        const series = await getCachedSeries(s.ticker, '2023-01-01', { staleOk: true })
        if (!series?.closes?.length) return
        const weeks = toWeeklyNewestFirst(series.closes)
        if (!isStage2Weekly(weeks)) return
        stage2 += 1
        hits.push({
          patternId: 'stage-2',
          patternName: 'Stage 2',
          bias: 'bullish',
          ticker: s.ticker,
          name: s.name,
          sector: s.sector,
          industry: s.industry,
          rs: Math.round(s.rs ?? 0),
          m3: s.m3,
          relativeVolume: s.relativeVolume ?? 0,
          rsi: s.rsi ?? 50,
          lastPrice: s.lastPrice ?? 0,
          score: 100,
          confirmed: true,
          kind: 'weekly',
        })
        upload.push({ ticker: s.ticker, patternId: 'stage-2', score: 100, confirmed: true })
      } catch {
        /* skip ticker */
      }
    })
    counts['stage-2'] = stage2

    const asOf = tradingDayAsOf()
    // Batch uploads to avoid giant single statements on full universe.
    const BATCH = 800
    for (let i = 0; i < upload.length; i += BATCH) {
      await upsertPatternScanBatch(upload.slice(i, i + BATCH))
    }
    const payloadHits = universe === 'all' ? capHitsForPayload(hits) : hits
    await savePatternHitsDay({ asOf, universe, hits: payloadHits, counts })
    log('info', 'pattern.job.done', {
      asOf,
      universe,
      stocks: list.length,
      hits: hits.length,
      hitsStored: payloadHits.length,
      stage2,
      ms: Date.now() - started,
    })
    return { started: true, asOf, universe, hits: hits.length, hitsStored: payloadHits.length, counts }
  } catch (err) {
    log('error', 'pattern.job.error', {
      message: err instanceof Error ? err.message : String(err),
    })
    return { started: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    running = false
    const next = pendingOpts
    pendingOpts = null
    if (next) {
      void runDeskPatternJob(next).catch(() => {})
    }
  }
}

/** Prefer a full-universe run over an ASX200-only queued run. */
function preferPending(current, incoming) {
  if (!current) return incoming
  const curAll = current.universe === 'all' || current.universe === 'full'
  const inAll = incoming.universe === 'all' || incoming.universe === 'full'
  if (inAll && !curAll) return incoming
  if (curAll) return { ...current, stocks: incoming.stocks || current.stocks, indexM3: incoming.indexM3 ?? current.indexM3 }
  return incoming
}

export function maybeStartDeskPatternJob(opts = {}) {
  void runDeskPatternJob(opts).catch(() => {})
}

/** After full desk snapshot — scan every stock in the snapshot. */
export function maybeStartFullUniversePatternJob(opts = {}) {
  void runDeskPatternJob({ ...opts, universe: 'all' }).catch(() => {})
}
