import type { OhlcBar } from './types'

/** Synthetic daily bars starting at unix day 0. */
export function makeBars(
  closes: number[],
  opts?: { startT?: number; vol?: number },
): OhlcBar[] {
  const startT = opts?.startT ?? 1_700_000_000
  const vol = opts?.vol ?? 1_000_000
  return closes.map((c, i) => {
    const prev = i === 0 ? c : closes[i - 1]
    const o = prev
    const h = Math.max(o, c) * 1.005
    const l = Math.min(o, c) * 0.995
    return {
      t: startT + i * 86400,
      o,
      h,
      l,
      c,
      v: vol,
    }
  })
}

/** U-shaped cup then shallow handle — should fire Cup & Handle. */
export function cupAndHandleCloses(): number[] {
  const left = Array.from({ length: 15 }, (_, i) => 100 - i * 0.3)
  const bottom = Array.from({ length: 30 }, (_, i) => {
    const x = (i - 15) / 15
    return 85 + x * x * 15
  })
  const right = Array.from({ length: 20 }, (_, i) => 88 + i * 0.55)
  const handle = Array.from({ length: 15 }, (_, i) => 99 - (i < 8 ? i * 0.4 : (14 - i) * 0.35))
  return [...left, ...bottom, ...right, ...handle]
}

/** Contracting highs+lows — triangle squeeze / symmetrical. */
export function triangleSqueezeCloses(): number[] {
  const out: number[] = []
  let mid = 100
  for (let i = 0; i < 60; i++) {
    const amp = 8 * (1 - i / 70)
    out.push(mid + (i % 2 === 0 ? amp : -amp * 0.9))
    mid += 0.02
  }
  return out
}

/** Impulse up then tight flag. */
export function bullFlagCloses(): number[] {
  const impulse = Array.from({ length: 20 }, (_, i) => 80 + i * 1.2)
  const flag = Array.from({ length: 12 }, (_, i) => 104 - i * 0.15)
  return [...impulse, ...flag]
}
