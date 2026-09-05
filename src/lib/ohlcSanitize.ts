/**
 * Drop invalid / zero / isolated spike ticks that blow up chart autoscale.
 * Does NOT use a global median band — that wrongly truncates stocks that re-rate
 * after long periods at tiny prices (e.g. JNS run from ~$0.15 to ~$0.65).
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

  // Drop only isolated spikes vs both neighbors (bad ticks), not regime changes.
  const SPIKE = 20
  return valid.filter((b, i) => {
    if (i === 0 || i === valid.length - 1) return true
    const prev = valid[i - 1].c
    const next = valid[i + 1].c
    if (!Number.isFinite(prev) || !Number.isFinite(next) || prev <= 0 || next <= 0) return true
    const vsPrev = b.c / prev
    const vsNext = b.c / next
    const spikeUp = vsPrev > SPIKE && vsNext > SPIKE
    const spikeDown = vsPrev < 1 / SPIKE && vsNext < 1 / SPIKE
    return !spikeUp && !spikeDown
  })
}
