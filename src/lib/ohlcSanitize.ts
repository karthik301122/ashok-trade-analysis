/**
 * Drop invalid / zero / stray intraday ticks that blow up chart autoscale.
 */
export function sanitizeOhlcBars(
  bars: { t: number; o: number; h: number; l: number; c: number; v?: number }[],
): typeof bars {
  if (!bars.length) return bars

  const valid = bars.filter((b) => {
    if (!Number.isFinite(b.t)) return false
    const { o, h, l, c } = b
    if (!Number.isFinite(c) || c <= 0) return false
    if (!Number.isFinite(o) || o <= 0) return false
    if (!Number.isFinite(h) || h <= 0) return false
    if (!Number.isFinite(l) || l <= 0) return false
    if (h < l) return false
    if (h < Math.min(o, c) - 0.0001) return false
    if (l > Math.max(o, c) + 0.0001) return false
    return true
  })

  if (valid.length < 3) return valid

  const closes = valid.map((b) => b.c).sort((a, b) => a - b)
  const median = closes[Math.floor(closes.length / 2)]
  if (!Number.isFinite(median) || median <= 0) return valid

  const floor = median * 0.2
  const ceiling = median * 5
  return valid.filter((b) => b.c >= floor && b.c <= ceiling && b.l >= floor && b.h <= ceiling)
}
