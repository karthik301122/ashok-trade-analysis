/**
 * Aggregate finer OHLC bars into a larger interval (e.g. 5m → 30m).
 * @param {Array<{ t: number, o: number, h: number, l: number, c: number, v?: number }>} bars
 * @param {number} targetMinutes bucket size in minutes
 */
export function aggregateOhlcBars(bars, targetMinutes) {
  if (!bars?.length || !Number.isFinite(targetMinutes) || targetMinutes <= 0) return bars
  const period = targetMinutes * 60
  const buckets = new Map()

  for (const b of bars) {
    const start = Math.floor(b.t / period) * period
    const existing = buckets.get(start)
    if (!existing) {
      buckets.set(start, {
        t: start,
        o: b.o,
        h: b.h,
        l: b.l,
        c: b.c,
        v: Number.isFinite(b.v) ? b.v : 0,
      })
      continue
    }
    existing.h = Math.max(existing.h, b.h)
    existing.l = Math.min(existing.l, b.l)
    existing.c = b.c
    existing.v += Number.isFinite(b.v) ? b.v : 0
  }

  return [...buckets.values()].sort((a, b) => a.t - b.t)
}

/** Minutes to aggregate to when EODHD cannot fetch natively (15m, 30m). */
export function eodhdAggregateMinutes(interval) {
  const raw = String(interval || '').toLowerCase()
  if (raw === '15m') return 15
  if (raw === '30m') return 30
  return null
}

/** EODHD fetch interval for a client request (may be finer than requested). */
export function eodhdSourceInterval(interval) {
  const raw = String(interval || '5m').toLowerCase()
  if (raw === '1m') return '1m'
  if (raw === '1h' || raw === '60m') return '1h'
  return '5m'
}
