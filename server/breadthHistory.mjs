import { getDb } from './db.mjs'
import { UNIVERSE_IDS } from './breadthStore.mjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const universePath = path.join(__dirname, '..', 'src', 'data', 'asxUniverse.json')

const INDEX_SYMBOL = '^AXJO'
const DEFAULT_DAYS = 63

function loadUniverseRows() {
  return JSON.parse(fs.readFileSync(universePath, 'utf8'))
}

function stockMapKeys(stocks) {
  if (!stocks) return new Set()
  if (Array.isArray(stocks)) return new Set(stocks.map((s) => s.ticker).filter(Boolean))
  return new Set(Object.keys(stocks))
}

function toBarSymbol(ticker) {
  const t = String(ticker).toUpperCase()
  if (t.startsWith('^')) return t
  return t.endsWith('.AX') ? t : `${t}.AX`
}

/**
 * @param {Array<{ ticker: string, weight?: number }> | Record<string, unknown>} stocks
 * @param {string} universeId
 */
function universeTickers(stocks, universeId) {
  const available = stockMapKeys(stocks)
  const ranked = loadUniverseRows()
    .filter((u) => available.has(u.ticker))
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
  if (universeId === 'asx200') return ranked.slice(0, 200).map((s) => s.ticker)
  if (universeId === 'asx500') return ranked.slice(0, 500).map((s) => s.ticker)
  if (universeId === 'mid') return ranked.slice(200, 500).map((s) => s.ticker)
  return ranked.slice(500).map((s) => s.ticker)
}

function round1(n) {
  return Math.round(n * 10) / 10
}

function sma(values, period) {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

function rsi(values, period = 14) {
  if (values.length < period + 1) return null
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1]
    if (d >= 0) avgGain += d
    else avgLoss -= d
  }
  avgGain /= period
  avgLoss /= period
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
  }
  if (avgLoss === 0) return 100
  return 100 - 100 / (1 + avgGain / avgLoss)
}

function returnOver(closes, days) {
  if (closes.length < days + 1) return null
  const a = closes[closes.length - 1]
  const b = closes[closes.length - 1 - days]
  if (!b) return null
  return ((a - b) / b) * 100
}

function high52UpTo(bars) {
  if (!bars.length) return 0
  const lastT = bars[bars.length - 1].t
  const yearAgo = lastT - 365 * 86400
  let hi = bars[bars.length - 1].h
  for (const b of bars) {
    if (b.t >= yearAgo && b.h > hi) hi = b.h
  }
  return hi
}

function barsUpTo(sorted, t) {
  if (!sorted.length) return []
  let lo = 0
  let hi = sorted.length - 1
  if (t < sorted[0].t) return []
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (sorted[mid].t <= t) lo = mid
    else hi = mid - 1
  }
  return sorted.slice(0, lo + 1)
}

