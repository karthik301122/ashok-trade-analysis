/**
 * Shared perf math for server snapshot job (mirrors src/lib/liveMarket seriesToCachedPerf).
 */

function round1(n) {
  return Math.round(n * 10) / 10
}

function returnOver(closes, tradingDays) {
  if (closes.length < tradingDays + 1) return null
  const a = closes[closes.length - 1]
  const b = closes[closes.length - 1 - tradingDays]
  if (!b) return null
  return ((a - b) / b) * 100
}

function sma(values, period) {
  if (values.length < period) return null
  const slice = values.slice(-period)
  return slice.reduce((s, v) => s + v, 0) / period
}

function ema(values, period) {
  if (values.length < period) return null
  const k = 2 / (period + 1)
  let e = values.slice(0, period).reduce((s, v) => s + v, 0) / period
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k)
  return e
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

/**
 * @param {{ closes: { t: number, c: number, v?: number }[], high52: number }} series
 * @param {number} indexM3
 */
export function seriesToCachedPerf(series, indexM3) {
  const closes = series.closes.map((b) => b.c)
  const vols = series.closes.map((b) => (typeof b.v === 'number' && Number.isFinite(b.v) ? b.v : 0))
  const last = closes[closes.length - 1]

  const d1 = returnOver(closes, 1) ?? 0
  const w1 = returnOver(closes, 5) ?? 0
  const m1 = returnOver(closes, 21) ?? 0
  const m3 = returnOver(closes, 63) ?? 0
  const m6 = returnOver(closes, 126) ?? 0
  const y1 = returnOver(closes, 252) ?? 0
  const y5 =
    returnOver(closes, Math.min(252 * 5, Math.max(closes.length - 1, 1))) ?? y1

  const ma200 = closes.length >= 200 ? sma(closes, 200) : null
  const ma50 = closes.length >= 50 ? sma(closes, 50) : null
  const ma20 = closes.length >= 20 ? sma(closes, 20) : null
  const e21 = closes.length >= 21 ? ema(closes, 21) : null

  const from52wHigh = series.high52 ? ((last - series.high52) / series.high52) * 100 : 0
  const rawRs = 50 + (m3 - indexM3) * 2.2
  const rs = Math.round(Math.max(1, Math.min(99, rawRs)))

  const sparkSrc = closes.slice(-24)
  const base = sparkSrc[0] || last
  const spark = sparkSrc.map((c) => round1((c / base) * 100))

  const volume = vols[vols.length - 1] || 0
  const lookback = vols.slice(-21, -1)
  const avgVolume20 =
    lookback.length > 0 ? lookback.reduce((a, b) => a + b, 0) / lookback.length : volume
  const relativeVolume = avgVolume20 > 0 ? volume / avgVolume20 : 0
  const dollarVolume = volume * last

  return {
    d1: round1(d1),
    w1: round1(w1),
    m1: round1(m1),
    m3: round1(m3),
    m6: round1(m6),
    y1: round1(y1),
    y5: round1(y5),
    from52wHigh: round1(from52wHigh),
    above200ma: ma200 != null ? last > ma200 : false,
    above50ma: ma50 != null ? last > ma50 : false,
    above21ema: e21 != null ? last > e21 : false,
    above20ma: ma20 != null ? last > ma20 : false,
    rs,
    spark: spark.length ? spark : [100],
    volume: Math.round(volume),
    avgVolume20: Math.round(avgVolume20),
    relativeVolume: round1(relativeVolume),
    dollarVolume: Math.round(dollarVolume),
    rsi: rsi(closes, 14) ?? 50,
  }
}

export async function mapPool(items, concurrency, fn, onProgress, delayMs = 20) {
  const results = new Array(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      done++
      onProgress?.(done, items.length)
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  )
  return results
}