function loadBarsMap(tickers) {
  const db = getDb()
  const map = new Map()
  const symbolToTicker = new Map()
  for (const t of tickers) {
    map.set(t, [])
    symbolToTicker.set(toBarSymbol(t), t)
  }
  const symbols = [...new Set(tickers.map(toBarSymbol))]
  if (symbols.includes(INDEX_SYMBOL) === false) {
    symbols.push(INDEX_SYMBOL)
    symbolToTicker.set(INDEX_SYMBOL, INDEX_SYMBOL)
    map.set(INDEX_SYMBOL, [])
  }
  const CHUNK = 100
  for (let i = 0; i < symbols.length; i += CHUNK) {
    const chunk = symbols.slice(i, i + CHUNK)
    if (!chunk.length) continue
    const ph = chunk.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT symbol, t, o, h, l, c, v FROM bars WHERE symbol IN (${ph}) ORDER BY symbol, t`,
      )
      .all(...chunk)
    for (const r of rows) {
      const key = symbolToTicker.get(r.symbol) ?? r.symbol
      const list = map.get(key)
      if (list) list.push(r)
    }
  }
  return map
}

/** @type {{ builtAt: number, universe: string, points: object[] } | null} */
let chartCache = null

/**
 * Reconstruct ~3 months of breadth chart points from SQLite OHLCV bars.
 * @param {string} universeId
 * @param {Array<{ ticker: string, weight?: number }> | Record<string, unknown>} stocks
 * @param {number} builtAt snapshot built_at ms
 * @param {number} [days]
 */
export function computeBreadthChartHistory(universeId, stocks, builtAt, days = DEFAULT_DAYS) {
  if (!UNIVERSE_IDS.has(universeId) || !stockMapKeys(stocks).size) return []
  if (
    chartCache &&
    chartCache.builtAt === builtAt &&
    chartCache.universe === universeId &&
    chartCache.points.length
  ) {
    return chartCache.points
  }

  const tickers = universeTickers(stocks, universeId)
  if (!tickers.length) return []

  const barsMap = loadBarsMap(tickers)
  const indexBars = barsMap.get(INDEX_SYMBOL) ?? []
  const refBars = indexBars.length >= 25 ? indexBars : barsMap.get(tickers[0]) ?? []
  if (refBars.length < 25) return []

  const sessions = refBars.slice(-days)
  const indexRet20ByT = new Map()
  for (const bar of sessions) {
    const idxSlice = barsUpTo(indexBars, bar.t)
    if (idxSlice.length >= 21) {
      const closes = idxSlice.map((b) => b.c)
      indexRet20ByT.set(bar.t, returnOver(closes, 20) ?? 0)
    }
  }

  const points = []
  for (const session of sessions) {
    const t = session.t
    const day = new Date(t * 1000).toISOString().slice(0, 10)
    let counted = 0
    let a20 = 0
    let a50 = 0
    let a200 = 0
    let adv = 0
    let dec = 0
    let rsi50 = 0
    let rsi70 = 0
    let rsi30 = 0
    let rs50 = 0
    let rvol15 = 0
    let near52w = 0
    const indexRet20 = indexRet20ByT.get(t) ?? 0

    for (const sym of tickers) {
      const all = barsMap.get(sym)
      if (!all?.length) continue
      const slice = barsUpTo(all, t)
      if (slice.length < 21) continue
      const closes = slice.map((b) => b.c)
      const last = closes[closes.length - 1]
      const prev = closes.length > 1 ? closes[closes.length - 2] : last
      const ma20 = sma(closes, 20)
      const ma50 = sma(closes, 50)
      const ma200 = closes.length >= 200 ? sma(closes, 200) : null
      if (ma20 != null && last >= ma20) a20++
      if (ma50 != null && last >= ma50) a50++
      if (ma200 != null && last >= ma200) a200++
      if (last > prev) adv++
      else if (last < prev) dec++

      const r = rsi(closes, 14)
      if (r != null) {
        if (r >= 50) rsi50++
        if (r >= 70) rsi70++
        if (r <= 30) rsi30++
      }

      const stockRet20 = returnOver(closes, 20)
      if (stockRet20 != null && stockRet20 - indexRet20 >= 0) rs50++

      const vols = slice.map((b) => b.v ?? 0)
      const vol = vols[vols.length - 1]
      const volLook = vols.slice(-21, -1)
      const avgVol = volLook.length ? volLook.reduce((a, b) => a + b, 0) / volLook.length : vol
      if (avgVol > 0 && vol / avgVol >= 1.5) rvol15++

      const hi52 = high52UpTo(slice)
      if (hi52 > 0 && ((last - hi52) / hi52) * 100 >= -5) near52w++

      counted++
    }

    const denom = counted || 1
    points.push({
      day,
      above20: round1((a20 / denom) * 100),
      above50: round1((a50 / denom) * 100),
      above200: round1((a200 / denom) * 100),
      rsi50: round1((rsi50 / denom) * 100),
      adNet: adv - dec,
      advancing: adv,
      declining: dec,
      near52w: round1((near52w / denom) * 100),
      rsi70: round1((rsi70 / denom) * 100),
      rsi30: round1((rsi30 / denom) * 100),
      rs50: round1((rs50 / denom) * 100),
      rvol15: round1((rvol15 / denom) * 100),
    })
  }

  chartCache = { builtAt, universe: universeId, points }
  return points
}

export function clearBreadthChartCache() {
  chartCache = null
}
